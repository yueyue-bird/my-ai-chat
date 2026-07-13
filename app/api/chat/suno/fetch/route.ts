import { NextRequest, NextResponse } from 'next/server';
import { appendUsageEvent } from '@/lib/usageMonitor';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const taskId = request.nextUrl.searchParams.get('taskId');

  try {
    if (!taskId) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/fetch',
        status: 'error',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
        error: 'Missing taskId',
      });

      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    const taskIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
    if (!taskIdPattern.test(taskId)) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/fetch',
        status: 'error',
        statusCode: 400,
        durationMs: Date.now() - startedAt,
        taskId,
        error: 'Invalid taskId format',
      });

      return NextResponse.json({ error: 'Invalid taskId format' }, { status: 400 });
    }

    const safeTaskId = encodeURIComponent(taskId);

    const apiKey = process.env.SUNO_API_KEY;
    const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';

    if (!apiKey) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/fetch',
        status: 'error',
        statusCode: 500,
        durationMs: Date.now() - startedAt,
        taskId,
        error: 'SUNO_API_KEY is not configured',
      });

      return NextResponse.json({ error: 'SUNO_API_KEY is not configured' }, { status: 500 });
    }

    let data = null;
    let response = null;

    try {
      response = await fetch(`${baseUrl}/api/v1/task/${safeTaskId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        data = await response.json();
      }
    } catch {
      data = null;
    }

    if (!data || data.code !== 200) {
      try {
        response = await fetch(`${baseUrl}/api/v1/generate/record-info?taskId=${safeTaskId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          data = await response.json();
        }
      } catch {
        data = null;
      }
    }

    if (data && data.code === 200) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/fetch',
        status: 'success',
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        taskId,
      });

      return NextResponse.json(data);
    }

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/fetch',
      status: 'success',
      statusCode: 202,
      durationMs: Date.now() - startedAt,
      taskId,
    });

    return NextResponse.json({
      code: 202,
      msg: 'Task is still processing',
      data: {
        status: 'PENDING',
        taskId,
      },
    });
  } catch (error) {
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/fetch',
      status: 'error',
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      taskId: taskId || undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        code: 500,
        error: 'Fetch failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
