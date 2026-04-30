// app/api/chat/suno/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';

// 直接调用 Suno API 的函数
async function createMusic(params: any) {
  const apiKey = process.env.SUNO_API_KEY;
  const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';
  
  if (!apiKey) {
    throw new Error('SUNO_API_KEY 未配置');
  }

  const response = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Suno API 错误: ${response.status} ${errorText}`);
  }

  return await response.json();
}

export async function POST(request: NextRequest) {
  console.log('===== 生成音乐请求开始 =====');
  
  try {
    const body = await request.json();
    console.log('接收到的请求参数:', JSON.stringify(body, null, 2));

    const { 
      custom_mode, 
      prompt, 
      title, 
      tags, 
      make_instrumental, 
      model, 
      vocalGender,
      mv 
    } = body;

    // 获取回调地址
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const callBackUrl = `${baseUrl}/api/chat/suno/callback`;

    // 构建 Suno API 参数
    const params: any = {
      customMode: custom_mode === true,
      instrumental: make_instrumental === true,
      model: model || "V4_5ALL",
      prompt: prompt || `Create a beautiful ${tags || 'ambient'} instrumental piece`,
      style: tags || 'ambient',
      title: title || 'Untitled',
      callBackUrl: callBackUrl,
    };

    // 添加 mv 参数（如果有）
    if (mv) {
      params.mv = mv;
    }

    // 添加人声性别（如果是自定义模式且提供了值）
    if (vocalGender && custom_mode) {
      params.vocalGender = vocalGender;
    }

    console.log('发送到 Suno API 的参数:', JSON.stringify(params, null, 2));
    console.log('回调地址:', callBackUrl);

    // 调用 Suno API
    const response = await createMusic(params);
    console.log('Suno API 响应:', JSON.stringify(response, null, 2));

    // 检查响应
    if (response.code === 200 && response.data?.taskId) {
      return NextResponse.json({
        success: true,
        task_id: response.data.taskId,
        message: response.msg || '生成任务已创建'
      });
    } else {
      return NextResponse.json(
        { 
          success: false,
          error: response.msg || '生成失败',
          code: response.code
        },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('生成音乐失败:', error);
    return NextResponse.json(
      { 
        success: false,
        error: '生成失败',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// GET 请求用于测试
export async function GET() {
  return NextResponse.json({ 
    message: 'Generate API 正常工作',
    usage: '发送 POST 请求到 /api/chat/suno/generate 来生成音乐'
  });
}