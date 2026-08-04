'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMusicLibrary, recordGeneratedTracks, setFavorite } from '@/lib/musicLibrary';

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

const addToFavorites = (music: FavoriteMusic) => {
  if (getMusicLibrary().some((item) => item.id === music.id && item.isFavorite)) return false;
  setFavorite(music.id, true);
  return true;
};

const removeFromFavorites = (musicId: string) => {
  setFavorite(musicId, false);
};

const isFavorite = (musicId: string) => getMusicLibrary().some((item) => item.id === musicId && item.isFavorite);

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

const getTaskAccessToken = (taskId: string) => {
  const submitted = getSubmittedPrompt(taskId);
  if (typeof submitted?.taskToken === 'string' && submitted.taskToken) return submitted.taskToken;
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('token') || '';
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

const copyText = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
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

  const findNestedMusicList = (value: any, seen = new Set<any>()): any[] => {
    if (!value || typeof value !== 'object' || seen.has(value)) return [];
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > 0 && value.some(hasAudioUrl)) return value;
      for (const item of value) {
        const found = findNestedMusicList(item, seen);
        if (found.length > 0) return found;
      }
      return [];
    }
    if (hasAudioUrl(value)) return [value];
    for (const child of Object.values(value)) {
      const found = findNestedMusicList(child, seen);
      if (found.length > 0) return found;
    }
    return [];
  };

  const nestedMusicList = findNestedMusicList(payload);
  if (nestedMusicList.length > 0) return nestedMusicList;

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
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});
  const [audioDurations, setAudioDurations] = useState<Record<string, number>>({});
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [sharingTrackId, setSharingTrackId] = useState<string | null>(null);
  const [shareErrors, setShareErrors] = useState<Record<string, string>>({});

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingRunRef = useRef(0);
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const savedToHistoryRef = useRef(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const seekingRef = useRef<Record<string, boolean>>({});
  const resumeAfterSeekRef = useRef<Record<string, boolean>>({});

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

  // 把 Suno 临时链接的音频/封面转存到 Vercel Blob，换成永久 URL 再写入 localStorage。
  // 转存整体失败（如未配置 BLOB_READ_WRITE_TOKEN）时降级回退原始结果，不阻断展示。
  const persistMusic = async (musicList: GeneratedMusic[]): Promise<GeneratedMusic[]> => {
    try {
      const taskToken = getTaskAccessToken(taskId);
      if (!taskToken) return musicList;
      const res = await fetch('/api/chat/suno/persist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-visitor-id': getVisitorId(),
          'x-task-access-token': taskToken,
        },
        body: JSON.stringify({
          taskId,
          items: musicList.map((music) => ({
             id: music.id,
             audioUrl: music.audio_url,
             imageUrl: music.image_url,
             title: music.title,
             tags: music.tags,
             prompt: music.prompt,
             negativeTags: music.negativeTags,
             model: music.model,
             duration: music.duration,
           })),
        }),
      });

      if (!res.ok) return musicList;

      const data = await res.json();
      const persistedById: Record<string, { audioUrl?: string; imageUrl?: string }> = {};
      for (const item of data.items || []) {
        persistedById[item.id] = item;
      }

      return musicList.map((music) => {
        const persisted = persistedById[music.id];
        if (!persisted) return music;
        return {
          ...music,
          audio_url: persisted.audioUrl || music.audio_url,
          image_url: persisted.imageUrl || music.image_url,
        };
      });
    } catch {
      return musicList;
    }
  };

  const saveResultToHistory = (musicList: GeneratedMusic[], replace = false) => {
    if ((!replace && savedToHistoryRef.current) || musicList.length === 0) return;
    recordGeneratedTracks(musicList.map((music) => ({ ...music, taskId, createdAt: Date.now() })));
    savedToHistoryRef.current = true;
  };

  const fetchMusicData = async () => {
    if (!taskId || !isMountedRef.current) return null;
    const taskToken = getTaskAccessToken(taskId);
    if (!taskToken) {
      return { success: false, pending: false, error: '此任务的访问凭证已丢失，请从生成页面重新创建任务。' };
    }

    try {
      const res = await fetch(`/api/chat/suno/fetch?taskId=${encodeURIComponent(taskId)}`, {
        headers: {
          'x-visitor-id': getVisitorId(),
          'x-task-access-token': taskToken,
        },
      });
      const data = await res.json();

      if (!res.ok) return { success: false, pending: false, error: data.error || '无法读取任务状态' };

      if (data.code === 200 && data.data) {
        const status = String(data.data.status || data.status || data.data.taskStatus || '').toUpperCase();
        const musicList = extractMusicList(data);
        const successStatuses = ['SUCCESS', 'COMPLETED', 'COMPLETE', 'FINISHED', 'DONE'];
        const failureStatuses = ['FAILURE', 'FAILED', 'ERROR', 'FAIL'];

        if (hasCompleteAudioList(musicList)) {
          const normalized = normalizeMusic(musicList);
          saveResultToHistory(normalized);
          void persistMusic(normalized).then((persisted) => {
            saveResultToHistory(persisted, true);
            if (isMountedRef.current) setResult(persisted);
          });
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

    const runId = ++pollingRunRef.current;
    const startedAt = Date.now();
    const maxPollingMs = 15 * 60 * 1000;
    let attempts = 0;

    const poll = async () => {
      if (!isMountedRef.current || pollingRunRef.current !== runId) return;

      attempts += 1;
      setPollingCount(attempts);

      const nextResult = await fetchMusicData();
      if (!isMountedRef.current || pollingRunRef.current !== runId) return;
      if (nextResult?.success && nextResult.data) {
        setResult(nextResult.data);
        setLoading(false);
      } else if (nextResult?.error && !nextResult.pending) {
        setError(nextResult.error);
        setLoading(false);
      } else if (Date.now() - startedAt >= maxPollingMs) {
        setError('生成仍在处理中。Suno 偶尔需要更长时间，请稍后点击“重新加载”继续查询当前结果。');
        setLoading(false);
      } else {
        const elapsedMs = Date.now() - startedAt;
        const delayMs = elapsedMs < 2 * 60 * 1000 ? 5000 : elapsedMs < 5 * 60 * 1000 ? 10000 : 15000;
        pollingRef.current = setTimeout(poll, delayMs);
      }
    };

    await poll();
  };

  useEffect(() => {
    if (!taskId) return;
    isMountedRef.current = true;

    const storedResult = getMusicLibrary()
      .filter((item) => item.taskId === taskId && item.audio_url)
      .map((item) => ({
        id: item.id,
        title: item.title,
        tags: item.tags,
        audio_url: item.audio_url,
        image_url: item.image_url,
        prompt: item.prompt,
        negativeTags: item.negativeTags,
        model: item.model,
        duration: item.duration,
      }));

    if (storedResult.length > 0) {
      setResult(storedResult);
      setError(null);
      setLoading(false);
      savedToHistoryRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }

    initialDelayRef.current = setTimeout(() => startPolling(), 1500);

    return () => {
      isMountedRef.current = false;
      pollingRunRef.current += 1;
      if (initialDelayRef.current) clearTimeout(initialDelayRef.current);
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [taskId]);

  useEffect(() => {
    const verifyAdmin = async () => {
      if (typeof window === 'undefined') return;

      try {
        const res = await fetch('/api/admin/verify');
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
    if (pollingRef.current) clearTimeout(pollingRef.current);
    startPolling();
  };

  const handlePlayPause = async (musicId: string) => {
    const audio = audioRefs.current[musicId];
    if (!audio) return;

    if (currentPlayingId === musicId && !audio.paused) {
      audio.pause();
      setCurrentPlayingId(null);
      return;
    }

    if (currentPlayingId) audioRefs.current[currentPlayingId]?.pause();

    try {
      await audio.play();
      setCurrentPlayingId(musicId);
    } catch {
      const index = result.findIndex((music) => music.id === musicId);
      if (index >= 0) setAudioErrors((prev) => ({ ...prev, [index]: true }));
    }
  };

  const handleSeek = (musicId: string, value: number) => {
    const audio = audioRefs.current[musicId];
    if (!audio) return;
    setCurrentTimes((prev) => ({ ...prev, [musicId]: value }));
    if (!seekingRef.current[musicId]) audio.currentTime = value;
  };

  const handleSeekStart = (musicId: string) => {
    const audio = audioRefs.current[musicId];
    seekingRef.current[musicId] = true;
    resumeAfterSeekRef.current[musicId] = Boolean(
      audio && currentPlayingId === musicId && !audio.ended
    );
    if (audio && !audio.paused) audio.pause();
  };

  const handleSeekEnd = (musicId: string, value: number) => {
    seekingRef.current[musicId] = false;
    handleSeek(musicId, value);
    const audio = audioRefs.current[musicId];
    if (audio && resumeAfterSeekRef.current[musicId]) {
      void audio.play()
        .then(() => setCurrentPlayingId(musicId))
        .catch((playError) => {
          if (playError instanceof DOMException && playError.name === 'AbortError') return;
          setCurrentPlayingId(null);
          showToast('新位置正在缓冲，请点击播放继续');
        });
    }
    resumeAfterSeekRef.current[musicId] = false;
  };

  const handleToggleFavorite = (music: GeneratedMusic, index: number) => {
    if (favoriteStatus[index]) {
      removeFromFavorites(music.id);
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
      setFavoriteStatus((prev) => ({ ...prev, [index]: true }));
      showToast('已添加到收藏夹');
    } else {
      showToast('这首音乐已经在收藏夹中');
    }
  };

  const handleShareMusic = async (music: GeneratedMusic) => {
    const taskToken = getTaskAccessToken(taskId);
    if (!taskToken) {
      setShareErrors((prev) => ({ ...prev, [music.id]: '任务访问凭证已丢失，无法创建分享链接。' }));
      return;
    }

    setSharingTrackId(music.id);
    setShareErrors((prev) => ({ ...prev, [music.id]: '' }));

    try {
      let shareUrl = shareLinks[music.id];
      if (!shareUrl) {
        const response = await fetch('/api/share', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-task-access-token': taskToken,
          },
          body: JSON.stringify({ taskId, trackId: music.id }),
        });
        const data = await response.json();
        if (!response.ok || typeof data.shareUrl !== 'string') {
          throw new Error(data.error || '暂时无法创建分享链接');
        }
        shareUrl = data.shareUrl;
        setShareLinks((prev) => ({ ...prev, [music.id]: shareUrl }));
      }

      const copied = await copyText(shareUrl);
      showToast(copied ? '分享链接已复制' : '分享链接已生成，请手动复制');
    } catch (error) {
      const message = error instanceof Error ? error.message : '暂时无法创建分享链接';
      setShareErrors((prev) => ({ ...prev, [music.id]: message }));
      showToast(message);
    } finally {
      setSharingTrackId(null);
    }
  };

  const generatedCount = result.length;
  const totalDuration = result.reduce((sum, music) => sum + (music.duration || 0), 0);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-3 py-3 text-slate-950 sm:px-4 sm:py-6">
      {toastMessage && (
        <div className="fixed left-1/2 top-4 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-teal-700 px-5 py-2 text-center text-sm font-medium text-white shadow-lg sm:top-6">
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
              {selectedMusic.model && (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Model</p>
                    <p className="mt-2 leading-6">{selectedMusic.model}</p>
                  </div>
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
        <header className="mb-4 rounded-[22px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:mb-6 sm:rounded-[28px] sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Generation Result</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-950 md:text-3xl">音乐生成结果</h1>
            </div>
            <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap">
              <button
                type="button"
                onClick={() => router.push(`/generate?taskId=${taskId}`)}
                className="min-w-0 rounded-full border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 sm:px-4 sm:text-sm"
              >
                返回生成页
              </button>
              <button
                type="button"
                onClick={() => router.push('/generate/history')}
                className="min-w-0 rounded-full border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 sm:px-4 sm:text-sm"
              >
                历史记录
              </button>
              <button
                type="button"
                onClick={() => router.push(`/generate/favorites?from=result&taskId=${taskId}`)}
                className="min-w-0 rounded-full bg-teal-700 px-2 py-2 text-xs font-medium text-white shadow-sm hover:bg-teal-800 sm:px-4 sm:text-sm"
              >
                收藏夹
              </button>
            </div>
          </div>
        </header>

        <section className="mb-4 grid grid-cols-3 gap-2 sm:mb-6 sm:gap-4">
          <div className="rounded-[18px] border border-white/80 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:rounded-[24px] sm:p-4">
            <p className="truncate text-[11px] text-slate-500 sm:text-sm">当前状态</p>
            <p className="mt-1 truncate text-lg font-semibold text-slate-950 sm:mt-2 sm:text-2xl">{loading ? '生成中' : error ? '需继续查询' : '已完成'}</p>
          </div>
          <div className="rounded-[18px] border border-white/80 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:rounded-[24px] sm:p-4">
            <p className="truncate text-[11px] text-slate-500 sm:text-sm">结果数量</p>
            <p className="mt-1 truncate text-lg font-semibold text-slate-950 sm:mt-2 sm:text-2xl">{generatedCount}</p>
          </div>
          <div className="rounded-[18px] border border-white/80 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:rounded-[24px] sm:p-4">
            <p className="truncate text-[11px] text-slate-500 sm:text-sm">总时长</p>
            <p className="mt-1 truncate text-lg font-semibold text-slate-950 sm:mt-2 sm:text-2xl">{formatTime(totalDuration)}</p>
          </div>
        </section>

        {loading && !error && (
          <section className="overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
            <div className="bg-teal-800 p-4 text-white sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">Waiting for Suno</p>
              <h2 className="mt-2 text-2xl font-semibold">AI 正在创作音乐</h2>
              <p className="mt-2 text-sm text-teal-50/80">Suno 生成通常需要几十秒到几分钟。页面会自动查询结果。</p>
              <div className="mt-5 flex h-14 items-end gap-1 rounded-2xl bg-white/10 p-2 sm:mt-6 sm:h-16">
                {[30, 46, 24, 58, 36, 64, 28, 52, 42, 60, 34, 48, 26, 56].map((height, index) => (
                  <span
                    key={index}
                    className="flex-1 animate-pulse rounded-full bg-gradient-to-t from-teal-300 to-rose-300"
                    style={{ height, animationDelay: `${index * 80}ms` }}
                  />
                ))}
              </div>
            </div>
            <div className="p-4 sm:p-6">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
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
                className="overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:rounded-[32px]"
              >
                <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="h-44 bg-gradient-to-br from-teal-100 via-rose-50 to-white sm:h-56 md:h-auto md:min-h-[260px]">
                    {music.image_url ? (
                      <img src={music.image_url} alt={music.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <div className="grid h-24 w-24 place-items-center rounded-[28px] bg-white/80 shadow-sm">
                          <div className="h-12 w-12 rounded-full border-8 border-teal-300 border-t-rose-300" />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Track {index + 1}</p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{music.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-500">{music.tags || '无标签'}</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{formatTime(music.duration)}</div>
                    </div>

                    {music.audio_url && !audioErrors[index] ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                        <audio
                          ref={(element) => { audioRefs.current[music.id] = element; }}
                          className="hidden"
                          src={music.audio_url}
                          preload="auto"
                          onLoadedMetadata={(event) => {
                            const duration = event.currentTarget.duration;
                            setAudioDurations((prev) => ({ ...prev, [music.id]: duration }));
                          }}
                          onTimeUpdate={(event) => {
                            if (seekingRef.current[music.id]) return;
                            const currentTime = event.currentTarget.currentTime;
                            setCurrentTimes((prev) => ({ ...prev, [music.id]: currentTime }));
                          }}
                          onEnded={() => {
                            setCurrentPlayingId(null);
                            setCurrentTimes((prev) => ({ ...prev, [music.id]: 0 }));
                          }}
                          onError={() => setAudioErrors((prev) => ({ ...prev, [index]: true }))}
                        />
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handlePlayPause(music.id)}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-700 text-white shadow-sm hover:bg-teal-800"
                            aria-label={currentPlayingId === music.id ? `暂停 ${music.title}` : `播放 ${music.title}`}
                          >
                            <span aria-hidden="true" className="text-base">{currentPlayingId === music.id ? 'Ⅱ' : '▶'}</span>
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center justify-between font-mono text-xs text-slate-500">
                              <span>{formatTime(currentTimes[music.id] || 0)}</span>
                              <span>{formatTime(audioDurations[music.id] || music.duration)}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max={audioDurations[music.id] || music.duration || 100}
                              step="0.1"
                              value={currentTimes[music.id] || 0}
                              onChange={(event) => handleSeek(music.id, Number(event.target.value))}
                              onPointerDown={(event) => {
                                event.currentTarget.setPointerCapture(event.pointerId);
                                handleSeekStart(music.id);
                              }}
                              onPointerUp={(event) => handleSeekEnd(music.id, Number(event.currentTarget.value))}
                              onPointerCancel={(event) => handleSeekEnd(music.id, Number(event.currentTarget.value))}
                              aria-label={`播放进度：${music.title}`}
                              className="music-progress h-2 w-full cursor-pointer appearance-none rounded-full"
                              style={{
                                background: `linear-gradient(to right, #0f766e ${Math.min(((currentTimes[music.id] || 0) / (audioDurations[music.id] || music.duration || 100)) * 100, 100)}%, #dbe5e3 0%)`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        音频链接暂时无法加载。可以稍后重新刷新结果。
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {music.audio_url && (
                        <a
                          href={music.audio_url}
                          download={`${music.title || 'music'}.mp3`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-teal-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-teal-800"
                        >
                          下载音频
                        </a>
                      )}
                      {music.audio_url && (
                        <button
                          type="button"
                          onClick={() => handleShareMusic(music)}
                          disabled={sharingTrackId === music.id}
                          className="rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100"
                        >
                          {sharingTrackId === music.id ? '正在生成链接…' : shareLinks[music.id] ? '复制分享链接' : '生成分享链接'}
                        </button>
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
                    {shareLinks[music.id] && (
                      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-3">
                        <label htmlFor={`share-link-${music.id}`} className="text-xs font-semibold text-teal-900">
                          分享链接
                        </label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input
                            id={`share-link-${music.id}`}
                            readOnly
                            value={shareLinks[music.id]}
                            onFocus={(event) => event.currentTarget.select()}
                            className="min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-500"
                          />
                          <a
                            href={shareLinks[music.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl border border-teal-200 bg-white px-4 py-2 text-center text-sm font-medium text-teal-800 hover:bg-teal-100"
                          >
                            打开链接
                          </a>
                        </div>
                      </div>
                    )}
                    {shareErrors[music.id] && (
                      <p role="alert" className="text-sm text-red-700">{shareErrors[music.id]}</p>
                    )}
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
