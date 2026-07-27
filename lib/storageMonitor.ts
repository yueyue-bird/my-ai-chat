import { del, get, list, put, type ListBlobResultBlob } from '@vercel/blob';
import {
  readGeneratedMusic,
  updateGeneratedMusicPersistence,
  type GeneratedMusicRecord,
} from '@/lib/generatedMusicStore';
import { isAllowedMediaSource } from '@/lib/sunoSecurity';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN
  ? { token: process.env.BLOB_READ_WRITE_TOKEN }
  : {};

export type StorageTrackStatus = 'permanent' | 'temporary' | 'missing';

export type StorageTrackHealth = {
  taskId: string;
  trackId: string;
  visitorId: string;
  title: string;
  createdAt: string;
  audioStatus: StorageTrackStatus;
  imageStatus: StorageTrackStatus;
  audioReason: string;
  imageReason: string;
  audioPath: string | null;
  imagePath: string | null;
  audioBytes: number;
  imageBytes: number;
  sourceHost: string;
};

export type StorageHealthReport = {
  checkedAt: string;
  databaseRecords: number;
  permanentAudio: number;
  temporaryAudio: number;
  missingAudio: number;
  permanentImages: number;
  blobFiles: number;
  orphanFiles: number;
  totalBlobBytes: number;
  readProbe: { ok: boolean; path: string; error: string };
  tracks: StorageTrackHealth[];
  orphans: Array<{ pathname: string; size: number; uploadedAt: string }>;
};

function getSourceHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function reasonFor(recordUrl: string, pathname: string | null, exists: boolean) {
  if (pathname && !exists) return '数据库已有路径，但 Blob 文件不存在';
  if (pathname && exists) return '已转存到私有 Blob';
  if (!recordUrl) return '上游没有返回媒体地址';
  if (recordUrl.startsWith('/api/chat/suno/blob')) return '原始地址已丢失，无法自动重试';
  if (!isAllowedMediaSource(recordUrl)) return '媒体域名不在 SUNO_MEDIA_ALLOWED_HOSTS';
  return '下载超时、类型/大小校验或 Blob 上传曾失败';
}

async function listAllMusicBlobs() {
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  do {
    const result = await list({ prefix: 'music/', limit: 1000, cursor, ...blobToken() });
    blobs.push(...result.blobs);
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  return blobs;
}

function mapTrack(record: GeneratedMusicRecord, blobs: Map<string, ListBlobResultBlob>): StorageTrackHealth {
  const audioBlob = record.audioPath ? blobs.get(record.audioPath) : undefined;
  const imageBlob = record.imagePath ? blobs.get(record.imagePath) : undefined;
  const audioStatus: StorageTrackStatus = record.audioPath ? (audioBlob ? 'permanent' : 'missing') : 'temporary';
  const imageStatus: StorageTrackStatus = record.imagePath ? (imageBlob ? 'permanent' : 'missing') : 'temporary';

  return {
    taskId: record.taskId,
    trackId: record.trackId,
    visitorId: record.visitorId,
    title: record.title,
    createdAt: record.createdAt,
    audioStatus,
    imageStatus,
    audioReason: reasonFor(record.audioUrl, record.audioPath, Boolean(audioBlob)),
    imageReason: reasonFor(record.imageUrl, record.imagePath, Boolean(imageBlob)),
    audioPath: record.audioPath,
    imagePath: record.imagePath,
    audioBytes: audioBlob?.size || 0,
    imageBytes: imageBlob?.size || 0,
    sourceHost: getSourceHost(record.audioUrl),
  };
}

export async function buildStorageHealthReport(): Promise<StorageHealthReport> {
  const [music, blobList] = await Promise.all([
    readGeneratedMusic({ limit: 1000 }),
    listAllMusicBlobs(),
  ]);
  const blobMap = new Map(blobList.map((blob) => [blob.pathname, blob]));
  const referenced = new Set(
    music.items.flatMap((item) => [item.audioPath, item.imagePath]).filter((path): path is string => Boolean(path))
  );
  const orphans = blobList
    .filter((blob) => !referenced.has(blob.pathname))
    .map((blob) => ({ pathname: blob.pathname, size: blob.size, uploadedAt: blob.uploadedAt.toISOString() }));
  const tracks = music.items.map((item) => mapTrack(item, blobMap));
  const probePath = tracks.find((track) => track.audioStatus === 'permanent')?.audioPath || '';
  let readProbe = { ok: false, path: probePath, error: probePath ? '未执行' : '没有可检测的永久音频' };

  if (probePath) {
    try {
      const result = await get(probePath, { access: 'private', useCache: false, ...blobToken() });
      if (result?.statusCode === 200) {
        await result.stream.cancel();
        readProbe = { ok: true, path: probePath, error: '' };
      } else {
        readProbe = { ok: false, path: probePath, error: `Blob 返回 ${result?.statusCode || 404}` };
      }
    } catch (error) {
      readProbe = { ok: false, path: probePath, error: error instanceof Error ? error.message : 'Blob 读取失败' };
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    databaseRecords: music.total,
    permanentAudio: tracks.filter((track) => track.audioStatus === 'permanent').length,
    temporaryAudio: tracks.filter((track) => track.audioStatus === 'temporary').length,
    missingAudio: tracks.filter((track) => track.audioStatus === 'missing').length,
    permanentImages: tracks.filter((track) => track.imageStatus === 'permanent').length,
    blobFiles: blobList.length,
    orphanFiles: orphans.length,
    totalBlobBytes: blobList.reduce((sum, blob) => sum + blob.size, 0),
    readProbe,
    tracks,
    orphans,
  };
}

async function downloadMedia(sourceUrl: string, expectedType: 'audio' | 'image', maxBytes: number) {
  if (!isAllowedMediaSource(sourceUrl)) throw new Error('媒体域名不在白名单');
  const response = await fetch(sourceUrl, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body) throw new Error(`上游媒体返回 ${response.status}`);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType && !contentType.startsWith(`${expectedType}/`)) throw new Error(`媒体类型错误：${contentType}`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new Error('媒体文件超过大小限制');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error('媒体文件超过大小限制');
  return { buffer, contentType: contentType || (expectedType === 'audio' ? 'audio/mpeg' : 'image/jpeg') };
}

async function retryOne(record: GeneratedMusicRecord) {
  const patch: { audioPath?: string; imagePath?: string } = {};
  const errors: string[] = [];

  if (!record.audioPath || !(await hasBlob(record.audioPath))) {
    try {
      if (!record.audioUrl || record.audioUrl.startsWith('/')) throw new Error('没有可用的原始音频地址');
      const media = await downloadMedia(record.audioUrl, 'audio', MAX_AUDIO_BYTES);
      const pathname = `music/${record.taskId}/${record.trackId}.mp3`;
      await put(pathname, media.buffer, {
        access: 'private',
        contentType: media.contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        ...blobToken(),
      });
      patch.audioPath = pathname;
    } catch (error) {
      errors.push(`音频：${error instanceof Error ? error.message : '重试失败'}`);
    }
  }

  if (!record.imagePath || !(await hasBlob(record.imagePath))) {
    try {
      if (!record.imageUrl || record.imageUrl.startsWith('/')) throw new Error('没有可用的原始封面地址');
      const media = await downloadMedia(record.imageUrl, 'image', MAX_IMAGE_BYTES);
      const pathname = `music/${record.taskId}/${record.trackId}.jpg`;
      await put(pathname, media.buffer, {
        access: 'private',
        contentType: media.contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        ...blobToken(),
      });
      patch.imagePath = pathname;
    } catch (error) {
      errors.push(`封面：${error instanceof Error ? error.message : '重试失败'}`);
    }
  }

  if (Object.keys(patch).length > 0) {
    await updateGeneratedMusicPersistence(record.taskId, record.trackId, patch);
  }
  return { taskId: record.taskId, trackId: record.trackId, updated: Object.keys(patch), errors };
}

async function hasBlob(pathname: string) {
  try {
    const result = await get(pathname, { access: 'private', useCache: false, ...blobToken() });
    if (result?.statusCode === 200) {
      await result.stream.cancel();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function retryStorageTargets(targets?: Array<{ taskId: string; trackId: string }>) {
  const music = await readGeneratedMusic({ limit: 1000 });
  const wanted = targets?.length
    ? new Set(targets.map((target) => `${target.taskId}:${target.trackId}`))
    : null;
  const candidates = music.items.filter((item) => !wanted || wanted.has(`${item.taskId}:${item.trackId}`));
  const results = [];
  for (const record of candidates) {
    results.push(await retryOne(record));
  }
  return results;
}

export async function cleanupOrphanBlobs() {
  const report = await buildStorageHealthReport();
  if (report.orphans.length > 0) await del(report.orphans.map((orphan) => orphan.pathname), blobToken());
  return { deleted: report.orphans.map((orphan) => orphan.pathname) };
}
