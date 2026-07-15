'use client';

export type MusicLibraryItem = {
  id: string;
  taskId: string;
  title: string;
  tags: string;
  audio_url: string;
  image_url: string;
  prompt: string;
  negativeTags?: string;
  model?: string;
  duration: number;
  createdAt: number;
  isFavorite: boolean;
  note: string;
  inHistory: boolean;
};

type LegacyItem = Partial<MusicLibraryItem> & { id?: string; taskId?: string };

const LIBRARY_KEY = 'music_library_v2';
const LEGACY_HISTORY_KEY = 'music_history';
const LEGACY_FAVORITES_KEY = 'music_favorites';

function readArray(key: string): LegacyItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalize(item: LegacyItem, overrides: Partial<MusicLibraryItem> = {}): MusicLibraryItem | null {
  const id = typeof item.id === 'string' ? item.id : '';
  const taskId = typeof item.taskId === 'string' ? item.taskId : '';
  if (!id || !taskId) return null;

  return {
    id,
    taskId,
    title: typeof item.title === 'string' ? item.title : 'Untitled track',
    tags: typeof item.tags === 'string' ? item.tags : '',
    audio_url: typeof item.audio_url === 'string' ? item.audio_url : '',
    image_url: typeof item.image_url === 'string' ? item.image_url : '',
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    negativeTags: typeof item.negativeTags === 'string' ? item.negativeTags : undefined,
    model: typeof item.model === 'string' ? item.model : undefined,
    duration: typeof item.duration === 'number' ? item.duration : 0,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    isFavorite: item.isFavorite === true,
    note: typeof item.note === 'string' ? item.note : '',
    inHistory: item.inHistory !== false,
    ...overrides,
  };
}

function write(items: MusicLibraryItem[]) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
}

function migrate(): MusicLibraryItem[] {
  const existing = readArray(LIBRARY_KEY)
    .map((item) => normalize(item))
    .filter((item): item is MusicLibraryItem => Boolean(item));
  if (existing.length > 0 || localStorage.getItem(LIBRARY_KEY) !== null) return existing;

  const byId = new Map<string, MusicLibraryItem>();
  for (const item of readArray(LEGACY_HISTORY_KEY)) {
    const normalized = normalize(item, { inHistory: true, isFavorite: item.isFavorite === true });
    if (normalized) byId.set(normalized.id, normalized);
  }
  for (const item of readArray(LEGACY_FAVORITES_KEY)) {
    const normalized = normalize(item, { isFavorite: true, inHistory: false });
    if (!normalized) continue;
    const current = byId.get(normalized.id);
    byId.set(normalized.id, current ? { ...current, ...normalized, inHistory: current.inHistory } : normalized);
  }
  const migrated = Array.from(byId.values());
  write(migrated);
  return migrated;
}

export function getMusicLibrary() {
  return migrate().sort((a, b) => b.createdAt - a.createdAt);
}

export function replaceMusicLibrary(items: MusicLibraryItem[]) {
  write(items);
}

export function recordGeneratedTracks(items: Array<Partial<MusicLibraryItem> & { id: string; taskId: string }>) {
  const current = migrate();
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of items) {
    const normalized = normalize(item, { inHistory: true });
    if (!normalized) continue;
    const previous = byId.get(normalized.id);
    byId.set(normalized.id, previous ? { ...previous, ...normalized, isFavorite: previous.isFavorite, note: previous.note } : normalized);
  }
  write(Array.from(byId.values()).slice(0, 200));
}

export function setFavorite(id: string, isFavorite: boolean) {
  write(migrate().map((item) => (item.id === id ? { ...item, isFavorite } : item)));
}

export function setNote(id: string, note: string) {
  write(migrate().map((item) => (item.id === id ? { ...item, note } : item)));
}

export function removeFromHistory(id: string) {
  write(migrate().map((item) => (item.id === id ? { ...item, inHistory: false } : item)).filter((item) => item.inHistory || item.isFavorite));
}

export function clearHistory() {
  write(migrate().map((item) => ({ ...item, inHistory: false })).filter((item) => item.isFavorite));
}

export function removeFavorite(id: string) {
  write(migrate().map((item) => (item.id === id ? { ...item, isFavorite: false } : item)).filter((item) => item.inHistory || item.isFavorite));
}
