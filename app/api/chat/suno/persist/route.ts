import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { appendUsageEvent } from '@/lib/usageMonitor';

export const runtime = 'nodejs';

interface PersistItemInput {
  id: string;
  audioUrl?: string;
  imageUrl?: string;
}

interface PersistItemOutput {
  id: string;
  audioUrl: string;
  imageUrl: string;
}

// 私有 Blob 不能直接公开访问，改为经自建代理路由读取。
// 已经是代理链接的无需再转存（幂等，避免重复上传）。
const PROXY_PREFIX = '/api/chat/suno/blob';
const isProxied = (url: string) => url.startsWith(PROXY_PREFIX);
const toProxyUrl = (pathname: string) => `${PROXY_PREFIX}?path=${encodeURIComponent(pathname)}`;

// 下载一个远程 URL 并转存到私有 Vercel Blob，返回代理 URL；失败时回退原始 URL
const persistToBlob = async (
  sourceUrl: string | undefined,
  pathname: string,
  contentType: string
): Promise<string> => {
  if (!sourceUrl) return '';
  if (isProxied(sourceUrl)) return sourceUrl;

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return sourceUrl;

    const buffer = Buffer.from(await response.arrayBuffer());
    await put(pathname, buffer, {
      access: 'private',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return toProxyUrl(pathname);
  } catch {
    // 单项转存失败：降级回退原始 URL，不影响其他项与整体流程
    return sourceUrl;
  }
};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let taskId: string | undefined;

  try {
    const body = await request.json();
    taskId = body?.taskId;
    const items: PersistItemInput[] = Array.isArray(body?.items) ? body.items : [];

    if (!taskId || items.length === 0) {
      return NextResponse.json({ error: 'taskId and items are required' }, { status: 400 });
    }

    const persisted: PersistItemOutput[] = await Promise.all(
      items.map(async (item) => {
        const [audioUrl, imageUrl] = await Promise.all([
          persistToBlob(item.audioUrl, `music/${taskId}/${item.id}.mp3`, 'audio/mpeg'),
          persistToBlob(item.imageUrl, `music/${taskId}/${item.id}.jpg`, 'image/jpeg'),
        ]);

        return { id: item.id, audioUrl, imageUrl };
      })
    );

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/persist',
      status: 'success',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      taskId,
    });

    return NextResponse.json({ items: persisted });
  } catch (error) {
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/persist',
      status: 'error',
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        error: 'Persist failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
