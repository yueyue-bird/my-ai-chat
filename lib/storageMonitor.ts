import { del, get, list, put, type ListBlobResultBlob } from '@vercel/blob';
import {
  deleteGeneratedMusic,
  readAllGeneratedMusic,
  readGeneratedMusic,
  readLatestMusicCleanupRun,
  saveMusicCleanupRun,
  updateGeneratedMusicPersistence,
  type MusicCleanupRun,
  type GeneratedMusicRecord,
} from '@/lib/generatedMusicStore';
import { isAllowedMediaSource } from '@/lib/sunoSecurity';
import { deleteUsageEventsBefore } from '@/lib/usageMonitor';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const GIB = 1024 * 1024 * 1024;
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN
  ? { token: process.env.BLOB_READ_WRITE_TOKEN }
  : {};

export type StorageCleanupPolicy = {
  retentionDays: number;
  budgetBytes: number;
  highWatermark: number;
  targetWatermark: number;
  batchSize: number;
};

export type StorageCleanupResult = MusicCleanupRun & {
  cutoff: string;
  initialUsageRatio: number;
  finalUsageRatio: number;
  reclaimedBytes: number;
  selectedTracks: Array<{ taskId: string; trackId: string; title: string; reason: 'expired' | 'capacity' }>;
  orphanPaths: string[];
};

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
  cleanupPolicy: StorageCleanupPolicy & {
    usageRatio: number;
    highWatermarkBytes: number;
    targetWatermarkBytes: number;
  };
  lastCleanup: MusicCleanupRun | null;
  readProbe: { ok: boolean; path: string; error: string };
  tracks: StorageTrackHealth[];
  orphans: Array<{ pathname: string; size: number; uploadedAt: string }>;
};

function envNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function getStorageCleanupPolicy(): StorageCleanupPolicy {
  const highWatermark = envNumber('BLOB_CLEANUP_HIGH_WATERMARK', 0.9, 0.5, 0.99);
  const configuredTarget = envNumber('BLOB_CLEANUP_TARGET', 0.85, 0.1, 0.98);
  return {
    retentionDays: Math.round(envNumber('MUSIC_RETENTION_DAYS', 90, 1, 3650)),
    budgetBytes: Math.round(envNumber('BLOB_STORAGE_BUDGET_BYTES', GIB, 10 * 1024 * 1024, 10 * 1024 * GIB)),
    highWatermark,
    targetWatermark: Math.min(configuredTarget, highWatermark - 0.01),
    batchSize: Math.round(envNumber('MUSIC_CLEANUP_BATCH_SIZE', 20, 1, 100)),
  };
}

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
  const [music, blobList, lastCleanup] = await Promise.all([
    readAllGeneratedMusic(),
    listAllMusicBlobs(),
    readLatestMusicCleanupRun().catch(() => null),
  ]);
  const blobMap = new Map(blobList.map((blob) => [blob.pathname, blob]));
  const referenced = new Set(
    music.items.flatMap((item) => [item.audioPath, item.imagePath]).filter((path): path is string => Boolean(path))
  );
  const orphans = blobList
    .filter((blob) => !referenced.has(blob.pathname))
    .map((blob) => ({ pathname: blob.pathname, size: blob.size, uploadedAt: blob.uploadedAt.toISOString() }));
  const tracks = music.items.map((item) => mapTrack(item, blobMap));
  const totalBlobBytes = blobList.reduce((sum, blob) => sum + blob.size, 0);
  const cleanupPolicy = getStorageCleanupPolicy();
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
    totalBlobBytes,
    cleanupPolicy: {
      ...cleanupPolicy,
      usageRatio: totalBlobBytes / cleanupPolicy.budgetBytes,
      highWatermarkBytes: cleanupPolicy.budgetBytes * cleanupPolicy.highWatermark,
      targetWatermarkBytes: cleanupPolicy.budgetBytes * cleanupPolicy.targetWatermark,
    },
    lastCleanup,
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

function trackKey(record: Pick<GeneratedMusicRecord, 'taskId' | 'trackId'>) {
  return `${record.taskId}:${record.trackId}`;
}

function recordBlobPaths(record: GeneratedMusicRecord, blobs: Map<string, ListBlobResultBlob>) {
  return [record.audioPath, record.imagePath]
    .filter((pathname): pathname is string => Boolean(pathname && blobs.has(pathname)));
}

export async function runStorageRetention(options: {
  dryRun?: boolean;
  trigger?: 'cron' | 'persist' | 'admin';
  protectedTrackKeys?: string[];
} = {}): Promise<StorageCleanupResult> {
  const startedAt = new Date().toISOString();
  const dryRun = options.dryRun ?? false;
  const trigger = options.trigger || 'admin';
  const policy = getStorageCleanupPolicy();
  const cutoffDate = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
  const protectedKeys = new Set(options.protectedTrackKeys || []);
  const errors: string[] = [];

  const [music, blobList] = await Promise.all([
    readAllGeneratedMusic(),
    listAllMusicBlobs(),
  ]);
  const blobMap = new Map(blobList.map((blob) => [blob.pathname, blob]));
  const referenced = new Set(
    music.items.flatMap((item) => [item.audioPath, item.imagePath]).filter((path): path is string => Boolean(path))
  );
  const orphanBlobs = blobList
    .filter((blob) => !referenced.has(blob.pathname))
    .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
  const initialBlobBytes = blobList.reduce((sum, blob) => sum + blob.size, 0);
  let projectedBlobBytes = Math.max(0, initialBlobBytes - orphanBlobs.reduce((sum, blob) => sum + blob.size, 0));
  const selected = new Map<string, {
    record: GeneratedMusicRecord;
    reason: 'expired' | 'capacity';
    bytes: number;
  }>();
  const oldestFirst = [...music.items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const record of oldestFirst) {
    if (selected.size >= policy.batchSize) break;
    if (protectedKeys.has(trackKey(record))) continue;
    if (new Date(record.createdAt) >= cutoffDate) continue;
    const bytes = recordBlobPaths(record, blobMap)
      .reduce((sum, pathname) => sum + (blobMap.get(pathname)?.size || 0), 0);
    selected.set(trackKey(record), { record, reason: 'expired', bytes });
    projectedBlobBytes = Math.max(0, projectedBlobBytes - bytes);
  }

  if (projectedBlobBytes > policy.budgetBytes * policy.highWatermark) {
    for (const record of oldestFirst) {
      if (selected.size >= policy.batchSize || projectedBlobBytes <= policy.budgetBytes * policy.targetWatermark) break;
      const key = trackKey(record);
      if (protectedKeys.has(key) || selected.has(key)) continue;
      const bytes = recordBlobPaths(record, blobMap)
        .reduce((sum, pathname) => sum + (blobMap.get(pathname)?.size || 0), 0);
      selected.set(key, { record, reason: 'capacity', bytes });
      projectedBlobBytes = Math.max(0, projectedBlobBytes - bytes);
    }
  }

  let deletedTracks = 0;
  let deletedBlobs = 0;
  let deletedUsageEvents = 0;
  let finalBlobBytes = initialBlobBytes;

  if (!dryRun) {
    if (orphanBlobs.length > 0) {
      try {
        await del(orphanBlobs.map((blob) => blob.pathname), blobToken());
        deletedBlobs += orphanBlobs.length;
        finalBlobBytes = Math.max(0, finalBlobBytes - orphanBlobs.reduce((sum, blob) => sum + blob.size, 0));
      } catch (error) {
        errors.push(`孤儿文件：${error instanceof Error ? error.message : '删除失败'}`);
      }
    }

    for (const { record, bytes } of Array.from(selected.values())) {
      const paths = recordBlobPaths(record, blobMap);
      let blobsDeleted = false;
      try {
        if (paths.length > 0) {
          await del(paths, blobToken());
          blobsDeleted = true;
          deletedBlobs += paths.length;
          finalBlobBytes = Math.max(0, finalBlobBytes - bytes);
        }
        await deleteGeneratedMusic(record.taskId, record.trackId);
        deletedTracks += 1;
      } catch (error) {
        const stage = blobsDeleted ? 'Blob 已删除，但数据库记录删除失败' : '删除失败';
        errors.push(`${trackKey(record)}：${stage}：${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    try {
      deletedUsageEvents = await deleteUsageEventsBefore(cutoffDate);
    } catch (error) {
      errors.push(`监控事件：${error instanceof Error ? error.message : '删除失败'}`);
    }
  } else {
    finalBlobBytes = projectedBlobBytes;
  }

  const finishedAt = new Date().toISOString();
  const result: StorageCleanupResult = {
    startedAt,
    finishedAt,
    trigger,
    dryRun,
    retentionDays: policy.retentionDays,
    budgetBytes: policy.budgetBytes,
    initialBlobBytes,
    finalBlobBytes,
    deletedTracks: dryRun ? selected.size : deletedTracks,
    deletedBlobs: dryRun
      ? orphanBlobs.length + Array.from(selected.values()).reduce(
          (sum, item) => sum + recordBlobPaths(item.record, blobMap).length,
          0
        )
      : deletedBlobs,
    deletedUsageEvents,
    errors,
    cutoff: cutoffDate.toISOString(),
    initialUsageRatio: initialBlobBytes / policy.budgetBytes,
    finalUsageRatio: finalBlobBytes / policy.budgetBytes,
    reclaimedBytes: Math.max(0, initialBlobBytes - finalBlobBytes),
    selectedTracks: Array.from(selected.values()).map(({ record, reason }) => ({
      taskId: record.taskId,
      trackId: record.trackId,
      title: record.title,
      reason,
    })),
    orphanPaths: orphanBlobs.map((blob) => blob.pathname),
  };

  try {
    await saveMusicCleanupRun(result);
  } catch (error) {
    result.errors.push(`审计日志：${error instanceof Error ? error.message : '写入失败'}`);
  }

  return result;
}
