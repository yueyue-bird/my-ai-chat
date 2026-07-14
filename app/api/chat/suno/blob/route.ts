import { NextRequest, NextResponse } from 'next/server';
import { get, BlobNotFoundError } from '@vercel/blob';

export const runtime = 'nodejs';

// 私有 Blob 无法直接公开访问。此路由用读写 token 从私有 store 读取音频/封面，
// 流式返回给浏览器，从而让 <audio>/<img> 能用一个永久、不过期的同源 URL 播放。
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path') || '';

  // 只允许读取本功能写入的 music/ 目录，避免任意路径读取
  if (!path || !path.startsWith('music/') || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const result = await get(path, { access: 'private' });

    if (!result.stream) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || 'application/octet-stream',
        'Content-Length': String(result.blob.size),
        // 永久内容，允许浏览器/CDN 长期缓存
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: 'Blob read failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
