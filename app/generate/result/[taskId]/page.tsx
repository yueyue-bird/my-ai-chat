'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface FavoriteMusic {
  id: string;
  taskId: string;
  title: string;
  tags: string;
  audio_url: string;
  image_url: string;
  prompt: string;
  duration: number;
  createdAt: number;
}

interface HistoryMusic extends FavoriteMusic {
  isFavorite: boolean;
}

interface GeneratedMusic {
  id: string;
  title: string;
  tags: string;
  audio_url: string;
  image_url: string;
  prompt: string;
  negativeTags?: string;
  model?: string;
  duration: number;
}

const getFavorites = (): FavoriteMusic[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('music_favorites');
  return stored ? JSON.parse(stored) : [];
};

const saveFavorites = (favorites: FavoriteMusic[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('music_favorites', JSON.stringify(favorites));
};

const addToFavorites = (music: FavoriteMusic) => {
  const favorites = getFavorites();
  if (favorites.some((item) => item.id === music.id)) return false;
  saveFavorites([...favorites, music]);
  return true;
};

const removeFromFavorites = (musicId: string) => {
  saveFavorites(getFavorites().filter((item) => item.id !== musicId));
};

const isFavorite = (musicId: string) => getFavorites().some((item) => item.id === musicId);

const getHistory = (): HistoryMusic[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('music_history');
  return stored ? JSON.parse(stored) : [];
};

const saveHistory = (history: HistoryMusic[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('music_history', JSON.stringify(history));
};

const addToHistory = (music: HistoryMusic) => {
  const history = getHistory();
  if (history.some((item) => item.taskId === music.taskId)) return;
  saveHistory([music, ...history].slice(0, 50));
};

const updateHistoryFavoriteStatus = (taskId: string, favorite: boolean) => {
  saveHistory(getHistory().map((item) => (item.taskId === taskId ? { ...item, isFavorite: favorite } : item)));
};

const getSubmittedPrompt = (taskId: string) => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('music_submitted_prompts');
  if (!stored) return null;

  try {
    const prompts = JSON.parse(stored);
    return prompts[taskId] || null;
  } catch {
    return null;
  }
};

const getVisitorId = () => {
  if (typeof window === 'undefined') return 'anonymous';

  const existing = localStorage.getItem('usage_visitor_id');
  if (existing) return existing;

  const nextId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem('usage_visitor_id', nextId);
  return nextId;
};

const formatTime = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const hasAudioUrl = (music: any) => Boolean(music?.audioUrl || music?.audio_url || music?.audio || music?.url);

const hasCompleteAudioList = (musicList: any[]) => musicList.length > 0 && musicList.every(hasAudioUrl);

const extractMusicList = (payload: any) => {
  const candidates = [
    payload?.data?.response?.sunoData,
    payload?.data?.sunoData,
    payload?.data?.response,
    payload?.data?.data,
    payload?.data?.records,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) return candidate;
    if (candidate && typeof candidate === 'object' && hasAudioUrl(candidate)) return [candidate];
  }

  return [];
};

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params?.taskId as string;

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<GeneratedMusic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pollingCount, setPollingCount] = useState(0);
  const [audioErrors, setAudioErrors] = useState<Record<number, boolean>>({});
  const [favoriteStatus, setFavoriteStatus] = useState<Record<number, boolean>>({});
  const [toastMessage, setToastMessage] = useState('');
  const [selectedMusic, setSelectedMusic] = useState<GeneratedMusic | null>(null);
  const [canViewSunoPrompt, setCanViewSunoPrompt] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const savedToHistoryRef = useRef(false);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 2200);
  };

  const normalizeMusic = (musicList: any[]): GeneratedMusic[] =>
    musicList.map((music, index) => {
      let audioUrl = music.audioUrl || music.audio_url || music.audio || music.url || '';
      if (audioUrl && audioUrl.startsWith('/')) {
        audioUrl = `https://api.sunoapi.org${audioUrl}`;
      }
      const submittedPrompt = getSubmittedPrompt(taskId);

      return {
        id: music.id || `${taskId}_${index}`,
        title: music.title || submittedPrompt?.title || `Generated Track ${index + 1}`,
        tags: music.tags || '',
        audio_url: audioUrl,
        image_url: music.imageUrl || music.image_url || music.image || '',
        prompt: submittedPrompt?.prompt || music.prompt || '',
        negativeTags: submittedPrompt?.negativeTags || '',
        model: submittedPrompt?.model || '',
        duration: music.duration || 0,
      };
    });

  const saveFirstResultToHistory = (musicList: GeneratedMusic[]) => {
    if (savedToHistoryRef.current || musicList.length === 0) return;
    const firstMusic = musicList[0];
    addToHistory({
      ...firstMusic,
      taskId,
      createdAt: Date.now(),
      isFavorite: false,
    });
    savedToHistoryRef.current = true;
  };

  const fetchMusicData = async () => {
    if (!taskId || !isMountedRef.current) return null;

    try {
      const res = await fetch(`/api/chat/suno/fetch?taskId=${taskId}`, {
        headers: {
          'x-visitor-id': getVisitorId(),
        },
      });
      const data = await res.json();

      if (!res.ok) return { success: false, pending: true };

      if (data.code === 200 && data.data) {
        const status = String(data.data.status || data.status || data.data.taskStatus || '').toUpperCase();
        const musicList = extractMusicList(data);
        const successStatuses = ['SUCCESS', 'COMPLETED', 'COMPLETE', 'FINISHED', 'DONE'];
        const failureStatuses = ['FAILURE', 'FAILED', 'ERROR', 'FAIL'];

        if (hasCompleteAudioList(musicList)) {
          const normalized = normalizeMusic(musicList);
          saveFirstResultToHistory(normalized);
          return { success: true, data: normalized };
        }

        if (successStatuses.includes(status) && musicList.length > 0 && !hasCompleteAudioList(musicList)) {
          return { success: false, pending: true };
        }

        if (failureStatuses.includes(status)) {
          return {
            success: false,
            pending: false,
            error: data.data.errorMessage || data.data.error || '生成失败',
          };
        }
      }

      return { success: false, pending: true };
    } catch (err: any) {
      return { success: false, pending: true, error: err.message };
    }
  };

  const startPolling = async () => {
    if (!taskId) return;

    let attempts = 0;
    const maxAttempts = 96;
    const firstResult = await fetchMusicData();

    if (!isMountedRef.current) return;

    if (firstResult?.success && firstResult.data) {
      setResult(firstResult.data);
      setLoading(false);
      return;
    }

    pollingRef.current = setInterval(async () => {
      if (!isMountedRef.current) return;

      attempts += 1;
      setPollingCount(attempts);

      const nextResult = await fetchMusicData();
      if (!isMountedRef.current) return;

      if (nextResult?.success && nextResult.data) {
        setResult(nextResult.data);
        setLoading(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (nextResult?.error && !nextResult.pending) {
        setError(nextResult.error);
        setLoading(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (attempts >= maxAttempts) {
        setError('生成仍在处理中。Suno 有时会在网站端稍后完成，请点击“重新加载”继续查询当前结果。');
        setLoading(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    }, 5000);
  };

  useEffect(() => {
    if (!taskId) return;
    isMountedRef.current = true;
    initialDelayRef.current = setTimeout(() => startPolling(), 1500);

    return () => {
      isMountedRef.current = false;
      if (initialDelayRef.current) clearTimeout(initialDelayRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [taskId]);

  useEffect(() => {
    const verifyAdmin = async () => {
      if (typeof window === 'undefined') return;

      try {
        const token = localStorage.getItem('usage_admin_token') || '';
        const res = await fetch('/api/admin/verify', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setCanViewSunoPrompt(Boolean(data.isAdmin));
      } catch {
        setCanViewSunoPrompt(false);
      }
    };

    verifyAdmin();
  }, []);

  useEffect(() => {
    const status: Record<number, boolean> = {};
    result.forEach((music, index) => {
      status[index] = isFavorite(music.id);
    });
    setFavoriteStatus(status);
  }, [result]);

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    setPollingCount(0);
    if (pollingRef.current) clearInterval(pollingRef.current);
    startPolling();
  };

  const handleToggleFavorite = (music: GeneratedMusic, index: number) => {
    if (favoriteStatus[index]) {
      removeFromFavorites(music.id);
      updateHistoryFavoriteStatus(taskId, false);
      setFavoriteStatus((prev) => ({ ...prev, [index]: false }));
      showToast('已从收藏夹移除');
      return;
    }

    const added = addToFavorites({
      ...music,
      taskId,
      createdAt: Date.now(),
    });

    if (added) {
      updateHistoryFavoriteStatus(taskId, true);
      setFavoriteStatus((prev) => ({ ...prev, [index]: true }));
      showToast('已添加到收藏夹');
    } else {
      showToast('这首音乐已经在收藏夹中');
    }
  };

  const generatedCount = result.length;
  const totalDuration = result.reduce((sum, music) => sum + (music.duration || 0), 0);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 py-6 text-slate-950">
      {toastMessage && (
        <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full bg-teal-700 px-5 py-2 text-sm font-medium text-white shadow-lg">
          {toastMessage}
        </div>
      )}

      {selectedMusic && canViewSunoPrompt && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 px-4" onClick={() => setSelectedMusic(null)}>
          <div className="w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="bg-teal-800 px-6 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">Track details</p>
              <h2 className="mt-2 text-xl font-semibold">{selectedMusic.title}</h2>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Prompt</p>
                <pre className="mt-2 max-h-72 whitespace-pre-wrap overflow-auto rounded-2xl bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-700">
                  {selectedMusic.prompt || '无 prompt 记录'}
                </pre>
              </div>
              {(selectedMusic.negativeTags || selectedMusic.model) && (
                <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
                  {selectedMusic.negativeTags && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Negative Tags</p>
                      <p className="mt-2 leading-6">{selectedMusic.negativeTags}</p>
                    </div>
                  )}
                  {selectedMusic.model && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Model</p>
                      <p className="mt-2 leading-6">{selectedMusic.model}</p>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedMusic(null)}
                className="h-11 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <header className="mb-6 rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Generation Result</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 md:text-3xl">音乐生成结果</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/generate?taskId=${taskId}`)}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
              >
                返回生成页
              </button>
              <button
                type="button"
                onClick={() => router.push('/generate/history')}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
              >
                历史记录
              </button>
              <button
                type="button"
                onClick={() => router.push(`/generate/favorites?from=result&taskId=${taskId}`)}
                className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800"
              >
                收藏夹
              </button>
            </div>
          </div>
        </header>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-500">当前状态</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{loading ? '生成中' : error ? '需继续查询' : '已完成'}</p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-500">结果数量</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{generatedCount}</p>
          </div>
          <div className="rounded-[24px] border border-white/80 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <p className="text-sm text-slate-500">总时长</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatTime(totalDuration)}</p>
          </div>
        </section>

        {loading && !error && (
          <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="bg-teal-800 p-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">Waiting for Suno</p>
              <h2 className="mt-2 text-2xl font-semibold">AI 正在创作音乐</h2>
              <p className="mt-2 text-sm text-teal-50/80">Suno 生成通常需要几十秒到几分钟。页面会自动查询结果。</p>
              <div className="mt-6 flex h-16 items-end gap-1 rounded-2xl bg-white/10 p-2">
                {[30, 46, 24, 58, 36, 64, 28, 52, 42, 60, 34, 48, 26, 56].map((height, index) => (
                  <span
                    key={index}
                    className="flex-1 animate-pulse rounded-full bg-gradient-to-t from-teal-300 to-rose-300"
                    style={{ height, animationDelay: `${index * 80}ms` }}
                  />
                ))}
              </div>
            </div>
            <div className="p-6">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${Math.min((pollingCount / 96) * 100, 100)}%` }} />
              </div>
              <p className="mt-3 text-sm text-slate-500">查询次数：{pollingCount}/96</p>
            </div>
          </section>
        )}

        {error && (
          <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-semibold">结果还没有返回到前端</h2>
            <p className="mt-2 text-sm leading-6">{error}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={handleRefresh} className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
                重新加载
              </button>
              <button
                type="button"
                onClick={() => router.push(`/generate?taskId=${taskId}`)}
                className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                返回生成页
              </button>
            </div>
          </section>
        )}

        {!loading && !error && result.length > 0 && (
          <section className="space-y-5">
            {result.map((music, index) => (
              <article
                key={music.id}
                className="overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
              >
                <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="min-h-[260px] bg-gradient-to-br from-teal-100 via-rose-50 to-white">
                    {music.image_url ? (
                      <img src={music.image_url} alt={music.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full min-h-[260px] place-items-center">
                        <div className="grid h-24 w-24 place-items-center rounded-[28px] bg-white/80 shadow-sm">
                          <div className="h-12 w-12 rounded-full border-8 border-teal-300 border-t-rose-300" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-5 p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Track {index + 1}</p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{music.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{music.tags || '无标签'}</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{formatTime(music.duration)}</div>
                    </div>

                    {music.audio_url && !audioErrors[index] ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <audio controls className="w-full" src={music.audio_url} onError={() => setAudioErrors((prev) => ({ ...prev, [index]: true }))} />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        音频链接暂时无法加载。可以稍后重新刷新结果。
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {music.audio_url && (
                        <a
                          href={music.audio_url}
                          download={`${music.title || 'music'}.mp3`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
                        >
                          下载音频
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(music, index)}
                        className={`rounded-full px-4 py-2 text-sm font-medium ${
                          favoriteStatus[index]
                            ? 'bg-rose-500 text-white hover:bg-rose-600'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {favoriteStatus[index] ? '已收藏' : '收藏'}
                      </button>
                      {canViewSunoPrompt && (
                      <button
                        type="button"
                        onClick={() => setSelectedMusic(music)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        查看 prompt
                      </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
