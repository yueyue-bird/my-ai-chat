import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isUsageAdmin } from '@/lib/usageMonitor';
import {
  buildStorageHealthReport,
  cleanupOrphanBlobs,
  retryStorageTargets,
} from '@/lib/storageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('retry'),
    targets: z
      .array(z.object({
        taskId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
        trackId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
      }))
      .max(100)
      .optional(),
  }),
  z.object({ action: z.literal('cleanup-orphans') }),
]);

export async function GET(request: NextRequest) {
  if (!isUsageAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await buildStorageHealthReport(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Storage health check failed' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isUsageAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = actionSchema.parse(await request.json());
    if (input.action === 'cleanup-orphans') return NextResponse.json(await cleanupOrphanBlobs());
    return NextResponse.json({ results: await retryStorageTargets(input.targets) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Storage maintenance failed' },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}
