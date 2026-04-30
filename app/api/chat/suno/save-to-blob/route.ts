// app/api/suno/save-to-blob/route.ts
import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { audioUrl, fileName, title, artist } = await request.json();

    if (!audioUrl) {
      return NextResponse.json(
        { error: 'audioUrl 是必需的' },
        { status: 400 }
      );
    }

    const finalFileName = fileName || `music-${Date.now()}.mp3`;

    console.log(`开始下载音频: ${audioUrl}`);

    // 从 Suno 的 URL 下载音频
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`下载音频失败: ${response.status} ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`音频下载成功，大小: ${audioBuffer.byteLength} 字节`);

    // ===== 修复1：移除 metadata 参数，使用标准选项 =====
    // 上传到 Vercel Blob - 使用标准选项
    const blob = await put(`music/${finalFileName}`, audioBuffer, {
      access: 'public',
      contentType: 'audio/mpeg',
      addRandomSuffix: true,
      // metadata 参数不被支持，移除它
    });

    // ===== 修复2：PutBlobResult 类型没有 size 和 uploadedAt 属性 =====
    // 根据官方文档，返回的对象包含：pathname, contentType, contentDisposition, url [citation:3]
    // 如果需要 size 和 uploadedAt，需要使用 head() 方法单独获取
    
    console.log(`上传成功: ${blob.url}`);

    // 返回兼容的响应格式
    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      contentDisposition: blob.contentDisposition,
      // 如果需要 size 和 uploadedAt，可以先获取再返回
      // 但为了简化，这里不包含这些字段
    });

  } catch (error: any) {
    console.error('保存到 Vercel Blob 失败:', error);
    
    return NextResponse.json(
      { 
        error: '保存失败',
        details: error.message 
      },
      { status: 500 }
    );
  }
}