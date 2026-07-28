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
  blockedRequests: number;
  generateRequests: number;
  uniqueVisitors: number;
  uniqueIps: number;
  generatedAt: string;
  since: string;
  topVisitors: UsageActorSummary[];
  topIps: UsageActorSummary[];
  endpoints: UsageEndpointSummary[];
  recentEvents: UsageEvent[];
  trend: UsageTrendPoint[];
  latency: UsageLatencySummary;
  generationLatency: UsageLatencySummary & { completedTasks: number };
  funnel: UsageFunnel;
  errors: Array<{ reason: string; count: number }>;
  models: Array<{ model: string; requests: number; successes: number; errors: number }>;
  retention: { newVisitors: number; returningVisitors: number; returnRate: number };
  suno: { generationCalls: number; estimatedCost: number | null; currency: string };
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
  blocked: number;
  successRate: number;
  averageMs: number;
  p95Ms: number;
};

export type UsageTrendPoint = {
  bucket: string;
  total: number;
  success: number;
  error: number;
  blocked: number;
  generate: number;
};

export type UsageLatencySummary = {
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

export type UsageFunnel = {
  submitted: number;
  created: number;
  completed: number;
  persisted: number;
  failed: number;
};

const DATA_DIR = path.join(process.cwd(), '.data');
const LOG_FILE = path.join(DATA_DIR, 'usage-events.jsonl');
const MAX_READ_BYTES = 1024 * 1024 * 5;
const cleanEnvValue = (value: string) => value.trim().replace(/^["']|["']$/g, '');
const SUPABASE_TABLE = cleanEnvValue(process.env.SUPABASE_USAGE_TABLE || 'usage_events');
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();
const memoryCallbackEvents = new Map<string, unknown>();

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

export async function claimSunoCallback(taskId: string, payload: unknown): Promise<'claimed' | 'unavailable'> {
  if (!hasSupabaseConfig()) {
    if (process.env.NODE_ENV === 'production') return 'unavailable';
    memoryCallbackEvents.set(taskId, payload);
    return 'claimed';
  }

  const response = await supabaseFetch('suno_callback_events?on_conflict=task_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ task_id: taskId, payload, received_at: new Date().toISOString() }),
  });
  await response.body?.cancel();
  return 'claimed';
}

export async function readSunoCallback(taskId: string): Promise<unknown | null> {
  if (!hasSupabaseConfig()) {
    return process.env.NODE_ENV === 'production' ? null : memoryCallbackEvents.get(taskId) ?? null;
  }

  const query = new URLSearchParams({
    select: 'payload',
    task_id: `eq.${taskId}`,
    order: 'received_at.desc',
    limit: '1',
  });
  const response = await supabaseFetch(`suno_callback_events?${query.toString()}`);
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0]?.payload ?? null : null;
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

export async function deleteUsageEventsBefore(cutoff: Date) {
  if (!hasSupabaseConfig()) return 0;
  const params = new URLSearchParams({ created_at: `lt.${cutoff.toISOString()}` });
  const response = await supabaseFetch(`${SUPABASE_TABLE}?${params.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'count=exact,return=minimal' },
  });
  const contentRange = response.headers.get('content-range') || '';
  const count = Number(contentRange.split('/')[1]);
  return Number.isFinite(count) ? count : 0;
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
  const rows: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < options.limit; offset += pageSize) {
    const query = new URLSearchParams({
      select: '*',
      created_at: `gte.${since}`,
      order: 'created_at.desc',
      limit: String(Math.min(pageSize, options.limit - offset)),
      offset: String(offset),
    });
    const response = await supabaseFetch(`${SUPABASE_TABLE}?${query.toString()}`);
    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map(fromSupabaseRow);
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
  const limit = Math.max(1, Math.min(options.limit || 500, 50_000));

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
  const summaries = new Map<string, { endpoint: string; requests: number; errors: number; blocked: number; durations: number[] }>();

  for (const event of events) {
    const current = summaries.get(event.endpoint) || {
      endpoint: event.endpoint,
      requests: 0,
      errors: 0,
      blocked: 0,
      durations: [],
    };
    current.requests += 1;
    current.errors += event.status === 'error' ? 1 : 0;
    current.blocked += event.status === 'blocked' ? 1 : 0;
    current.durations.push(event.durationMs);
    summaries.set(event.endpoint, current);
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      endpoint: summary.endpoint,
      requests: summary.requests,
      errors: summary.errors,
      blocked: summary.blocked,
      successRate: summary.requests
        ? Math.round(((summary.requests - summary.errors - summary.blocked) / summary.requests) * 1000) / 10
        : 0,
      averageMs: Math.round(average(summary.durations)),
      p95Ms: percentile(summary.durations, 95),
    }))
    .sort((a, b) => b.requests - a.requests);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], target: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((target / 100) * sorted.length) - 1)]);
}

function summarizeLatency(values: number[]): UsageLatencySummary {
  return {
    averageMs: Math.round(average(values)),
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
  };
}

function buildTrend(events: UsageEvent[], days: number): UsageTrendPoint[] {
  const hourly = days <= 1;
  const buckets = new Map<string, UsageTrendPoint>();
  for (const event of events) {
    const date = new Date(event.createdAt);
    const bucket = hourly
      ? `${date.toISOString().slice(0, 13)}:00:00.000Z`
      : `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const current = buckets.get(bucket) || { bucket, total: 0, success: 0, error: 0, blocked: 0, generate: 0 };
    current.total += 1;
    current.success += event.status === 'success' ? 1 : 0;
    current.error += event.status === 'error' ? 1 : 0;
    current.blocked += event.status === 'blocked' ? 1 : 0;
    current.generate += event.endpoint.includes('/generate') ? 1 : 0;
    buckets.set(bucket, current);
  }
  return Array.from(buckets.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function buildFunnelAndTiming(events: UsageEvent[]) {
  const generateEvents = events.filter((event) => event.endpoint.includes('/generate'));
  const submitted = generateEvents.length;
  const createdEvents = generateEvents.filter((event) => event.status === 'success' && event.taskId);
  const createdAtByTask = new Map(createdEvents.map((event) => [event.taskId!, Date.parse(event.createdAt)]));
  const completedTasks = new Map<string, number>();
  const persistedTasks = new Set<string>();
  const failedTasks = new Set<string>();

  for (const event of events) {
    if (!event.taskId) continue;
    if (event.endpoint.includes('/callback') && event.status === 'success') {
      completedTasks.set(event.taskId, Date.parse(event.createdAt));
    }
    if (event.endpoint.includes('/persist') && event.status === 'success') {
      persistedTasks.add(event.taskId);
      if (!completedTasks.has(event.taskId)) completedTasks.set(event.taskId, Date.parse(event.createdAt));
    }
    if (event.status === 'error') failedTasks.add(event.taskId);
  }

  const generationDurations = Array.from(completedTasks.entries())
    .map(([taskId, completedAt]) => {
      const createdAt = createdAtByTask.get(taskId);
      return createdAt ? completedAt - createdAt : 0;
    })
    .filter((duration) => duration > 0);

  return {
    funnel: {
      submitted,
      created: createdEvents.length,
      completed: completedTasks.size,
      persisted: persistedTasks.size,
      failed: failedTasks.size,
    } satisfies UsageFunnel,
    generationLatency: {
      ...summarizeLatency(generationDurations),
      completedTasks: generationDurations.length,
    },
  };
}

function summarizeErrors(events: UsageEvent[]) {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.status === 'success') continue;
    const reason = event.status === 'blocked' ? '请求被限流' : event.error || `HTTP ${event.statusCode}`;
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Array.from(counts, ([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function summarizeModels(events: UsageEvent[]) {
  const counts = new Map<string, { model: string; requests: number; successes: number; errors: number }>();
  for (const event of events.filter((item) => item.endpoint.includes('/generate'))) {
    const model = event.model || 'unknown';
    const current = counts.get(model) || { model, requests: 0, successes: 0, errors: 0 };
    current.requests += 1;
    current.successes += event.status === 'success' ? 1 : 0;
    current.errors += event.status === 'error' ? 1 : 0;
    counts.set(model, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.requests - a.requests);
}

function summarizeRetention(events: UsageEvent[]) {
  const daysByVisitor = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.visitorId || event.visitorId === 'anonymous') continue;
    const days = daysByVisitor.get(event.visitorId) || new Set<string>();
    days.add(event.createdAt.slice(0, 10));
    daysByVisitor.set(event.visitorId, days);
  }
  const returningVisitors = Array.from(daysByVisitor.values()).filter((days) => days.size > 1).length;
  const newVisitors = daysByVisitor.size - returningVisitors;
  return {
    newVisitors,
    returningVisitors,
    returnRate: daysByVisitor.size ? Math.round((returningVisitors / daysByVisitor.size) * 1000) / 10 : 0,
  };
}

export async function buildUsageReport(options: { days?: number; limit?: number } = {}): Promise<UsageReport> {
  const days = Math.max(1, Math.min(options.days || 30, 365));
  const events = await readUsageEvents({ days, limit: options.limit || 50_000 });
  const successRequests = events.filter((event) => event.status === 'success').length;
  const errorRequests = events.filter((event) => event.status === 'error').length;
  const blockedRequests = events.filter((event) => event.status === 'blocked').length;
  const generateRequests = events.filter((event) => event.endpoint.includes('/generate')).length;
  const { funnel, generationLatency } = buildFunnelAndTiming(events);
  const estimatedUnitCost = Number(process.env.SUNO_ESTIMATED_COST_PER_GENERATION || '');

  return {
    totalRequests: events.length,
    successRequests,
    errorRequests,
    blockedRequests,
    generateRequests,
    uniqueVisitors: new Set(events.map((event) => event.visitorId).filter(Boolean)).size,
    uniqueIps: new Set(events.map((event) => event.ip).filter(Boolean)).size,
    generatedAt: new Date().toISOString(),
    since: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    topVisitors: summarizeActors(events, 'visitorId'),
    topIps: summarizeActors(events, 'ip'),
    endpoints: summarizeEndpoints(events),
    recentEvents: events.slice(0, 100),
    trend: buildTrend(events, days),
    latency: summarizeLatency(events.map((event) => event.durationMs)),
    generationLatency,
    funnel,
    errors: summarizeErrors(events),
    models: summarizeModels(events),
    retention: summarizeRetention(events),
    suno: {
      generationCalls: funnel.created,
      estimatedCost: Number.isFinite(estimatedUnitCost) ? Math.round(funnel.created * estimatedUnitCost * 100) / 100 : null,
      currency: process.env.SUNO_COST_CURRENCY || 'USD',
    },
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
