import { NextRequest, NextResponse } from 'next/server';
import { appendUsageEvent } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_PATH_PATTERN = /^\/(?!admin(?:\/|$)|api(?:\/|$))[^\s?#]{0,500}$/;

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const pathname = typeof payload?.pathname === 'string' ? payload.pathname : '';

    if (!PAGE_PATH_PATTERN.test(pathname)) {
      return NextResponse.json({ error: 'Invalid page path' }, { status: 400 });
    }

    await appendUsageEvent(request, {
      endpoint: '/page-view',
      status: 'success',
      statusCode: 204,
      durationMs: 0,
      title: pathname,
    });

    return new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
