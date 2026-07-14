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
    try {
      const response = await fetch(`${baseUrl}/api/v1/task/${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (response.ok) data = await response.json();
    } catch {
      data = null;
    }

    if (!data || data.code !== 200) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          cache: 'no-store',
        });
        if (response.ok) data = await response.json();
      } catch {
        data = null;
      }
    }

    if (data?.code === 200) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/fetch', status: 'success', statusCode: 200,
        durationMs: Date.now() - startedAt, taskId,
      });
      return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
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
