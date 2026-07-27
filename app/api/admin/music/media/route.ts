import { BlobNotFoundError } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { createPrivateBlobMediaResponse } from '@/lib/privateBlobMedia';
import { taskIdFromBlobPath } from '@/lib/sunoSecurity';
import { isUsageAdmin } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isUsageAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pathname = request.nextUrl.searchParams.get('path') || '';
  if (!taskIdFromBlobPath(pathname)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });

  try {
    const response = await createPrivateBlobMediaResponse(request, pathname, {
      download: request.nextUrl.searchParams.get('download') === '1',
    });
    return response || NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('Admin Blob read failed:', { pathname, error });
    if (error instanceof BlobNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      error: error instanceof Error ? `Blob read failed: ${error.message}` : 'Blob read failed',
    }, { status: 502 });
  }
}
