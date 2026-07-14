import { promises as fs } from 'fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'path';
import type { NextRequest } from 'next/server';

export type UsageEventStatus = 'success' | 'error' | 'blocked';

export type UsageEvent = {
  id: string;
  createdAt: string;
  endpoint: string;
  method: string;
  status: UsageEventStatus;
  statusCode: number;
  durationMs: number;
  ip: string;
  visitorId: string;
  userAgent: string;
  referer: string;
  model?: string;
  title?: string;
  taskId?: string;
  error?: string;
  promptChars?: number;
};

export type UsageReport = {
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  generateRequests: number;
  uniqueVisitors: number;
  uniqueIps: number;
  generatedAt: string;
  since: string;
  topVisitors: UsageActorSummary[];
  topIps: UsageActorSummary[];
  endpoints: UsageEndpointSummary[];
  recentEvents: UsageEvent[];
};

export type UsageActorSummary = {
  id: string;
  requests: number;
  generateRequests: number;
  errors: number;
  lastSeen: string;
  lastUserAgent: string;
};

export type UsageEndpointSummary = {
  endpoint: string;
  requests: number;
  errors: number;
};

const DATA_DIR = path.join(process.cwd(), '.data');
const LOG_FILE = path.join(DATA_DIR, 'usage-events.jsonl');
const MAX_READ_BYTES = 1024 * 1024 * 5;
const cleanEnvValue = (value: string) => value.trim().replace(/^["']|["']$/g, '');
const SUPABASE_TABLE = cleanEnvValue(process.env.SUPABASE_USAGE_TABLE || 'usage_events');
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();
const memoryCallbackEvents = new Set<string>();

const emptyActor = 'unknown';

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || '';
}

export function getRequestMeta(request: NextRequest) {
  const forwardedFor = firstHeaderValue(request.headers.get('x-forwarded-for'));
  const realIp = request.headers.get('x-real-ip') || '';
  const ip = forwardedFor || realIp || 'unknown';

  return {
    ip,
    visitorId: request.headers.get('x-visitor-id') || 'anonymous',
    userAgent: request.headers.get('user-agent') || '',
    referer: request.headers.get('referer') || '',
  };
}

export async function appendUsageEvent(
  request: NextRequest,
  event: Omit<UsageEvent, 'id' | 'createdAt' | 'method' | 'ip' | 'visitorId' | 'userAgent' | 'referer'>
) {
  try {
    const meta = getRequestMeta(request);
    const row: UsageEvent = {
      id: randomId(),
      createdAt: new Date().toISOString(),
      method: request.method,
      ...meta,
      ...event,
    };

    if (hasSupabaseConfig()) {
      await appendSupabaseUsageEvent(row);
      return;
    }

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, `${JSON.stringify(row)}\n`, 'utf8');
  } catch (error) {
    console.error('Failed to write usage event:', error);
  }
}

function getSupabaseConfig() {
  const url = cleanEnvValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const serviceRoleKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '');

  return {
    url: url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''),
    serviceRoleKey,
  };
}

function hasSupabaseConfig() {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.serviceRoleKey);
}

function getPositiveInt(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function consumeMemoryRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const existing = memoryRateLimits.get(key);

  if (!existing || existing.resetAt <= now) {
    memoryRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  existing.count += 1;
  return existing.count <= limit;
}

export async function consumeGenerationRateLimit(request: NextRequest) {
  const limit = getPositiveInt(process.env.GENERATE_RATE_LIMIT, 5, 100);
  const windowSeconds = getPositiveInt(process.env.GENERATE_RATE_WINDOW_SECONDS, 3600, 86400);
  const meta = getRequestMeta(request);
  const identity = meta.ip !== 'unknown' ? meta.ip : meta.visitorId;
  const key = createHash('sha256').update(identity).digest('hex');

  if (!hasSupabaseConfig()) {
    // An in-memory limiter is sufficient for local development only. Production must use
    // Supabase so the quota is shared across serverless instances and regions.
    return process.env.NODE_ENV !== 'production' && consumeMemoryRateLimit(key, limit, windowSeconds);
  }

  const response = await supabaseFetch('rpc/consume_generation_rate_limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
  });

  return (await response.json()) === true;
}

export async function claimSunoCallback(taskId: string, payload: unknown): Promise<'claimed' | 'duplicate' | 'unavailable'> {
  if (!hasSupabaseConfig()) {
    if (process.env.NODE_ENV === 'production') return 'unavailable';
    if (memoryCallbackEvents.has(taskId)) return 'duplicate';
    memoryCallbackEvents.add(taskId);
    return 'claimed';
  }

  const response = await supabaseFetch('suno_callback_events?on_conflict=task_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify({ task_id: taskId, payload }),
  });
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? 'claimed' : 'duplicate';
}

function toSupabaseRow(event: UsageEvent) {
  return {
    id: event.id,
    created_at: event.createdAt,
    endpoint: event.endpoint,
    method: event.method,
    status: event.status,
    status_code: event.statusCode,
    duration_ms: event.durationMs,
    ip: event.ip,
    visitor_id: event.visitorId,
    user_agent: event.userAgent,
    referer: event.referer,
    model: event.model || null,
    title: event.title || null,
    task_id: event.taskId || null,
    error: event.error || null,
    prompt_chars: event.promptChars || 0,
  };
}

function fromSupabaseRow(row: any): UsageEvent {
  return {
    id: row.id,
    createdAt: row.created_at,
    endpoint: row.endpoint,
    method: row.method,
    status: row.status,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    ip: row.ip,
    visitorId: row.visitor_id,
    userAgent: row.user_agent,
    referer: row.referer,
    model: row.model || undefined,
    title: row.title || undefined,
    taskId: row.task_id || undefined,
    error: row.error || undefined,
    promptChars: row.prompt_chars || undefined,
  };
}

async function supabaseFetch(pathname: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase usage storage error: ${response.status} ${text}`);
  }

  return response;
}

async function appendSupabaseUsageEvent(event: UsageEvent) {
  await supabaseFetch(SUPABASE_TABLE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(toSupabaseRow(event)),
  });
}

async function readSupabaseUsageEvents(options: { days: number; limit: number }) {
  const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000).toISOString();
  const query = new URLSearchParams({
    select: '*',
    created_at: `gte.${since}`,
    order: 'created_at.desc',
    limit: String(options.limit),
  });
  const response = await supabaseFetch(`${SUPABASE_TABLE}?${query.toString()}`);
  const rows = await response.json();

  return Array.isArray(rows) ? rows.map(fromSupabaseRow) : [];
}

async function readLogText() {
  try {
    const stat = await fs.stat(LOG_FILE);
    const handle = await fs.open(LOG_FILE, 'r');
    const bytesToRead = Math.min(stat.size, MAX_READ_BYTES);
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, Math.max(0, stat.size - bytesToRead));
    await handle.close();
    return buffer.toString('utf8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

export async function readUsageEvents(options: { days?: number; limit?: number } = {}) {
  const days = Math.max(1, Math.min(options.days || 30, 365));
  const limit = Math.max(1, Math.min(options.limit || 500, 5000));

  if (hasSupabaseConfig()) {
    return readSupabaseUsageEvents({ days, limit });
  }

  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const text = await readLogText();

  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as UsageEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is UsageEvent => Boolean(event && Date.parse(event.createdAt) >= sinceMs))
    .slice(-limit)
    .reverse();
}

function summarizeActors(events: UsageEvent[], key: 'visitorId' | 'ip') {
  const summaries = new Map<string, UsageActorSummary>();

  for (const event of events) {
    const id = event[key] || emptyActor;
    const current =
      summaries.get(id) ||
      ({
        id,
        requests: 0,
        generateRequests: 0,
        errors: 0,
        lastSeen: event.createdAt,
        lastUserAgent: event.userAgent,
      } satisfies UsageActorSummary);

    current.requests += 1;
    current.generateRequests += event.endpoint.includes('/generate') ? 1 : 0;
    current.errors += event.status === 'error' ? 1 : 0;

    if (Date.parse(event.createdAt) >= Date.parse(current.lastSeen)) {
      current.lastSeen = event.createdAt;
      current.lastUserAgent = event.userAgent;
    }

    summaries.set(id, current);
  }

  return Array.from(summaries.values()).sort((a, b) => b.requests - a.requests).slice(0, 20);
}

function summarizeEndpoints(events: UsageEvent[]) {
  const summaries = new Map<string, UsageEndpointSummary>();

  for (const event of events) {
    const current = summaries.get(event.endpoint) || { endpoint: event.endpoint, requests: 0, errors: 0 };
    current.requests += 1;
    current.errors += event.status === 'error' ? 1 : 0;
    summaries.set(event.endpoint, current);
  }

  return Array.from(summaries.values()).sort((a, b) => b.requests - a.requests);
}

export async function buildUsageReport(options: { days?: number; limit?: number } = {}): Promise<UsageReport> {
  const days = Math.max(1, Math.min(options.days || 30, 365));
  const events = await readUsageEvents({ days, limit: options.limit || 1000 });
  const successRequests = events.filter((event) => event.status === 'success').length;
  const errorRequests = events.filter((event) => event.status === 'error').length;
  const generateRequests = events.filter((event) => event.endpoint.includes('/generate')).length;

  return {
    totalRequests: events.length,
    successRequests,
    errorRequests,
    generateRequests,
    uniqueVisitors: new Set(events.map((event) => event.visitorId).filter(Boolean)).size,
    uniqueIps: new Set(events.map((event) => event.ip).filter(Boolean)).size,
    generatedAt: new Date().toISOString(),
    since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    topVisitors: summarizeActors(events, 'visitorId'),
    topIps: summarizeActors(events, 'ip'),
    endpoints: summarizeEndpoints(events),
    recentEvents: events.slice(0, 100),
  };
}

export function isUsageAdminToken(candidate: string) {
  const configuredToken = process.env.ADMIN_USAGE_TOKEN || process.env.USAGE_ADMIN_TOKEN || '';

  if (!configuredToken && process.env.NODE_ENV !== 'production') {
    return true;
  }
  if (!configuredToken) {
    return false;
  }

  const configured = Buffer.from(configuredToken);
  const received = Buffer.from(candidate);
  return configured.length === received.length && timingSafeEqual(configured, received);
}

export function isUsageAdmin(request: NextRequest) {
  return isUsageAdminToken(request.cookies.get('usage_admin_session')?.value || '');
}
