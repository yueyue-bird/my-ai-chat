// app/api/chat/suno/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('===== 收到 Suno 回调 =====');
  
  try {
    const data = await request.json();
    console.log('回调数据:', JSON.stringify(data, null, 2));
    
    // 这里可以保存结果到数据库
    // 或者做其他处理，比如通知前端
    
    // 返回成功响应给 Suno
    return NextResponse.json({ 
      code: 200,
      message: '回调接收成功' 
    });
    
  } catch (error) {
    console.error('回调处理失败:', error);
    return NextResponse.json(
      { code: 500, message: '回调处理失败' },
      { status: 500 }
    );
  }
}

// 支持 GET 请求测试
export async function GET() {
  return NextResponse.json({ 
    message: 'Callback API 正常工作',
    usage: '这是 Suno API 的回调地址，用于接收生成完成的音乐'
  });
}