import { BlobNotFoundError } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { readPublicMusicShare } from '@/lib/generatedMusicStore';
import { createPrivateBlobMediaResponse } from '@/lib/privateBlobMedia';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ shareId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { shareId } = await context.params;
  const kind = request.nextUrl.searchParams.get('kind') === 'image' ? 'image' : 'audio';

  try {
    const share = await readPublicMusicShare(shareId);
    if (!share) return NextResponse.json({ error: 'Share link was not found' }, { status: 404 });

    const pathname = kind === 'image' ? share.imagePath : share.audioPath;
    if (!pathname) return NextResponse.json({ error: 'Media was not found' }, { status: 404 });

    const response = await createPrivateBlobMediaResponse(request, pathname, {
      download: kind === 'audio' && request.nextUrl.searchParams.get('download') === '1',
    });
    return response || NextResponse.json({ error: 'Media was not found' }, { status: 404 });
  } catch (error) {
    console.error('Shared media read failed:', { shareId, kind, error });
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json({ error: 'Media was not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unable to load shared media' }, { status: 502 });
  }
}
