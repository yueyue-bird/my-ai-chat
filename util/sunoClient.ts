// util/sunoClient.ts
// 直接使用 fetch 调用 Suno API，不依赖 SDK

// 定义参数类型
interface CreateMusicParams {
  customMode?: boolean;
  instrumental?: boolean;
  model?: string;
  prompt?: string;
  style?: string;
  title?: string;
  callBackUrl: string;
  [key: string]: any;
}

interface CreateMusicResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  } | null;
}

interface FetchMusicResponse {
  code: number;
  msg: string;
  data: any;
}

// 创建音乐
export const createMusic = async (params: CreateMusicParams): Promise<CreateMusicResponse> => {
  const apiKey = process.env.SUNO_API_KEY;
  const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';
  
  if (!apiKey) {
    throw new Error('SUNO_API_KEY 未配置');
  }

  console.log('直接调用 Suno API:', { baseUrl, params });

  try {
    const response = await fetch(`${baseUrl}/api/v1/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('Suno API 响应:', data);
    return data;
  } catch (error) {
    console.error('调用 Suno API 失败:', error);
    throw error;
  }
};

// 查询音乐
export const fetchMusic = async (taskId: string): Promise<FetchMusicResponse> => {
  const apiKey = process.env.SUNO_API_KEY;
  const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';
  
  if (!apiKey) {
    throw new Error('SUNO_API_KEY 未配置');
  }

  if (!taskId) {
    throw new Error('taskId 是必需的');
  }

  try {
    const response = await fetch(`${baseUrl}/api/v1/task/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('查询结果:', data);
    return data;
  } catch (error) {
    console.error('查询任务失败:', error);
    throw error;
  }
};

// 为了兼容原有代码，保留这些导出
export const getSunoClient = () => {
  console.warn('getSunoClient 已废弃，请直接使用 createMusic 和 fetchMusic');
  return {
    createMusic,
    getMusic: fetchMusic,
  };
};