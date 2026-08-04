import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { createMusicShare } from '@/lib/generatedMusicStore';
import { hasTaskAccess } from '@/lib/sunoSecurity';

export const runtime = 'nodejs';

const shareRequestSchema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  trackId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});

export async function POST(request: NextRequest) {
  try {
    const input = shareRequestSchema.parse(await request.json());
    if (!hasTaskAccess(request, input.taskId)) {
      return NextResponse.json({ error: 'Task access is not authorized' }, { status: 401 });
    }

    const shareId = await createMusicShare(input.taskId, input.trackId);
    if (!shareId) {
      return NextResponse.json({ error: 'Music was not found' }, { status: 404 });
    }

    const shareUrl = new URL(`/share/${encodeURIComponent(shareId)}`, request.nextUrl.origin).toString();
    return NextResponse.json({ shareId, shareUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid share request' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Music audio has not been persisted yet') {
      return NextResponse.json(
        { error: '歌曲仍在保存中，请稍后再试。' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    console.error('Create music share failed:', error);
    return NextResponse.json({ error: 'Unable to create share link' }, { status: 500 });
  }
}
