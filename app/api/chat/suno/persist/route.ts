import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { ZodError } from 'zod';
import { appendUsageEvent } from '@/lib/usageMonitor';
import { saveGeneratedMusic } from '@/lib/generatedMusicStore';
import { runStorageRetention } from '@/lib/storageMonitor';
import { getVisitorId, hasTaskAccess, isAllowedMediaSource, persistRequestSchema } from '@/lib/sunoSecurity';

export const runtime = 'nodejs';

const PROXY_PREFIX = '/api/chat/suno/blob';
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type PersistedMedia = { url: string; pathname: string | null };
type PersistedItem = { id: string; audioUrl: string; imageUrl: string; audioPath: string | null; imagePath: string | null };

function isProxied(url: string) {
  return url.startsWith(`${PROXY_PREFIX}?`);
}

function getProxiedPath(url: string) {
  if (!isProxied(url)) return null;
  return new URLSearchParams(url.slice(url.indexOf('?') + 1)).get('path');
}

function toProxyUrl(pathname: string, taskToken: string) {
  const params = new URLSearchParams({ path: pathname, token: taskToken });
  return `${PROXY_PREFIX}?${params.toString()}`;
}

async function downloadMedia(sourceUrl: string, expectedType: 'audio' | 'image', maxBytes: number) {
  const response = await fetch(sourceUrl, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.body) throw new Error('Source media is unavailable');

  const contentLength = Number(response.headers.get('content-length') || 0);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if ((contentLength > 0 && contentLength > maxBytes) || (contentType && !contentType.startsWith(`${expectedType}/`))) {
    throw new Error('Source media type or size is invalid');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Source media exceeds the size limit');
    }
    chunks.push(value);
  }
  return { buffer: Buffer.concat(chunks), contentType: contentType || (expectedType === 'audio' ? 'audio/mpeg' : 'image/jpeg') };
}

async function persistToBlob(
  sourceUrl: string | undefined,
  pathname: string,
  expectedType: 'audio' | 'image',
  taskToken: string
) {
  if (!sourceUrl) return { url: '', pathname: null } satisfies PersistedMedia;
  if (isProxied(sourceUrl)) return { url: sourceUrl, pathname: getProxiedPath(sourceUrl) } satisfies PersistedMedia;
  if (!isAllowedMediaSource(sourceUrl)) return { url: sourceUrl, pathname: null } satisfies PersistedMedia;

  try {
    const media = await downloadMedia(sourceUrl, expectedType, expectedType === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES);
    await put(pathname, media.buffer, {
      access: 'private',
      contentType: media.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      ...(process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {}),
    });
    return { url: toProxyUrl(pathname, taskToken), pathname } satisfies PersistedMedia;
  } catch {
    // A failed optional cache must not stop playback from the original provider URL.
    return { url: sourceUrl, pathname: null } satisfies PersistedMedia;
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let taskId: string | undefined;

  try {
    const input = persistRequestSchema.parse(await request.json());
    const validatedTaskId = input.taskId;
    taskId = validatedTaskId;
    const taskToken = request.headers.get('x-task-access-token') || '';
    if (!hasTaskAccess(request, taskId)) {
      return NextResponse.json({ error: 'Task access is not authorized' }, { status: 401 });
    }

    const persisted: PersistedItem[] = await Promise.all(input.items.map(async (item) => {
      const [audio, image] = await Promise.all([
        persistToBlob(item.audioUrl, `music/${taskId}/${item.id}.mp3`, 'audio', taskToken),
        persistToBlob(item.imageUrl, `music/${taskId}/${item.id}.jpg`, 'image', taskToken),
      ]);
      return {
        id: item.id,
        audioUrl: audio.url,
        imageUrl: image.url,
        audioPath: audio.pathname,
        imagePath: image.pathname,
      };
    }));

    const visitorId = getVisitorId(request) || 'anonymous';
    const metadataById = new Map(input.items.map((item) => [item.id, item]));
    await saveGeneratedMusic(persisted.map((item) => {
      const metadata = metadataById.get(item.id)!;
      return {
        taskId: validatedTaskId,
        trackId: item.id,
        visitorId,
        title: metadata.title,
        tags: metadata.tags || '',
        audioUrl: item.audioUrl,
        imageUrl: item.imageUrl,
        audioPath: item.audioPath,
        imagePath: item.imagePath,
        prompt: metadata.prompt || '',
        negativeTags: metadata.negativeTags || '',
        model: metadata.model || '',
        duration: metadata.duration || 0,
      };
    }));

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/persist', status: 'success', statusCode: 200,
      durationMs: Date.now() - startedAt, taskId,
    });
    try {
      await runStorageRetention({
        trigger: 'persist',
        protectedTrackKeys: persisted.map((item) => `${validatedTaskId}:${item.id}`),
      });
    } catch (cleanupError) {
      console.error('Post-persist storage cleanup failed:', cleanupError);
    }
    return NextResponse.json({ items: persisted }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof ZodError ? 400 : 500;
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/persist', status: 'error', statusCode: status,
      durationMs: Date.now() - startedAt, taskId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: status === 400 ? 'Invalid persist request' : 'Persist failed' }, { status });
  }
}
