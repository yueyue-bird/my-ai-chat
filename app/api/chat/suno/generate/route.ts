import { NextRequest, NextResponse } from 'next/server';
import { appendUsageEvent } from '@/lib/usageMonitor';

export const runtime = 'nodejs';

async function createMusic(params: any) {
  const apiKey = process.env.SUNO_API_KEY;
  const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';

  if (!apiKey) {
    throw new Error('SUNO_API_KEY is not configured');
  }

  const response = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Suno API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let body: any = null;

  try {
    body = await request.json();

    const {
      custom_mode,
      customMode,
      prompt,
      title,
      make_instrumental,
      instrumental,
      model,
      negativeTags,
      vocalGender,
      mv,
    } = body;

    const appBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const callBackUrl = `${appBaseUrl}/api/chat/suno/callback`;

    const params: any = {
      customMode: customMode === true || custom_mode === true,
      instrumental: instrumental === true || make_instrumental === true,
      model: model || 'V4_5PLUS',
      prompt: prompt || 'Create a beautiful instrumental piece',
      title: title || 'Untitled',
      callBackUrl,
    };

    if (negativeTags) {
      params.negativeTags = negativeTags;
    }

    if (mv) {
      params.mv = mv;
    }

    if (vocalGender && custom_mode) {
      params.vocalGender = vocalGender;
    }

    const response = await createMusic(params);
    const taskId = response.data?.taskId || response.data?.task_id || response.data?.id || response.taskId || response.task_id;

    if ((response.code === 200 || response.code === 201 || response.success === true) && taskId) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/generate',
        status: 'success',
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        model: params.model,
        title: params.title,
        taskId,
        promptChars: typeof params.prompt === 'string' ? params.prompt.length : 0,
      });

      return NextResponse.json({
        success: true,
        task_id: taskId,
        message: response.msg || 'Generation task created',
      });
    }

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/generate',
      status: 'error',
      statusCode: 400,
      durationMs: Date.now() - startedAt,
      model: params.model,
      title: params.title,
      promptChars: typeof params.prompt === 'string' ? params.prompt.length : 0,
      error: response.msg || 'Generation failed',
    });

    return NextResponse.json(
      {
        success: false,
        error: response.msg || 'Generation failed',
        code: response.code,
      },
      { status: 400 }
    );
  } catch (error: any) {
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/generate',
      status: 'error',
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      model: body?.model,
      title: body?.title,
      promptChars: typeof body?.prompt === 'string' ? body.prompt.length : 0,
      error: error.message || 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Generation failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Generate API is working',
    usage: 'Send a POST request to /api/chat/suno/generate to create music.',
  });
}
