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
  rating?: number;
  trackIds?: string[];
};

export type SongRatingRecord = {
  id: string;
  createdAt: string;
  visitorId: string;
  taskId: string;
  rating: number;
  titles: string;
  trackIds: string[];
};

export type SongRatingSummary = {
  totalSubmissions: number;
  currentRatings: number;
  uniqueVisitors: number;
  averageRating: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  recentRatings: SongRatingRecord[];
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
  visitorDetails: UsageVisitorDetail[];
  highFrequencyVisitors: number;
  dailyVisitors: UsageDailyVisitorRecord[];
  suno: { generationCalls: number; estimatedCost: number | null; currency: string };
  ratings: SongRatingSummary;
};

export type UsageActorSummary = {
  id: string;
  requests: number;
  generateRequests: number;
  errors: number;
  lastSeen: string;
  lastUserAgent: string;
};

export type UsageVisitorDetail = {
  visitorId: string;
  todayVisits: number;
  sevenDayVisits: number;
  thirtyDayVisits: number;
  totalRequests: number;
  generateRequests: number;
  activeDays: number;
  averageVisitIntervalMs: number | null;
  firstSeen: string;
  lastSeen: string;
  ipCount: number;
  recentPages: string[];
  highFrequency: boolean;
  alertReason: string;
};

export type UsageDailyVisitorRecord = {
  date: string;
  uniqueVisitors: number;
  totalVisits: number;
  newVisitors: number;
  returningVisitors: number;
  visitors: Array<{
    visitorId: string;
    visits: number;
    firstVisit: string;
    lastVisit: string;
    pages: string[];
    ips: string[];
  }>;
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
  // Vercel overwrites x-forwarded-for with the connecting client's public IP,
  // so it is the authoritative source in production and cannot be client-spoofed.
  const forwardedFor = firstHeaderValue(request.headers.get('x-forwarded-for'));
  const realIp = firstHeaderValue(request.headers.get('x-real-ip'));
  const ip = forwardedFor || realIp || 'unknown';

  return {
    ip: ip.slice(0, 128),
    visitorId: (request.headers.get('x-visitor-id') || 'anonymous').slice(0, 128),
    userAgent: (request.headers.get('user-agent') || '').slice(0, 1000),
    referer: (request.headers.get('referer') || '').slice(0, 2000),
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
      return true;
    }

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.appendFile(LOG_FILE, `${JSON.stringify(row)}\n`, 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write usage event:', error);
    return false;
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
    ...(event.rating == null ? {} : { rating: event.rating }),
    ...(event.trackIds == null ? {} : { track_ids: event.trackIds }),
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
    rating: row.rating == null ? undefined : Number(row.rating),
    trackIds: Array.isArray(row.track_ids) ? row.track_ids.filter((value: unknown): value is string => typeof value === 'string') : undefined,
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

function dateKey(value: string, formatter: Intl.DateTimeFormat) {
  return formatter.format(new Date(value));
}

function createUsageDateFormatter() {
  const timeZone = process.env.USAGE_TIME_ZONE || 'Asia/Shanghai';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}

function summarizeVisitorDetails(events: UsageEvent[]): UsageVisitorDetail[] {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const dateFormatter = createUsageDateFormatter();
  const todayKey = dateKey(new Date(now).toISOString(), dateFormatter);
  const highFrequencyThreshold = getPositiveInt(process.env.VISITOR_ALERT_PAGE_VIEWS_PER_HOUR, 30, 10_000);
  const eventsByVisitor = new Map<string, UsageEvent[]>();

  for (const event of events) {
    if (!event.visitorId || event.visitorId === 'anonymous') continue;
    const visitorEvents = eventsByVisitor.get(event.visitorId) || [];
    visitorEvents.push(event);
    eventsByVisitor.set(event.visitorId, visitorEvents);
  }

  return Array.from(eventsByVisitor, ([visitorId, visitorEvents]) => {
    const sortedEvents = [...visitorEvents].sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
    );
    const pageViews = sortedEvents.filter((event) => event.endpoint === '/page-view');
    const activityEvents = pageViews.length ? pageViews : sortedEvents;
    const hourlyPageViews = new Map<string, number>();

    for (const event of pageViews) {
      const hour = event.createdAt.slice(0, 13);
      hourlyPageViews.set(hour, (hourlyPageViews.get(hour) || 0) + 1);
    }

    const maxHourlyPageViews = Math.max(0, ...Array.from(hourlyPageViews.values()));
    const intervals = pageViews
      .slice(1)
      .map((event, index) => Date.parse(event.createdAt) - Date.parse(pageViews[index].createdAt))
      .filter((interval) => interval > 0);
    const recentPages = Array.from(
      new Set(
        [...pageViews]
          .reverse()
          .map((event) => event.title)
          .filter((title): title is string => Boolean(title))
      )
    ).slice(0, 5);
    const highFrequency = maxHourlyPageViews >= highFrequencyThreshold;

    return {
      visitorId,
      todayVisits: pageViews.filter((event) => dateKey(event.createdAt, dateFormatter) === todayKey).length,
      sevenDayVisits: pageViews.filter((event) => Date.parse(event.createdAt) >= sevenDaysAgo).length,
      thirtyDayVisits: pageViews.filter((event) => Date.parse(event.createdAt) >= thirtyDaysAgo).length,
      totalRequests: sortedEvents.length,
      generateRequests: sortedEvents.filter((event) => event.endpoint.includes('/generate')).length,
      activeDays: new Set(activityEvents.map((event) => dateKey(event.createdAt, dateFormatter))).size,
      averageVisitIntervalMs: intervals.length ? Math.round(average(intervals)) : null,
      firstSeen: sortedEvents[0].createdAt,
      lastSeen: sortedEvents[sortedEvents.length - 1].createdAt,
      ipCount: new Set(sortedEvents.map((event) => event.ip).filter((ip) => ip && ip !== 'unknown')).size,
      recentPages,
      highFrequency,
      alertReason: highFrequency
        ? `单小时访问 ${maxHourlyPageViews} 次，达到提醒阈值 ${highFrequencyThreshold} 次`
        : '',
    } satisfies UsageVisitorDetail;
  }).sort((left, right) => {
    if (left.highFrequency !== right.highFrequency) return left.highFrequency ? -1 : 1;
    return Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
  });
}

function summarizeDailyVisitors(events: UsageEvent[], historyEvents: UsageEvent[]): UsageDailyVisitorRecord[] {
  const dateFormatter = createUsageDateFormatter();
  const firstSeenByVisitor = new Map<string, string>();
  const visitsByDate = new Map<string, Map<string, UsageEvent[]>>();

  for (const event of historyEvents) {
    if (!event.visitorId || event.visitorId === 'anonymous') continue;
    const current = firstSeenByVisitor.get(event.visitorId);
    if (!current || Date.parse(event.createdAt) < Date.parse(current)) {
      firstSeenByVisitor.set(event.visitorId, event.createdAt);
    }
  }

  for (const event of events) {
    if (event.endpoint !== '/page-view' || !event.visitorId || event.visitorId === 'anonymous') continue;
    const day = dateKey(event.createdAt, dateFormatter);
    const visitors = visitsByDate.get(day) || new Map<string, UsageEvent[]>();
    const visitorEvents = visitors.get(event.visitorId) || [];
    visitorEvents.push(event);
    visitors.set(event.visitorId, visitorEvents);
    visitsByDate.set(day, visitors);
  }

  return Array.from(visitsByDate, ([date, visitors]) => {
    const visitorRecords = Array.from(visitors, ([visitorId, visitorEvents]) => {
      const sortedEvents = [...visitorEvents].sort(
        (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
      );
      return {
        visitorId,
        visits: sortedEvents.length,
        firstVisit: sortedEvents[0].createdAt,
        lastVisit: sortedEvents[sortedEvents.length - 1].createdAt,
        pages: Array.from(new Set(sortedEvents.map((event) => event.title).filter((title): title is string => Boolean(title)))),
        ips: Array.from(new Set(sortedEvents.map((event) => event.ip).filter((ip) => ip && ip !== 'unknown'))),
      };
    }).sort((left, right) => right.visits - left.visits);
    const newVisitors = visitorRecords.filter((visitor) => {
      const firstSeen = firstSeenByVisitor.get(visitor.visitorId);
      return firstSeen ? dateKey(firstSeen, dateFormatter) === date : false;
    }).length;

    return {
      date,
      uniqueVisitors: visitorRecords.length,
      totalVisits: visitorRecords.reduce((sum, visitor) => sum + visitor.visits, 0),
      newVisitors,
      returningVisitors: visitorRecords.length - newVisitors,
      visitors: visitorRecords,
    } satisfies UsageDailyVisitorRecord;
  }).sort((left, right) => right.date.localeCompare(left.date));
}

function summarizeSongRatings(events: UsageEvent[]): SongRatingSummary {
  const ratingEvents = events.filter((event) =>
    event.endpoint === '/api/ratings'
    && event.status === 'success'
    && Number.isInteger(event.rating)
    && Number(event.rating) >= 1
    && Number(event.rating) <= 5
    && Boolean(event.taskId)
  );
  const currentByVisitorAndTask = new Map<string, UsageEvent>();

  for (const event of ratingEvents) {
    const key = `${event.visitorId}\u0000${event.taskId}`;
    if (!currentByVisitorAndTask.has(key)) currentByVisitorAndTask.set(key, event);
  }

  const current = Array.from(currentByVisitorAndTask.values());
  const distribution: SongRatingSummary['distribution'] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const event of current) distribution[event.rating as 1 | 2 | 3 | 4 | 5] += 1;

  return {
    totalSubmissions: ratingEvents.length,
    currentRatings: current.length,
    uniqueVisitors: new Set(current.map((event) => event.visitorId)).size,
    averageRating: current.length
      ? Math.round((current.reduce((sum, event) => sum + Number(event.rating), 0) / current.length) * 100) / 100
      : null,
    distribution,
    recentRatings: ratingEvents.slice(0, 100).map((event) => ({
      id: event.id,
      createdAt: event.createdAt,
      visitorId: event.visitorId,
      taskId: event.taskId || '',
      rating: Number(event.rating),
      titles: event.title || '',
      trackIds: event.trackIds || [],
    })),
  };
}

export async function buildUsageReport(options: { days?: number; limit?: number } = {}): Promise<UsageReport> {
  const days = Math.max(1, Math.min(options.days || 30, 365));
  const historyDays = Math.max(days, 30);
  const historyEvents = await readUsageEvents({ days: historyDays, limit: options.limit || 50_000 });
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const events = historyEvents.filter((event) => Date.parse(event.createdAt) >= sinceMs);
  const successRequests = events.filter((event) => event.status === 'success').length;
  const errorRequests = events.filter((event) => event.status === 'error').length;
  const blockedRequests = events.filter((event) => event.status === 'blocked').length;
  const generateRequests = events.filter((event) => event.endpoint.includes('/generate')).length;
  const { funnel, generationLatency } = buildFunnelAndTiming(events);
  const estimatedUnitCost = Number(process.env.SUNO_ESTIMATED_COST_PER_GENERATION || '');
  const visitorDetails = summarizeVisitorDetails(historyEvents);

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
    visitorDetails,
    highFrequencyVisitors: visitorDetails.filter((visitor) => visitor.highFrequency).length,
    dailyVisitors: summarizeDailyVisitors(events, historyEvents),
    suno: {
      generationCalls: funnel.created,
      estimatedCost: Number.isFinite(estimatedUnitCost) ? Math.round(funnel.created * estimatedUnitCost * 100) / 100 : null,
      currency: process.env.SUNO_COST_CURRENCY || 'USD',
    },
    ratings: summarizeSongRatings(events),
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
