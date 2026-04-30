// util/historyClient.ts
import { HistoryMusic } from '@/types/history';

// 获取所有历史记录
export const getHistory = (): HistoryMusic[] => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('music_history');
  return stored ? JSON.parse(stored) : [];
};

// 保存历史记录
export const saveHistory = (history: HistoryMusic[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('music_history', JSON.stringify(history));
};

// 添加历史记录（去重）
export const addToHistory = (music: HistoryMusic): boolean => {
  const history = getHistory();
  // 检查是否已存在（按 taskId 去重）
  if (history.some(h => h.taskId === music.taskId)) {
    return false;
  }
  history.unshift(music); // 添加到开头
  // 只保留最近 50 条记录
  const trimmedHistory = history.slice(0, 50);
  saveHistory(trimmedHistory);
  return true;
};

// 更新历史记录中的收藏状态
export const updateHistoryFavoriteStatus = (taskId: string, isFavorite: boolean) => {
  const history = getHistory();
  const updatedHistory = history.map(item => 
    item.taskId === taskId ? { ...item, isFavorite } : item
  );
  saveHistory(updatedHistory);
};

// 删除历史记录
export const removeFromHistory = (taskId: string) => {
  const history = getHistory();
  const newHistory = history.filter(item => item.taskId !== taskId);
  saveHistory(newHistory);
};

// 清空所有历史记录
export const clearHistory = () => {
  saveHistory([]);
};