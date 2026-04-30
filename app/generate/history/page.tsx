// app/generate/history/page.tsx

'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// 类型定义
interface HistoryMusic {
  id: string;
  taskId: string;
  title: string;
  tags: string;
  audio_url: string;
  image_url: string;
  prompt: string;
  duration: number;
  createdAt: number;
  isFavorite: boolean;
}

// 收藏夹工具函数
const getFavs = (): any[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('music_favorites');
  return stored ? JSON.parse(stored) : [];
};

const saveFavs = (favorites: any[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('music_favorites', JSON.stringify(favorites));
};

const isFav = (taskId: string): boolean => {
  const favorites = getFavs();
  return favorites.some(f => f.taskId === taskId);
};

const addToFav = (music: any): boolean => {
  const favorites = getFavs();
  if (favorites.some(f => f.taskId === music.taskId)) return false;
  favorites.push(music);
  saveFavs(favorites);
  return true;
};

const removeFromFav = (taskId: string): boolean => {
  const favorites = getFavs();
  const newFavorites = favorites.filter(f => f.taskId !== taskId);
  saveFavs(newFavorites);
  return true;
};

// 历史记录工具函数
const getHistory = (): HistoryMusic[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('music_history');
  return stored ? JSON.parse(stored) : [];
};

const saveHistory = (history: HistoryMusic[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('music_history', JSON.stringify(history));
};

const removeFromHistory = (taskId: string) => {
  const history = getHistory();
  const newHistory = history.filter(item => item.taskId !== taskId);
  saveHistory(newHistory);
};

const clearHistory = () => {
  saveHistory([]);
};

const updateHistoryFavoriteStatus = (taskId: string, isFavorite: boolean) => {
  const history = getHistory();
  const updatedHistory = history.map(item => 
    item.taskId === taskId ? { ...item, isFavorite } : item
  );
  saveHistory(updatedHistory);
};

export default function HistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 获取来源页面参数
  const from = searchParams.get('from');
  const fromTaskId = searchParams.get('taskId');
  
  const [history, setHistory] = useState<HistoryMusic[]>([]);
  const [audioErrors, setAudioErrors] = useState<Record<string, boolean>>({});
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    const hist = getHistory();
    const updatedHist = hist.map(item => ({
      ...item,
      isFavorite: isFav(item.taskId)
    }));
    setHistory(updatedHist);
  };

  const handlePlayPause = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    if (currentPlayingId === id) {
      audio.pause();
      setCurrentPlayingId(null);
    } else {
      if (currentPlayingId) {
        const prevAudio = audioRefs.current[currentPlayingId];
        if (prevAudio) prevAudio.pause();
      }
      audio.play().catch(() => {
        setAudioErrors(prev => ({ ...prev, [id]: true }));
      });
      setCurrentPlayingId(id);
    }
  };

  const handleToggleFavorite = (music: HistoryMusic) => {
    if (music.isFavorite) {
      removeFromFav(music.taskId);
      updateHistoryFavoriteStatus(music.taskId, false);
    } else {
      const favoriteMusic = {
        id: music.id,
        taskId: music.taskId,
        title: music.title,
        tags: music.tags,
        audio_url: music.audio_url,
        image_url: music.image_url,
        prompt: music.prompt,
        duration: music.duration,
        createdAt: Date.now(),
        note: '',
      };
      addToFav(favoriteMusic);
      updateHistoryFavoriteStatus(music.taskId, true);
    }
    loadHistory();
  };

  const handleDelete = (taskId: string) => {
    if (confirm('确定要删除这条历史记录吗？')) {
      removeFromHistory(taskId);
      loadHistory();
    }
  };

  const handleClearAll = () => {
    if (confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
      clearHistory();
      loadHistory();
    }
  };

  const handleGoToResult = (taskId: string) => {
    router.push(`/generate/result/${taskId}?from=history`);
  };

  // ===== 智能返回按钮 - 回到进入历史记录之前的页面 =====
  const handleBack = () => {
    if (from === 'result' && fromTaskId) {
      // 从结果页面进入，返回结果页面
      router.push(`/generate/result/${fromTaskId}?from=history`);
    } else {
      // 从生成页面进入或其他情况，返回生成页面
      router.push('/generate');
    }
  };

  // 单独的去生成页面按钮
  const handleGoToGenerate = () => {
    router.push('/generate');
  };

  const formatTime = (seconds: number) => {
    if (!seconds || seconds === 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return `今天 ${date.toLocaleTimeString().slice(0, 5)}`;
    } else if (days === 1) {
      return `昨天 ${date.toLocaleTimeString().slice(0, 5)}`;
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* 顶部导航栏 - 双按钮布局 */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex gap-3">
            {/* 智能返回按钮 */}
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-white/20 transition-all"
            >
              <span>←</span> 
              {from === 'result' ? '返回结果页面' : '返回生成页面'}
            </button>
            
            {/* 新生成按钮 */}
            <button
              onClick={handleGoToGenerate}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-white/20 transition-all"
            >
              <span>🎵</span> 新生成
            </button>
          </div>
          
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">📜</span> 生成历史
            <span className="text-sm bg-white/20 px-2 py-0.5 rounded-full">
              {history.length}条
            </span>
          </h1>
          
          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-4 py-2 bg-red-500/20 text-red-300 rounded-xl hover:bg-red-500/30 transition-all"
            >
              清空全部
            </button>
          )}
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-2xl mb-1">🎵</div>
            <div className="text-white/60 text-sm">总生成次数</div>
            <div className="text-white text-2xl font-bold">{history.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-2xl mb-1">⭐</div>
            <div className="text-white/60 text-sm">已收藏</div>
            <div className="text-white text-2xl font-bold">
              {history.filter(h => h.isFavorite).length}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-2xl mb-1">⏱️</div>
            <div className="text-white/60 text-sm">总时长</div>
            <div className="text-white text-2xl font-bold">
              {Math.floor(history.reduce((acc, m) => acc + (m.duration || 0), 0) / 60)}分钟
            </div>
          </div>
        </div>

        {/* 历史记录列表 */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-100 border-b border-gray-200 text-sm text-gray-500 font-medium">
            <div className="col-span-1 text-center">播放</div>
            <div className="col-span-4">歌曲信息</div>
            <div className="col-span-2">时长</div>
            <div className="col-span-2">生成时间</div>
            <div className="col-span-3 text-center">操作</div>
          </div>

          <div className="divide-y divide-gray-100">
            {history.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">📜</div>
                <p className="text-gray-400 mb-4">暂无生成历史</p>
                <button
                  onClick={handleGoToGenerate}
                  className="px-6 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700"
                >
                  去生成音乐
                </button>
              </div>
            ) : (
              history.map((music) => {
                const isPlaying = currentPlayingId === music.id;
                const isExpired = audioErrors[music.id];
                
                return (
                  <div
                    key={music.id}
                    className="group grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-gray-50 transition-colors"
                  >
                    {/* 播放按钮 */}
                    <div className="col-span-1 text-center">
                      <button
                        onClick={() => handlePlayPause(music.id)}
                        disabled={isExpired}
                        className={`text-gray-500 transition-colors text-lg w-6 h-6 flex items-center justify-center ${
                          isExpired ? 'opacity-30 cursor-not-allowed' : 'hover:text-gray-700'
                        }`}
                      >
                        {isPlaying ? '⏸' : '▶'}
                      </button>
                      <audio
                        ref={el => { if (el) audioRefs.current[music.id] = el; }}
                        src={music.audio_url}
                        onEnded={() => setCurrentPlayingId(null)}
                        onError={() => setAudioErrors(prev => ({ ...prev, [music.id]: true }))}
                        className="hidden"
                      />
                    </div>

                    {/* 歌曲信息 */}
                    <div className="col-span-4 flex items-center gap-3">
                      {music.image_url ? (
                        <img
                          src={music.image_url}
                          alt={music.title}
                          className="w-10 h-10 rounded-lg object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                          🎵
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-gray-800">{music.title}</div>
                        <div className="text-xs text-gray-400 truncate max-w-xs">
                          {music.tags || '无标签'}
                        </div>
                      </div>
                    </div>

                    {/* 时长 */}
                    <div className="col-span-2 text-sm text-gray-500">
                      {formatTime(music.duration)}
                    </div>

                    {/* 生成时间 */}
                    <div className="col-span-2 text-sm text-gray-500">
                      {formatDate(music.createdAt)}
                    </div>

                    {/* 操作按钮 */}
                    <div className="col-span-3 flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleGoToResult(music.taskId)}
                        className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        查看详情
                      </button>
                      <button
                        onClick={() => handleToggleFavorite(music)}
                        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                          music.isFavorite
                            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {music.isFavorite ? '⭐ 已收藏' : '☆ 收藏'}
                      </button>
                      <button
                        onClick={() => handleDelete(music.taskId)}
                        className="px-3 py-1.5 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200 transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}