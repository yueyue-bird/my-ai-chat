// app/generate/result/[taskId]/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

// 收藏夹相关类型定义
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

// 历史记录类型定义
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

// 音乐属性接口
interface MusicAttributes {
  genre?: string[];
  mood?: string[];
  tempo?: string;
  instruments?: string[];
  description?: string;
  tags?: string[];
}

// 收藏夹工具函数
const getFavorites = (): FavoriteMusic[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('music_favorites');
  return stored ? JSON.parse(stored) : [];
};

const saveFavorites = (favorites: FavoriteMusic[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('music_favorites', JSON.stringify(favorites));
};

const addToFavorites = (music: FavoriteMusic): boolean => {
  const favorites = getFavorites();
  if (favorites.some(fav => fav.id === music.id)) return false;
  favorites.push(music);
  saveFavorites(favorites);
  return true;
};

const removeFromFavorites = (musicId: string): boolean => {
  const favorites = getFavorites();
  const newFavorites = favorites.filter(fav => fav.id !== musicId);
  saveFavorites(newFavorites);
  return true;
};

const isFavorite = (musicId: string): boolean => {
  const favorites = getFavorites();
  return favorites.some(fav => fav.id === musicId);
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

const addToHistory = (music: HistoryMusic): boolean => {
  const history = getHistory();
  if (history.some(h => h.taskId === music.taskId)) return false;
  history.unshift(music);
  const trimmedHistory = history.slice(0, 50);
  saveHistory(trimmedHistory);
  return true;
};

const updateHistoryFavoriteStatus = (taskId: string, isFavorite: boolean) => {
  const history = getHistory();
  const updatedHistory = history.map(item => 
    item.taskId === taskId ? { ...item, isFavorite } : item
  );
  saveHistory(updatedHistory);
};

// 解析 AI 返回的标签
const parseMusicAttributes = (prompt: string, tags: string): MusicAttributes => {
  const attributes: MusicAttributes = {
    genre: [],
    mood: [],
    instruments: [],
    description: '',
    tags: [],
  };

  if (tags) {
    const tagList = tags.split(',').map(t => t.trim());
    attributes.tags = tagList;
    
    const genreKeywords = ['pop', 'rock', 'jazz', 'classical', 'electronic', 'ambient', 'cinematic', 'lofi', 'hip hop', 'r&b', 'blues', 'metal', 'punk', 'folk', 'country'];
    for (const tag of tagList) {
      const lowerTag = tag.toLowerCase();
      for (const genre of genreKeywords) {
        if (lowerTag.includes(genre)) {
          attributes.genre.push(genre);
          break;
        }
      }
    }
    
    const moodKeywords = ['happy', 'sad', 'energetic', 'calm', 'relaxing', 'peaceful', 'melancholic', 'upbeat', 'dark', 'bright', 'dreamy', 'aggressive', 'soft', 'emotional'];
    for (const tag of tagList) {
      const lowerTag = tag.toLowerCase();
      for (const mood of moodKeywords) {
        if (lowerTag.includes(mood)) {
          attributes.mood.push(mood);
          break;
        }
      }
    }
    
    const instrumentKeywords = ['piano', 'guitar', 'violin', 'drums', 'synth', 'bass', 'flute', 'cello', 'trumpet', 'saxophone', 'voice', 'vocal', 'strings', 'orchestra'];
    for (const tag of tagList) {
      const lowerTag = tag.toLowerCase();
      for (const instrument of instrumentKeywords) {
        if (lowerTag.includes(instrument)) {
          attributes.instruments.push(instrument);
          break;
        }
      }
    }
    
    const tempoKeywords = ['slow', 'medium', 'fast', 'upbeat', 'downbeat', 'moderate'];
    for (const tag of tagList) {
      const lowerTag = tag.toLowerCase();
      if (tempoKeywords.some(t => lowerTag.includes(t))) {
        attributes.tempo = lowerTag;
        break;
      }
    }
  }
  
  if (prompt && prompt !== '[Instrumental]') {
    attributes.description = prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt;
  }
  
  return attributes;
};

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params?.taskId as string;
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollingCount, setPollingCount] = useState(0);
  const [audioErrors, setAudioErrors] = useState<Record<number, boolean>>({});
  const [favoriteStatus, setFavoriteStatus] = useState<Record<number, boolean>>({});
  const [showFavoriteToast, setShowFavoriteToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showAttributesModal, setShowAttributesModal] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<any>(null);
  const [musicAttributes, setMusicAttributes] = useState<MusicAttributes | null>(null);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const initialDelayRef = useRef<NodeJS.Timeout | null>(null);
  const savedToHistoryRef = useRef<boolean>(false);

  const handleAudioError = (index: number) => {
    setAudioErrors(prev => ({ ...prev, [index]: true }));
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setShowFavoriteToast(true);
    setTimeout(() => setShowFavoriteToast(false), 2000);
  };

  const handleToggleFavorite = (music: any, index: number) => {
    const musicId = music.id || `music_${Date.now()}_${index}`;
    const isFav = favoriteStatus[index];
    
    if (isFav) {
      removeFromFavorites(musicId);
      setFavoriteStatus(prev => ({ ...prev, [index]: false }));
      updateHistoryFavoriteStatus(taskId, false);
      showToast(`已从收藏夹移除：「${music.title}」`);
    } else {
      const favoriteMusic: FavoriteMusic = {
        id: musicId,
        taskId: taskId,
        title: music.title || '未命名作品',
        tags: music.tags || '',
        audio_url: music.audio_url,
        image_url: music.image_url,
        prompt: music.prompt || '',
        duration: music.duration || 0,
        createdAt: Date.now(),
      };
      const success = addToFavorites(favoriteMusic);
      if (success) {
        setFavoriteStatus(prev => ({ ...prev, [index]: true }));
        updateHistoryFavoriteStatus(taskId, true);
        showToast(`已添加到收藏夹：「${music.title}」`);
      } else {
        showToast('该音乐已在收藏夹中');
      }
    }
  };

  // 打开属性面板
  const handleShowAttributes = (music: any) => {
    setSelectedMusic(music);
    const attributes = parseMusicAttributes(music.prompt || '', music.tags || '');
    setMusicAttributes(attributes);
    setShowAttributesModal(true);
  };

  // 关闭属性面板
  const handleCloseModal = () => {
    setShowAttributesModal(false);
    setSelectedMusic(null);
    setMusicAttributes(null);
  };

  useEffect(() => {
    if (result) {
      const musicList = Array.isArray(result) ? result : [result];
      const status: Record<number, boolean> = {};
      musicList.forEach((music, idx) => {
        const musicId = music.id || `music_${Date.now()}_${idx}`;
        status[idx] = isFavorite(musicId);
      });
      setFavoriteStatus(status);
    }
  }, [result]);

  const fetchMusicData = async () => {
    if (!taskId || !isMountedRef.current) return null;
    
    try {
      console.log(`[轮询 ${pollingCount}] 请求 taskId: ${taskId}`);
      const res = await fetch(`/api/chat/suno/fetch?taskId=${taskId}`);
      const data = await res.json();
      
      if (!res.ok) {
        return { success: false, pending: true };
      }
      
      if (data.code === 200 && data.data) {
        const taskStatus = data.data.status;
        
        if (taskStatus === 'SUCCESS' || taskStatus === 'COMPLETED' || taskStatus === 'finished') {
          let musicList = [];
          
          if (data.data.response?.sunoData) {
            musicList = data.data.response.sunoData;
          } else if (data.data.sunoData) {
            musicList = data.data.sunoData;
          } else if (Array.isArray(data.data)) {
            musicList = data.data;
          } else if (data.data.response && Array.isArray(data.data.response)) {
            musicList = data.data.response;
          }
          
          if (musicList.length === 0 && (data.data.audioUrl || data.data.audio_url)) {
            musicList = [data.data];
          }
          
          if (musicList.length > 0) {
            const formattedMusic = musicList.map((music: any, idx: number) => {
              let audioUrl = music.audioUrl || music.audio_url || music.audio || music.url;
              
              if (audioUrl && audioUrl.startsWith('/')) {
                audioUrl = `https://api.sunoapi.org${audioUrl}`;
              }
              
              return {
                title: music.title || '未命名',
                tags: music.tags || '',
                audio_url: audioUrl,
                image_url: music.imageUrl || music.image_url || music.image,
                prompt: music.prompt,
                duration: music.duration,
                id: music.id || `${taskId}_${idx}`,
              };
            });
            
            // 保存到历史记录（只保存一次）
            if (!savedToHistoryRef.current && formattedMusic.length > 0) {
              const firstMusic = formattedMusic[0];
              const historyItem: HistoryMusic = {
                id: firstMusic.id,
                taskId: taskId,
                title: firstMusic.title,
                tags: firstMusic.tags,
                audio_url: firstMusic.audio_url,
                image_url: firstMusic.image_url,
                prompt: firstMusic.prompt || '',
                duration: firstMusic.duration || 0,
                createdAt: Date.now(),
                isFavorite: false,
              };
              addToHistory(historyItem);
              savedToHistoryRef.current = true;
              console.log('已保存到历史记录');
            }
            
            return { success: true, data: formattedMusic };
          }
        }
        
        if (taskStatus === 'FAILURE' || taskStatus === 'failed' || taskStatus === 'ERROR') {
          return { success: false, error: '生成失败：' + (data.data.errorMessage || '未知错误') };
        }
      }
      
      return { success: false, pending: true };
      
    } catch (err: any) {
      console.error('获取数据错误:', err);
      return { success: false, error: err.message, pending: true };
    }
  };

  const startPolling = async () => {
    if (!taskId) return;
    
    let attempts = 0;
    const maxAttempts = 40;
    
    const firstResult = await fetchMusicData();
    
    if (!isMountedRef.current) return;
    
    if (firstResult?.success && firstResult.data) {
      setResult(firstResult.data);
      setLoading(false);
      return;
    }
    
    pollingRef.current = setInterval(async () => {
      if (!isMountedRef.current) return;
      
      attempts++;
      setPollingCount(attempts);
      
      const result = await fetchMusicData();
      
      if (!isMountedRef.current) return;
      
      if (result?.success && result.data) {
        setResult(result.data);
        setLoading(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (result?.error && !result.pending) {
        setError(result.error);
        setLoading(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (attempts >= maxAttempts) {
        setError('生成超时，请稍后重试');
        setLoading(false);
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    }, 3000);
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

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    setPollingCount(0);
    if (pollingRef.current) clearInterval(pollingRef.current);
    startPolling();
  };

  const handleBackToGenerate = () => router.push(`/generate?taskId=${taskId}`);
  const handleGoToFavorites = () => router.push(`/generate/favorites?from=result&taskId=${taskId}`);
  const handleGoToHistory = () => router.push('/generate/history');

  if (!taskId && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">错误</h1>
            <p className="text-gray-600 mb-4">缺少任务ID，无法获取音乐生成结果。</p>
            <button onClick={handleBackToGenerate} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">返回生成页面</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4">
      {/* Toast 提示 */}
      {showFavoriteToast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-down">
          <div className={`px-4 py-2 rounded-lg shadow-lg ${toastMessage.includes('移除') ? 'bg-gray-800 text-white' : 'bg-green-500 text-white'}`}>
            {toastMessage}
          </div>
        </div>
      )}

      {/* 属性模态框 */}
      {showAttributesModal && musicAttributes && selectedMusic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={handleCloseModal}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">歌曲属性</h3>
              <p className="text-white/80 text-sm mt-1">{selectedMusic.title}</p>
            </div>
            <div className="p-6 space-y-4">
              {musicAttributes.genre && musicAttributes.genre.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider">风格</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {musicAttributes.genre.map((g, i) => (
                      <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 text-sm rounded-full">{g}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {musicAttributes.mood && musicAttributes.mood.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider">情绪</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {musicAttributes.mood.map((m, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {musicAttributes.tempo && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider">速度</label>
                  <div className="mt-1">
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">{musicAttributes.tempo}</span>
                  </div>
                </div>
              )}
              
              {musicAttributes.instruments && musicAttributes.instruments.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider">乐器</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {musicAttributes.instruments.map((i, idx) => (
                      <span key={idx} className="px-2 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">{i}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {musicAttributes.tags && musicAttributes.tags.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider">原始标签</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {musicAttributes.tags.slice(0, 8).map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">{tag}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {musicAttributes.description && (
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wider">描述</label>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{musicAttributes.description}</p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        {/* 顶部导航栏 */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            <button onClick={handleBackToGenerate} className="flex items-center text-gray-600 hover:text-gray-900">
              <span className="mr-1">←</span> 返回生成页面
            </button>
            <button
              onClick={handleGoToHistory}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <span>📜</span> 历史记录
            </button>
          </div>
          <button onClick={handleGoToFavorites} className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100">
            <span>⭐</span> 我的收藏夹
          </button>
        </div>

        <h1 className="text-3xl font-bold text-center mb-8">🎵 音乐生成结果</h1>

        <div className="bg-white rounded-xl shadow-lg p-6">
          {loading && !error && (
            <div className="p-3 bg-blue-100 text-blue-700 rounded-lg">
              <div className="flex items-center">
                <span className="animate-spin mr-2">⏳</span>
                <div><p>AI 正在创作中... (任务ID: {taskId})</p><p className="text-xs mt-1">轮询次数: {pollingCount}/40</p></div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">
              <p>{error}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={handleRefresh} className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700">重新加载</button>
                <button onClick={handleBackToGenerate} className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700">返回重新生成</button>
              </div>
            </div>
          )}

          {result && !loading && !error && (
            <div className="space-y-4">
              {(Array.isArray(result) ? result : [result]).map((music, index) => (
                <div key={music.id || index} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md">
                  <div className="flex flex-col md:flex-row">
                    {music.image_url && (
                      <div className="md:w-48 h-48 flex-shrink-0 relative">
                        <img src={music.image_url} alt={music.title || '音乐封面'} className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                      </div>
                    )}
                    <div className="flex-1 p-6">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold text-gray-900">{music.title || '未命名作品'}</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleShowAttributes(music)}
                            className="p-2 rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                            title="查看属性"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleToggleFavorite(music, index)}
                            className={`p-2 rounded-full transition-all ${favoriteStatus[index] ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-yellow-500'}`}
                          >
                            <span className="text-2xl">{favoriteStatus[index] ? '⭐' : '☆'}</span>
                          </button>
                        </div>
                      </div>

                      {music.audio_url && !audioErrors[index] && (
                        <div className="space-y-3">
                          <audio controls className="w-full" src={music.audio_url} onError={() => handleAudioError(index)} />
                          <details className="text-xs text-gray-400"><summary>音频链接（点击查看）</summary><p className="mt-1 break-all">{music.audio_url}</p></details>
                          <div className="flex gap-2">
                            <a href={music.audio_url} download={`${music.title || 'music'}.mp3`} className="flex-1 text-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700" target="_blank" rel="noopener noreferrer">⬇️ 下载音频</a>
                            <button onClick={() => { navigator.clipboard.writeText(music.audio_url || ''); alert('链接已复制到剪贴板'); }} className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200">🔗 复制链接</button>
                          </div>
                        </div>
                      )}

                      {audioErrors[index] && (
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg">
                          <p>音频加载失败</p>
                          <p className="text-xs mt-1 break-all">URL: {music.audio_url}</p>
                          <button onClick={() => window.open(music.audio_url, '_blank')} className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded">在新窗口打开</button>
                        </div>
                      )}

                      {music.prompt && music.prompt !== '[Instrumental]' && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">{music.prompt}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-center gap-4 mt-6">
                <button onClick={handleBackToGenerate} className="px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700">🎵 生成新音乐</button>
                <button onClick={handleRefresh} className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700">🔄 刷新结果</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in-down { animation: fadeInDown 0.3s ease-out; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}