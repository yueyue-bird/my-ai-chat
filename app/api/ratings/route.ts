import { NextRequest, NextResponse } from 'next/server';
import { appendUsageEvent } from '@/lib/usageMonitor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TRACKS = 10;
const MAX_IDENTIFIER_LENGTH = 200;
const MAX_TITLE_LENGTH = 200;

function readStringArray(value: unknown, maxItemLength: number) {
  if (!Array.isArray(value) || value.length > MAX_TRACKS) return null;
  const items = value.map((item) => typeof item === 'string' ? item.trim() : '');
  if (items.some((item) => !item || item.length > maxItemLength)) return null;
  return items;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const taskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';
    const rating = Number(payload?.rating);
    const trackIds = readStringArray(payload?.trackIds, MAX_IDENTIFIER_LENGTH);
    const titles = readStringArray(payload?.titles, MAX_TITLE_LENGTH);

    if (
      !taskId
      || taskId.length > MAX_IDENTIFIER_LENGTH
      || !Number.isInteger(rating)
      || rating < 1
      || rating > 5
      || !trackIds
      || !titles
      || trackIds.length !== titles.length
    ) {
      return NextResponse.json({ error: 'Invalid rating payload' }, { status: 400 });
    }

    const stored = await appendUsageEvent(request, {
      endpoint: '/api/ratings',
      status: 'success',
      statusCode: 204,
      durationMs: 0,
      taskId,
      title: titles.join(' / ').slice(0, 1000),
      rating,
      trackIds,
    });

    if (!stored) {
      return NextResponse.json({ error: 'Rating storage unavailable' }, { status: 503 });
    }

    return new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
