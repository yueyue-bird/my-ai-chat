// types/history.ts
export interface HistoryMusic {
  id: string;           // 唯一标识
  taskId: string;       // Suno 任务ID
  title: string;        // 歌曲标题
  tags: string;         // 风格标签
  audio_url: string;    // 音频链接
  image_url: string;    // 封面图片
  prompt: string;       // 歌词/描述
  duration: number;     // 时长（秒）
  createdAt: number;    // 生成时间戳
  isFavorite: boolean;  // 是否已收藏
}