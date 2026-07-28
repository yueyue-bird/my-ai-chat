export type GeneratedMusicRecord = {
  taskId: string;
  trackId: string;
  visitorId: string;
  title: string;
  tags: string;
  audioUrl: string;
  imageUrl: string;
  audioPath: string | null;
  imagePath: string | null;
  prompt: string;
  negativeTags: string;
  model: string;
  duration: number;
  createdAt: string;
};

type SaveGeneratedMusicInput = Omit<GeneratedMusicRecord, 'createdAt'>;

const cleanEnvValue = (value: string) => value.trim().replace(/^["']|["']$/g, '');
const TABLE_NAME = cleanEnvValue(process.env.SUPABASE_GENERATED_MUSIC_TABLE || 'generated_music');
const CLEANUP_TABLE_NAME = cleanEnvValue(process.env.SUPABASE_MUSIC_CLEANUP_TABLE || 'music_cleanup_runs');
const PERSISTENCE_TABLE_NAME = cleanEnvValue(process.env.SUPABASE_MUSIC_PERSISTENCE_TABLE || 'music_persistence_jobs');

export type MusicCleanupRun = {
  id?: string;
  startedAt: string;
  finishedAt: string;
  trigger: string;
  dryRun: boolean;
  retentionDays: number;
  budgetBytes: number;
  initialBlobBytes: number;
  finalBlobBytes: number;
  deletedTracks: number;
  deletedBlobs: number;
  deletedUsageEvents: number;
  errors: string[];
};

function getSupabaseConfig() {
  const url = cleanEnvValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const serviceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '');

  if (!url || !serviceRoleKey) throw new Error('Supabase generated music storage is not configured');

  return {
    url: url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
}

async function supabaseFetch(pathname: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase generated music storage error: ${response.status} ${text}`);
  }

  return response;
}

function toSupabaseRow(item: SaveGeneratedMusicInput) {
  return {
    task_id: item.taskId,
    track_id: item.trackId,
    visitor_id: item.visitorId,
    title: item.title,
    tags: item.tags,
    audio_url: item.audioUrl,
    image_url: item.imageUrl,
    audio_path: item.audioPath,
    image_path: item.imagePath,
    prompt: item.prompt,
    negative_tags: item.negativeTags,
    model: item.model,
    duration: item.duration,
  };
}

function fromSupabaseRow(row: any): GeneratedMusicRecord {
  return {
    taskId: row.task_id,
    trackId: row.track_id,
    visitorId: row.visitor_id,
    title: row.title,
    tags: row.tags || '',
    audioUrl: row.audio_url || '',
    imageUrl: row.image_url || '',
    audioPath: row.audio_path || null,
    imagePath: row.image_path || null,
    prompt: row.prompt || '',
    negativeTags: row.negative_tags || '',
    model: row.model || '',
    duration: Number(row.duration) || 0,
    createdAt: row.created_at,
  };
}

export async function saveGeneratedMusic(items: SaveGeneratedMusicInput[]) {
  if (items.length === 0) return;
  const params = new URLSearchParams({ on_conflict: 'task_id,track_id' });
  await supabaseFetch(`${TABLE_NAME}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(items.map(toSupabaseRow)),
  });
}

export async function readGeneratedMusicByTask(taskId: string) {
  const params = new URLSearchParams({
    select: '*',
    task_id: `eq.${taskId}`,
    order: 'created_at.asc',
  });
  const response = await supabaseFetch(`${TABLE_NAME}?${params.toString()}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(fromSupabaseRow) : [];
}

export async function claimMusicPersistence(taskId: string): Promise<'claimed' | 'running' | 'completed'> {
  const response = await supabaseFetch('rpc/claim_music_persistence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_task_id: taskId, p_lease_seconds: 300 }),
  });
  const result = await response.json();
  return result === 'running' || result === 'completed' ? result : 'claimed';
}

export async function finishMusicPersistence(taskId: string, status: 'completed' | 'failed') {
  const params = new URLSearchParams({ task_id: `eq.${taskId}` });
  await supabaseFetch(`${PERSISTENCE_TABLE_NAME}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      status,
      locked_until: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function readGeneratedMusic(options: { limit?: number; offset?: number } = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 1000));
  const offset = Math.max(0, options.offset || 0);
  const params = new URLSearchParams({
    select: '*',
    order: 'created_at.desc',
    limit: String(limit),
    offset: String(offset),
  });
  const response = await supabaseFetch(`${TABLE_NAME}?${params.toString()}`, {
    headers: { Prefer: 'count=exact' },
  });
  const rows = await response.json();
  const contentRange = response.headers.get('content-range') || '';
  const total = Number(contentRange.split('/')[1]);

  return {
    items: Array.isArray(rows) ? rows.map(fromSupabaseRow) : [],
    total: Number.isFinite(total) ? total : Array.isArray(rows) ? rows.length : 0,
  };
}

export async function readAllGeneratedMusic(maxItems = 50_000) {
  const items: GeneratedMusicRecord[] = [];
  const pageSize = 1000;
  let total = 0;

  for (let offset = 0; offset < maxItems; offset += pageSize) {
    const page = await readGeneratedMusic({
      limit: Math.min(pageSize, maxItems - offset),
      offset,
    });
    items.push(...page.items);
    total = page.total;
    if (page.items.length < pageSize || items.length >= total) break;
  }

  return { items, total };
}

export async function updateGeneratedMusicPersistence(
  taskId: string,
  trackId: string,
  patch: {
    audioPath?: string | null;
    imagePath?: string | null;
  }
) {
  const params = new URLSearchParams({
    task_id: `eq.${taskId}`,
    track_id: `eq.${trackId}`,
  });
  const body: Record<string, string | null> = {};
  if ('audioPath' in patch) body.audio_path = patch.audioPath ?? null;
  if ('imagePath' in patch) body.image_path = patch.imagePath ?? null;

  await supabaseFetch(`${TABLE_NAME}?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

export async function deleteGeneratedMusic(taskId: string, trackId: string) {
  const params = new URLSearchParams({
    task_id: `eq.${taskId}`,
    track_id: `eq.${trackId}`,
  });
  await supabaseFetch(`${TABLE_NAME}?${params.toString()}`, { method: 'DELETE' });
}

function fromCleanupRow(row: any): MusicCleanupRun {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    trigger: row.trigger,
    dryRun: Boolean(row.dry_run),
    retentionDays: Number(row.retention_days) || 0,
    budgetBytes: Number(row.budget_bytes) || 0,
    initialBlobBytes: Number(row.initial_blob_bytes) || 0,
    finalBlobBytes: Number(row.final_blob_bytes) || 0,
    deletedTracks: Number(row.deleted_tracks) || 0,
    deletedBlobs: Number(row.deleted_blobs) || 0,
    deletedUsageEvents: Number(row.deleted_usage_events) || 0,
    errors: Array.isArray(row.errors) ? row.errors.map(String) : [],
  };
}

export async function saveMusicCleanupRun(run: MusicCleanupRun) {
  await supabaseFetch(CLEANUP_TABLE_NAME, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      started_at: run.startedAt,
      finished_at: run.finishedAt,
      trigger: run.trigger,
      dry_run: run.dryRun,
      retention_days: run.retentionDays,
      budget_bytes: run.budgetBytes,
      initial_blob_bytes: run.initialBlobBytes,
      final_blob_bytes: run.finalBlobBytes,
      deleted_tracks: run.deletedTracks,
      deleted_blobs: run.deletedBlobs,
      deleted_usage_events: run.deletedUsageEvents,
      errors: run.errors,
    }),
  });
}

export async function readLatestMusicCleanupRun() {
  const params = new URLSearchParams({
    select: '*',
    order: 'started_at.desc',
    limit: '1',
  });
  const response = await supabaseFetch(`${CLEANUP_TABLE_NAME}?${params.toString()}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? fromCleanupRow(rows[0]) : null;
}
