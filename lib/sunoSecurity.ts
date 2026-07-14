import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TASK_ACCESS_TTL_SECONDS = 60 * 60 * 24 * 30;

export const generationRequestSchema = z
  .object({
    custom_mode: z.boolean().optional(),
    customMode: z.boolean().optional(),
    prompt: z.string().trim().min(1).max(3000),
    title: z.string().trim().min(1).max(120),
    make_instrumental: z.boolean().optional(),
    instrumental: z.boolean().optional(),
    model: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.-]+$/).optional(),
    negativeTags: z.string().trim().max(500).optional(),
    vocalGender: z.enum(['m', 'f']).optional(),
    mv: z.string().trim().max(64).optional(),
  })
  .strict();

export const persistRequestSchema = z.object({
  taskId: z.string().regex(TASK_ID_PATTERN),
  items: z
    .array(
      z.object({
        id: z.string().regex(ITEM_ID_PATTERN),
        audioUrl: z.string().url().max(2048).optional(),
        imageUrl: z.string().url().max(2048).optional(),
      })
    )
    .min(1)
    .max(4),
});

type TaskAccessPayload = {
  taskId: string;
  visitorId: string;
  expiresAt: number;
};

function getSecret(name: 'SUNO_CALLBACK_TOKEN' | 'TASK_ACCESS_SECRET') {
  const value = process.env[name]?.trim();

  if (value) return value;
  if (process.env.NODE_ENV !== 'production') return `development-only-${name}`;

  throw new Error(`${name} must be configured in production`);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safelyEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getVisitorId(request: NextRequest) {
  const visitorId = request.headers.get('x-visitor-id')?.trim() || '';
  return VISITOR_ID_PATTERN.test(visitorId) ? visitorId : null;
}

export function createCallbackUrl(request: NextRequest) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  const baseUrl = configuredBaseUrl || request.nextUrl.origin;
  const url = new URL('/api/chat/suno/callback', baseUrl);

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_BASE_URL must use HTTPS in production');
  }

  // Suno's documented callback payload does not include a signature header. A high-entropy
  // callback token in the URL prevents unsolicited callers from forging callback requests.
  url.searchParams.set('token', getSecret('SUNO_CALLBACK_TOKEN'));
  return url.toString();
}

export function hasValidCallbackToken(request: NextRequest) {
  try {
    const expected = getSecret('SUNO_CALLBACK_TOKEN');
    const received = request.nextUrl.searchParams.get('token') || '';
    return safelyEqual(received, expected);
  } catch {
    return false;
  }
}

export function createTaskAccessToken(taskId: string, visitorId: string) {
  const payload: TaskAccessPayload = {
    taskId,
    visitorId,
    expiresAt: Math.floor(Date.now() / 1000) + TASK_ACCESS_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, getSecret('TASK_ACCESS_SECRET'))}`;
}

export function hasTaskAccess(request: NextRequest, taskId: string) {
  const token = request.headers.get('x-task-access-token') || request.nextUrl.searchParams.get('token') || '';
  const [encodedPayload, signature, extra] = token.split('.');

  if (!encodedPayload || !signature || extra || !safelyEqual(signature, sign(encodedPayload, getSecret('TASK_ACCESS_SECRET')))) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TaskAccessPayload;
    return (
      payload.taskId === taskId &&
      Number.isInteger(payload.expiresAt) &&
      payload.expiresAt > Math.floor(Date.now() / 1000) &&
      VISITOR_ID_PATTERN.test(payload.visitorId)
    );
  } catch {
    return false;
  }
}

export function taskIdFromBlobPath(pathname: string) {
  const match = /^music\/([A-Za-z0-9_-]{8,128})\/[A-Za-z0-9_-]{1,128}\.(?:mp3|jpg)$/.exec(pathname);
  return match?.[1] || null;
}

export function isAllowedMediaSource(sourceUrl: string) {
  const allowedHosts = (process.env.SUNO_MEDIA_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (allowedHosts.length === 0) return false;

  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`))
    );
  } catch {
    return false;
  }
}
