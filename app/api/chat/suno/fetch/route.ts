import { NextRequest, NextResponse } from 'next/server';
import { appendUsageEvent } from '@/lib/usageMonitor';
import { hasTaskAccess } from '@/lib/sunoSecurity';

export const runtime = 'nodejs';

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const taskId = request.nextUrl.searchParams.get('taskId') || '';

  try {
    if (!TASK_ID_PATTERN.test(taskId)) {
      return NextResponse.json({ error: 'A valid taskId is required' }, { status: 400 });
    }
    if (!hasTaskAccess(request, taskId)) {
      return NextResponse.json({ error: 'Task access is not authorized' }, { status: 401 });
    }

    const apiKey = process.env.SUNO_API_KEY;
    const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';
    if (!apiKey) throw new Error('SUNO_API_KEY is not configured');

    let data: any = null;
    let upstreamError = '';

    // Suno's documented task-status endpoint is generate/record-info. The older
    // /api/v1/task/{taskId} request is not supported by this provider and returns 404.
    for (let attempt = 0; attempt < 3 && !data; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          cache: 'no-store',
        });

        if (response.ok) {
          data = await response.json();
          break;
        }

        upstreamError = `record-info endpoint returned ${response.status}`;
        if (response.status < 500) break;
      } catch (error) {
        upstreamError = error instanceof Error ? error.message : 'record-info endpoint request failed';
      }

      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }

    if (data?.code === 200) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/fetch', status: 'success', statusCode: 200,
        durationMs: Date.now() - startedAt, taskId,
      });
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (upstreamError) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/fetch', status: 'error', statusCode: 502,
        durationMs: Date.now() - startedAt, taskId, error: upstreamError,
      });
      return NextResponse.json({ code: 502, error: `Unable to retrieve the Suno task: ${upstreamError}` }, { status: 502 });
    }

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/fetch', status: 'success', statusCode: 202,
      durationMs: Date.now() - startedAt, taskId,
    });
    return NextResponse.json({ code: 202, msg: 'Task is still processing', data: { status: 'PENDING', taskId } });
  } catch (error) {
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/fetch', status: 'error', statusCode: 500,
      durationMs: Date.now() - startedAt, taskId: taskId || undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ code: 500, error: 'Fetch failed' }, { status: 500 });
  }
}
