import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteGeneratedMusic, readGeneratedMusic } from '@/lib/generatedMusicStore';
import { isUsageAdmin } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const deleteSchema = z.object({
  taskId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  trackId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});

function adminMediaUrl(pathname: string | null, fallback: string, download = false) {
  if (!pathname) return fallback;
  const params = new URLSearchParams({ path: pathname });
  if (download) params.set('download', '1');
  return `/api/admin/music/media?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  if (!isUsageAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const limit = Number(request.nextUrl.searchParams.get('limit') || '100');
    const offset = Number(request.nextUrl.searchParams.get('offset') || '0');
    const result = await readGeneratedMusic({ limit, offset });
    return NextResponse.json({
      total: result.total,
      items: result.items.map((item) => ({
        ...item,
        audioUrl: adminMediaUrl(item.audioPath, item.audioUrl),
        downloadUrl: adminMediaUrl(item.audioPath, item.audioUrl, true),
        imageUrl: adminMediaUrl(item.imagePath, item.imageUrl),
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to read generated music',
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isUsageAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { taskId, trackId } = deleteSchema.parse(await request.json());
    await deleteGeneratedMusic(taskId, trackId);
    await del([
      `music/${taskId}/${trackId}.mp3`,
      `music/${taskId}/${trackId}.jpg`,
    ], process.env.BLOB_READ_WRITE_TOKEN ? { token: process.env.BLOB_READ_WRITE_TOKEN } : {}).catch(() => undefined);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to delete generated music',
    }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
