// app/api/chat/route.ts
// @ts-nocheck
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // 获取环境变量
  const apiKey = process.env.OPENAI_API_KEY;
  // 确保基础 URL 正确 (默认指向 DeepSeek)
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1';
  
  // 构造完整的请求 URL (强制指向 chat/completions)
  const url = `${baseUrl}/chat/completions`;

  try {
    // 直接使用 fetch 调用 DeepSeek 官方接口
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} ${errorText}`);
    }

    // 直接将 DeepSeek 的响应流转发给前端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('API Call Failed:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}