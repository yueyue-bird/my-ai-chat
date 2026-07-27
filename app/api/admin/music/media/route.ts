import { BlobNotFoundError, get } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { taskIdFromBlobPath } from '@/lib/sunoSecurity';
import { isUsageAdmin } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isUsageAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pathname = request.nextUrl.searchParams.get('path') || '';
  if (!taskIdFromBlobPath(pathname)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  try {
    const result = await get(pathname, {
      access: 'private',
      useCache: false,
      ...(process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {}),
    });
    if (!result || result.statusCode !== 200) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const headers: Record<string, string> = {
      'Content-Type': result.blob.contentType || 'application/octet-stream',
      'Content-Length': String(result.blob.size),
      'Cache-Control': 'private, no-store',
    };
    if (request.nextUrl.searchParams.get('download') === '1') {
      const filename = pathname.split('/').pop() || 'music.mp3';
      headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    }

    return new Response(result.stream, { headers });
  } catch (error) {
    console.error('Admin Blob read failed:', { pathname, error });
    if (error instanceof BlobNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      error: error instanceof Error ? `Blob read failed: ${error.message}` : 'Blob read failed',
    }, { status: 502 });
  }
}
