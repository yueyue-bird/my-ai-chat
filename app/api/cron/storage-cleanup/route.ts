import { NextRequest, NextResponse } from 'next/server';
import { runStorageRetention } from '@/lib/storageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await runStorageRetention({ trigger: 'cron' }), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('Scheduled storage cleanup failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Storage cleanup failed' },
      { status: 500 }
    );
  }
}
