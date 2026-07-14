import { NextRequest, NextResponse } from 'next/server';
import { appendUsageEvent, claimSunoCallback } from '@/lib/usageMonitor';
import { hasValidCallbackToken } from '@/lib/sunoSecurity';

export const runtime = 'nodejs';

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    if (!hasValidCallbackToken(request)) {
      return NextResponse.json({ code: 401, message: 'Unauthorized callback' }, { status: 401 });
    }
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 128 * 1024) {
      return NextResponse.json({ code: 413, message: 'Callback payload is too large' }, { status: 413 });
    }

    const data = await request.json();
    const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.task_id;
    if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
      return NextResponse.json({ code: 400, message: 'Callback task id is invalid' }, { status: 400 });
    }

    const claim = await claimSunoCallback(taskId, data);
    if (claim === 'unavailable') {
      return NextResponse.json({ code: 503, message: 'Callback storage is unavailable' }, { status: 503 });
    }
    if (claim === 'duplicate') {
      return NextResponse.json({ code: 200, message: 'Callback already received' });
    }

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/callback', status: 'success', statusCode: 200,
      durationMs: Date.now() - startedAt, taskId,
    });
    return NextResponse.json({ code: 200, message: 'Callback received' });
  } catch (error) {
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/callback', status: 'error', statusCode: 500,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ code: 500, message: 'Callback handling failed' }, { status: 500 });
  }
}
