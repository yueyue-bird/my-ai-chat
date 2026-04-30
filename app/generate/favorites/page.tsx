// app/generate/favorites/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
  note?: string;
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

// 解析 AI 返回的标签
const parseMusicAttributes = (prompt: string, tags: string): MusicAttributes => {
  const attributes: MusicAttributes = {
    genre: [],
    mood: [],
    instruments: [],
    description: '',
    tags: [],
  };

  // 解析 tags 字段
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim());
    attributes.tags = tagList;
    
    // 尝试识别风格
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
    
    // 尝试识别情绪
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
    
    // 尝试识别乐器
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
    
    // 尝试识别速度
    const tempoKeywords = ['slow', 'medium', 'fast', 'upbeat', 'downbeat', 'moderate'];
    for (const tag of tagList) {
      const lowerTag = tag.toLowerCase();
      if (tempoKeywords.some(t => lowerTag.includes(t))) {
        attributes.tempo = lowerTag;
        break;
      }
    }
  }
  
  // 从 prompt 中提取描述
  if (prompt && prompt !== '[Instrumental]') {
    attributes.description = prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt;
  }
  
  return attributes;
};

const getFavorites = (): FavoriteMusic[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('music_favorites');
  const favorites = stored ? JSON.parse(stored) : [];
  return favorites.map((fav: FavoriteMusic) => ({ ...fav, note: fav.note || '' }));
};

const saveFavorites = (favorites: FavoriteMusic[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('music_favorites', JSON.stringify(favorites));
};

export default function FavoritesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from');
  const fromTaskId = searchParams.get('taskId');
  
  const [favorites, setFavorites] = useState<FavoriteMusic[]>([]);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Record<string, number>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<string>('');
  const [audioErrors, setAudioErrors] = useState<Record<string, boolean>>({});
  const [showAttributesModal, setShowAttributesModal] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<any>(null);
  const [musicAttributes, setMusicAttributes] = useState<MusicAttributes | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const animationRefs = useRef<Record<string, number>>({});

  useEffect(() => {
    const favs = getFavorites();
    favs.sort((a, b) => b.createdAt - a.createdAt);
    setFavorites(favs);
    
    const initialTimes: Record<string, number> = {};
    const initialDurations: Record<string, number> = {};
    favs.forEach(music => {
      initialTimes[music.id] = 0;
      initialDurations[music.id] = music.duration || 0;
    });
    setCurrentTime(initialTimes);
    setDurations(initialDurations);
  }, []);

  // 打开属性面板
  const handleShowAttributes = (music: FavoriteMusic) => {
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

  const handleRemoveFavorite = (id: string) => {
    const newFavorites = favorites.filter(fav => fav.id !== id);
    saveFavorites(newFavorites);
    setFavorites(newFavorites);
    
    if (currentPlayingId === id) {
      const audio = audioRefs.current[id];
      if (audio) audio.pause();
      if (animationRefs.current[id]) cancelAnimationFrame(animationRefs.current[id]);
      setCurrentPlayingId(null);
    }
  };

  const updateProgress = (id: string) => {
    const audio = audioRefs.current[id];
    if (audio && !audio.paused) {
      setCurrentTime(prev => ({ ...prev, [id]: audio.currentTime }));
      animationRefs.current[id] = requestAnimationFrame(() => updateProgress(id));
    }
  };

  const handlePlayPause = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    if (currentPlayingId === id) {
      audio.pause();
      if (animationRefs.current[id]) cancelAnimationFrame(animationRefs.current[id]);
      setCurrentPlayingId(null);
    } else {
      if (currentPlayingId) {
        const prevAudio = audioRefs.current[currentPlayingId];
        if (prevAudio) prevAudio.pause();
        if (animationRefs.current[currentPlayingId]) cancelAnimationFrame(animationRefs.current[currentPlayingId]);
      }
      
      audio.play().catch(() => {
        setAudioErrors(prev => ({ ...prev, [id]: true }));
      });
      setCurrentPlayingId(id);
      updateProgress(id);
    }
  };

  const handleAudioEnded = (id: string) => {
    setCurrentPlayingId(null);
    setCurrentTime(prev => ({ ...prev, [id]: 0 }));
    if (animationRefs.current[id]) cancelAnimationFrame(animationRefs.current[id]);
  };

  const handleLoadedMetadata = (id: string) => {
    const audio = audioRefs.current[id];
    if (audio) setDurations(prev => ({ ...prev, [id]: audio.duration }));
  };

  const handleAudioError = (id: string) => {
    setAudioErrors(prev => ({ ...prev, [id]: true }));
  };

  const handleSeek = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRefs.current[id];
    if (audio) {
      const newTime = parseFloat(e.target.value);
      audio.currentTime = newTime;
      setCurrentTime(prev => ({ ...prev, [id]: newTime }));
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === undefined) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBack = () => {
    if (from === 'result' && fromTaskId) {
      router.push(`/generate/result/${fromTaskId}?from=favorites`);
    } else {
      const sortedFavorites = [...favorites].sort((a, b) => b.createdAt - a.createdAt);
      const latestTaskId = sortedFavorites.length > 0 ? sortedFavorites[0].taskId : null;
      if (latestTaskId) {
        router.push(`/generate?taskId=${latestTaskId}`);
      } else {
        router.push('/generate');
      }
    }
  };

  const handleGoToGenerate = () => {
    router.push('/generate');
  };

  const getProgressPercent = (id: string) => {
    const duration = durations[id];
    const time = currentTime[id] || 0;
    if (duration && duration > 0 && !audioErrors[id]) return (time / duration) * 100;
    return 0;
  };

  const handleStartEditNote = (id: string, currentNote: string) => {
    setEditingNoteId(id);
    setNoteInput(currentNote);
  };

  const handleSaveNote = (id: string) => {
    const updatedFavorites = favorites.map(fav => fav.id === id ? { ...fav, note: noteInput } : fav);
    setFavorites(updatedFavorites);
    saveFavorites(updatedFavorites);
    setEditingNoteId(null);
    setNoteInput('');
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
    setNoteInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') handleSaveNote(id);
    else if (e.key === 'Escape') handleCancelEditNote();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* 属性模态框 */}
        {showAttributesModal && musicAttributes && selectedMusic && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={handleCloseModal}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
                <h3 className="text-xl font-bold text-white">歌曲属性</h3>
                <p className="text-white/80 text-sm mt-1">{selectedMusic.title}</p>
              </div>
              <div className="p-6 space-y-4">
                {/* 风格 */}
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
                
                {/* 情绪 */}
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
                
                {/* 速度 */}
                {musicAttributes.tempo && (
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wider">速度</label>
                    <div className="mt-1">
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">{musicAttributes.tempo}</span>
                    </div>
                  </div>
                )}
                
                {/* 乐器 */}
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
                
                {/* 原始标签 */}
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
                
                {/* 描述 */}
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

        <div className="flex justify-between items-center mb-8">
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-white/20 transition-all"
            >
              <span>←</span> 
              {from === 'result' ? '返回结果页面' : '返回生成页面'}
            </button>
            
            <button
              onClick={handleGoToGenerate}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-white/20 transition-all"
            >
              <span>🎵</span> 新生成
            </button>
          </div>
          
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">⭐</span> 我的收藏夹
            <span className="text-sm bg-white/20 px-2 py-0.5 rounded-full">
              {favorites.length}首
            </span>
          </h1>
          
          <div className="w-32"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-2xl mb-1">🎵</div>
            <div className="text-white/60 text-sm">总曲目</div>
            <div className="text-white text-2xl font-bold">{favorites.length}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-2xl mb-1">⏱️</div>
            <div className="text-white/60 text-sm">总时长</div>
            <div className="text-white text-2xl font-bold">
              {Math.floor(favorites.reduce((acc, m) => acc + (m.duration || 0), 0) / 60)}分钟
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-2xl mb-1">⭐</div>
            <div className="text-white/60 text-sm">收藏日期</div>
            <div className="text-white text-sm">
              {favorites.length > 0 ? new Date(favorites[0]?.createdAt).toLocaleDateString() : '-'}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="text-2xl mb-1">📝</div>
            <div className="text-white/60 text-sm">有备注</div>
            <div className="text-white text-2xl font-bold">
              {favorites.filter(f => f.note && f.note.trim()).length}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-100 border-b border-gray-200 text-sm text-gray-500 font-medium">
            <div className="col-span-1 text-center">播放</div>
            <div className="col-span-4">歌曲</div>
            <div className="col-span-3">时长</div>
            <div className="col-span-3">备注</div>
            <div className="col-span-1 text-center">操作</div>
          </div>

          <div className="divide-y divide-gray-100">
            {favorites.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">🎵</div>
                <p className="text-gray-400 mb-4">暂无收藏的音乐</p>
                <button
                  onClick={handleGoToGenerate}
                  className="px-6 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700"
                >
                  去生成音乐
                </button>
              </div>
            ) : (
              favorites.map((music) => {
                const isPlaying = currentPlayingId === music.id;
                const isExpired = audioErrors[music.id];
                const progress = getProgressPercent(music.id);
                
                return (
                  <div
                    key={music.id}
                    className={`group grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-gray-50 transition-colors ${
                      isPlaying ? 'bg-gray-50' : ''
                    } ${isExpired ? 'opacity-60' : ''}`}
                  >
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
                    </div>

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
                        <div className="text-xs text-gray-400">
                          {new Date(music.createdAt).toLocaleDateString()}
                          {isExpired && (
                            <span className="ml-2 text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full text-xs">
                              链接失效
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-3">
                      {isExpired ? (
                        <div className="text-sm text-red-400">请重新生成</div>
                      ) : isPlaying ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500">
                              {formatTime(currentTime[music.id] || 0)}
                            </span>
                            <span className="text-xs text-gray-400">
                              / {formatTime(durations[music.id] || music.duration || 0)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max={durations[music.id] || music.duration || 100}
                            value={currentTime[music.id] || 0}
                            onChange={(e) => handleSeek(music.id, e)}
                            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, #6b7280 ${progress}%, #e5e7eb ${progress}%)`
                            }}
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">
                          {music.duration ? formatTime(music.duration) : '--:--'}
                        </div>
                      )}
                    </div>

                    <div className="col-span-3">
                      {editingNoteId === music.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={noteInput}
                            onChange={(e) => setNoteInput(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, music.id)}
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
                            placeholder="输入备注..."
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveNote(music.id)}
                            className="p-1 text-green-600 hover:text-green-700"
                          >
                            ✓
                          </button>
                          <button
                            onClick={handleCancelEditNote}
                            className="p-1 text-red-500 hover:text-red-600"
                          >
                            ✗
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => handleStartEditNote(music.id, music.note || '')}
                          className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 min-h-[2rem] py-1 px-2 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          {music.note && music.note.trim() ? (
                            <span className="text-gray-700">{music.note}</span>
                          ) : (
                            <span className="text-gray-400 italic">点击添加备注</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="col-span-1 text-center flex items-center justify-center gap-1">
                      {/* 属性按钮 */}
                      <button
                        onClick={() => handleShowAttributes(music)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-500 text-sm"
                        title="查看属性"
                      >
                        ⚙️
                      </button>
                      {/* 删除按钮 */}
                      <button
                        onClick={() => handleRemoveFavorite(music.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 text-sm"
                      >
                        删除
                      </button>
                    </div>

                    <audio
                      ref={el => { if (el) audioRefs.current[music.id] = el; }}
                      src={music.audio_url}
                      onEnded={() => handleAudioEnded(music.id)}
                      onLoadedMetadata={() => handleLoadedMetadata(music.id)}
                      onError={() => handleAudioError(music.id)}
                      className="hidden"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}