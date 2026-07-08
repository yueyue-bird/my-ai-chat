import { NextRequest, NextResponse } from 'next/server';
import { appendUsageEvent } from '@/lib/usageMonitor';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const data = await request.json();
    const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.task_id;

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/callback',
      status: 'success',
      statusCode: 200,
      durationMs: Date.now() - startedAt,
      taskId,
    });

    return NextResponse.json({
      code: 200,
      message: 'Callback received',
    });
  } catch (error) {
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/callback',
      status: 'error',
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ code: 500, message: 'Callback handling failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Callback API is working',
    usage: 'This endpoint receives Suno generation callbacks.',
  });
}
