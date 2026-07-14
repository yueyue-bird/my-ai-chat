import { NextRequest, NextResponse } from 'next/server';
import { BlobNotFoundError, get } from '@vercel/blob';
import { hasTaskAccess, taskIdFromBlobPath } from '@/lib/sunoSecurity';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path') || '';
  const taskId = taskIdFromBlobPath(path);

  if (!taskId) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  if (!hasTaskAccess(request, taskId)) {
    return NextResponse.json({ error: 'Task access is not authorized' }, { status: 401 });
  }

  try {
    const result = await get(path, { access: 'private' });
    if (!result?.stream) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return new Response(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType || 'application/octet-stream',
        'Content-Length': String(result.blob.size),
        // Signed task URLs are short-lived credentials and must never be shared by a public cache.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: 'Blob read failed' }, { status: 502 });
  }
}
