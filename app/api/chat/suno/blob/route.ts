import { NextRequest, NextResponse } from 'next/server';
import { BlobNotFoundError } from '@vercel/blob';
import { createPrivateBlobMediaResponse } from '@/lib/privateBlobMedia';
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
    const response = await createPrivateBlobMediaResponse(request, path);
    return response || NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('Task Blob read failed:', { path, error });
    if (error instanceof BlobNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      error: error instanceof Error ? `Blob read failed: ${error.message}` : 'Blob read failed',
    }, { status: 502 });
  }
}
