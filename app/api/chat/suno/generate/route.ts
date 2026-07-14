import { NextRequest, NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';
import { appendUsageEvent, consumeGenerationRateLimit } from '@/lib/usageMonitor';
import {
  createCallbackUrl,
  createTaskAccessToken,
  generationRequestSchema,
  getVisitorId,
} from '@/lib/sunoSecurity';

export const runtime = 'nodejs';

type SunoGenerationParams = {
  customMode: boolean;
  instrumental: boolean;
  model: string;
  prompt: string;
  title: string;
  callBackUrl: string;
  negativeTags?: string;
  mv?: string;
  vocalGender?: 'm' | 'f';
};

async function createMusic(params: SunoGenerationParams) {
  const apiKey = process.env.SUNO_API_KEY;
  const baseUrl = process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org';

  if (!apiKey) throw new Error('SUNO_API_KEY is not configured');

  const response = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error(`Suno API error: ${response.status}`);
  return response.json();
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let input: z.infer<typeof generationRequestSchema> | null = null;

  try {
    const visitorId = getVisitorId(request);
    if (!visitorId) return NextResponse.json({ error: 'A valid visitor id is required' }, { status: 400 });

    input = generationRequestSchema.parse(await request.json());
    const allowed = await consumeGenerationRateLimit(request);
    if (!allowed) {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/generate', status: 'blocked', statusCode: 429,
        durationMs: Date.now() - startedAt, model: input.model, title: input.title,
        promptChars: input.prompt.length, error: 'Generation rate limit exceeded',
      });
      return NextResponse.json(
        { success: false, error: 'Too many generation requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(process.env.GENERATE_RATE_WINDOW_SECONDS || 3600) } }
      );
    }

    const customMode = input.customMode === true || input.custom_mode === true;
    const params: SunoGenerationParams = {
      customMode,
      instrumental: input.instrumental === true || input.make_instrumental === true,
      model: input.model || 'V4_5PLUS',
      prompt: input.prompt,
      title: input.title,
      callBackUrl: createCallbackUrl(request),
      ...(input.negativeTags ? { negativeTags: input.negativeTags } : {}),
      ...(input.mv ? { mv: input.mv } : {}),
      ...(input.vocalGender && customMode ? { vocalGender: input.vocalGender } : {}),
    };

    const response = await createMusic(params);
    const taskId = response.data?.taskId || response.data?.task_id || response.data?.id || response.taskId || response.task_id;

    if ((response.code === 200 || response.code === 201 || response.success === true) && typeof taskId === 'string') {
      await appendUsageEvent(request, {
        endpoint: '/api/chat/suno/generate', status: 'success', statusCode: 200,
        durationMs: Date.now() - startedAt, model: params.model, title: params.title, taskId,
        promptChars: params.prompt.length,
      });
      return NextResponse.json({
        success: true,
        task_id: taskId,
        task_token: createTaskAccessToken(taskId, visitorId),
        message: response.msg || 'Generation task created',
      });
    }

    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/generate', status: 'error', statusCode: 400,
      durationMs: Date.now() - startedAt, model: params.model, title: params.title,
      promptChars: params.prompt.length, error: response.msg || 'Generation failed',
    });
    return NextResponse.json({ success: false, error: 'Generation failed' }, { status: 400 });
  } catch (error) {
    const status = error instanceof ZodError ? 400 : 500;
    await appendUsageEvent(request, {
      endpoint: '/api/chat/suno/generate', status: 'error', statusCode: status,
      durationMs: Date.now() - startedAt, model: input?.model, title: input?.title,
      promptChars: input?.prompt?.length || 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { success: false, error: status === 400 ? 'Invalid generation request' : 'Generation failed' },
      { status }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Generate API is working' });
}
