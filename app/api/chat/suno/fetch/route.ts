// app/api/chat/suno/fetch/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('===== 查询音乐请求开始 =====');
  
  try {
    const taskId = request.nextUrl.searchParams.get('taskId');
    console.log('查询 taskId:', taskId);
    
    if (!taskId) {
      return NextResponse.json(
        { error: 'taskId 是必需的' }, 
        { status: 400 }
      );
    }

    const apiKey = process.env.SUNO_API_KEY;
    const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';
    
    if (!apiKey) {
      console.error('SUNO_API_KEY 未配置');
      return NextResponse.json(
        { error: 'SUNO_API_KEY 未配置' },
        { status: 500 }
      );
    }

    // 尝试两种 API 路径
    let data = null;
    let response = null;
    
    // 方式1: /api/v1/task/{taskId}
    try {
      console.log(`尝试查询: ${baseUrl}/api/v1/task/${taskId}`);
      response = await fetch(`${baseUrl}/api/v1/task/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        data = await response.json();
        console.log('查询成功 (task 接口):', JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.log('task 接口查询失败，尝试另一种方式');
    }
    
    // 方式2: /api/v1/generate/record-info?taskId={taskId}
    if (!data || data.code !== 200) {
      try {
        console.log(`尝试查询: ${baseUrl}/api/v1/generate/record-info?taskId=${taskId}`);
        response = await fetch(`${baseUrl}/api/v1/generate/record-info?taskId=${taskId}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          data = await response.json();
          console.log('查询成功 (record-info 接口):', JSON.stringify(data, null, 2));
        }
      } catch (err) {
        console.log('record-info 接口也失败了');
      }
    }

    if (data && data.code === 200) {
      return NextResponse.json(data);
    } else {
      // 返回等待状态
      return NextResponse.json({
        code: 202,
        msg: '任务处理中',
        data: {
          status: 'PENDING',
          taskId: taskId
        }
      });
    }

  } catch (error) {
    console.error('查询失败:', error);
    return NextResponse.json(
      { 
        code: 500,
        error: '查询失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}