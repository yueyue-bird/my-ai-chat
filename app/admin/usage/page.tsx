'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type UsageEventStatus = 'success' | 'error' | 'blocked';
type UsageEvent = {
  id: string; createdAt: string; endpoint: string; method: string; status: UsageEventStatus;
  statusCode: number; durationMs: number; ip: string; visitorId: string; userAgent: string;
  model?: string; title?: string; taskId?: string; error?: string;
};
type Actor = { id: string; requests: number; generateRequests: number; errors: number; lastSeen: string; lastUserAgent: string };
type Endpoint = { endpoint: string; requests: number; errors: number; blocked: number; successRate: number; averageMs: number; p95Ms: number };
type Trend = { bucket: string; total: number; success: number; error: number; blocked: number; generate: number };
type Latency = { averageMs: number; p50Ms: number; p95Ms: number; p99Ms: number };
type VisitorDetail = {
  visitorId: string; todayVisits: number; sevenDayVisits: number; thirtyDayVisits: number;
  totalRequests: number; generateRequests: number; activeDays: number; averageVisitIntervalMs: number | null;
  firstSeen: string; lastSeen: string; ipCount: number; recentPages: string[];
  highFrequency: boolean; alertReason: string;
};
type DailyVisitorRecord = {
  date: string; uniqueVisitors: number; totalVisits: number; newVisitors: number; returningVisitors: number;
  visitors: Array<{
    visitorId: string; visits: number; firstVisit: string; lastVisit: string; pages: string[]; ips: string[];
  }>;
};
type UsageReport = {
  totalRequests: number; successRequests: number; errorRequests: number; blockedRequests: number;
  generateRequests: number; uniqueVisitors: number; uniqueIps: number; generatedAt: string;
  topVisitors: Actor[]; topIps: Actor[]; endpoints: Endpoint[]; recentEvents: UsageEvent[];
  trend: Trend[]; latency: Latency; generationLatency: Latency & { completedTasks: number };
  funnel: { submitted: number; created: number; completed: number; persisted: number; failed: number };
  errors: Array<{ reason: string; count: number }>;
  models: Array<{ model: string; requests: number; successes: number; errors: number }>;
  retention: { newVisitors: number; returningVisitors: number; returnRate: number };
  visitorDetails: VisitorDetail[]; highFrequencyVisitors: number;
  dailyVisitors: DailyVisitorRecord[];
  suno: { generationCalls: number; estimatedCost: number | null; currency: string };
};

const panel = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));
const formatBytes = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
const formatInterval = (value: number | null) => {
  if (value == null) return '-';
  if (value < 60 * 60 * 1000) return `${Math.max(1, Math.round(value / 60_000))} 分钟`;
  if (value < 24 * 60 * 60 * 1000) return `${(value / 3_600_000).toFixed(1)} 小时`;
  return `${(value / 86_400_000).toFixed(1)} 天`;
};

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className={`${panel} p-4`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p>{note && <p className="mt-1 text-xs text-slate-400">{note}</p>}</div>;
}

function ActorTable({ title, rows }: { title: string; rows: Actor[] }) {
  return (
    <section className={panel}>
      <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">{title}</h2>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">标识</th><th>请求</th><th>生成</th><th>错误</th><th>最后使用</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="max-w-52 truncate p-3 font-mono">{row.id}</td><td>{row.requests}</td><td>{row.generateRequests}</td><td>{row.errors}</td><td>{formatDate(row.lastSeen)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function TrendChart({ rows }: { rows: Trend[] }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  const visible = rows.slice(-31);
  return (
    <section className={`${panel} p-5`}>
      <div className="flex items-center justify-between"><div><h2 className="font-semibold">请求趋势</h2><p className="mt-1 text-xs text-slate-500">绿色成功、红色错误、琥珀色限流</p></div><span className="text-xs text-slate-400">{visible.length} 个时间桶</span></div>
      <div className="mt-5 flex h-48 items-end gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {visible.map((row) => (
          <div key={row.bucket} className="group flex h-full min-w-4 flex-1 flex-col justify-end" title={`${formatDate(row.bucket)}：${row.total} 次`}>
            <div className="w-full overflow-hidden rounded-t bg-slate-100" style={{ height: `${Math.max(3, (row.total / max) * 100)}%` }}>
              <div className="bg-emerald-500" style={{ height: `${(row.success / row.total) * 100}%` }} />
              <div className="bg-red-500" style={{ height: `${(row.error / row.total) * 100}%` }} />
              <div className="bg-amber-400" style={{ height: `${(row.blocked / row.total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function downloadCsv(events: UsageEvent[]) {
  const fields: Array<keyof UsageEvent> = ['createdAt', 'status', 'statusCode', 'endpoint', 'method', 'visitorId', 'ip', 'model', 'title', 'taskId', 'durationMs', 'error'];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [fields.join(','), ...events.map((event) => fields.map((field) => escape(event[field])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `usage-events-${Date.now()}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

function downloadVisitorCsv(visitors: VisitorDetail[]) {
  const headers = [
    'visitorId', 'todayVisits', 'sevenDayVisits', 'thirtyDayVisits', 'totalRequests',
    'generateRequests', 'activeDays', 'averageVisitIntervalMs', 'firstSeen', 'lastSeen',
    'ipCount', 'recentPages', 'highFrequency', 'alertReason',
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = visitors.map((visitor) => [
    visitor.visitorId, visitor.todayVisits, visitor.sevenDayVisits, visitor.thirtyDayVisits,
    visitor.totalRequests, visitor.generateRequests, visitor.activeDays, visitor.averageVisitIntervalMs,
    visitor.firstSeen, visitor.lastSeen, visitor.ipCount, visitor.recentPages.join(' | '),
    visitor.highFrequency, visitor.alertReason,
  ].map(escape).join(','));
  const url = URL.createObjectURL(new Blob([`\uFEFF${[headers.join(','), ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `visitor-details-${Date.now()}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

function downloadDailyVisitorCsv(records: DailyVisitorRecord[]) {
  const headers = [
    'date', 'dailyTotalVisits', 'dailyUniqueVisitors', 'dailyNewVisitors', 'dailyReturningVisitors',
    'visitorId', 'visitorVisits', 'firstVisit', 'lastVisit', 'pages', 'ips',
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = records.flatMap((record) => record.visitors.map((visitor) => [
    record.date, record.totalVisits, record.uniqueVisitors, record.newVisitors, record.returningVisitors,
    visitor.visitorId, visitor.visits, visitor.firstVisit, visitor.lastVisit,
    visitor.pages.join(' | '), visitor.ips.join(' | '),
  ].map(escape).join(',')));
  const url = URL.createObjectURL(new Blob([`\uFEFF${[headers.join(','), ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `daily-visitors-${Date.now()}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

function DailyVisitorRecords({ rows }: { rows: DailyVisitorRecord[] }) {
  return (
    <section className={panel}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">每日访客与访问次数</h2>
          <p className="mt-1 text-xs text-slate-500">按 Asia/Shanghai 自然日统计页面访问；展开日期可查看当天每位浏览器访客的记录。</p>
        </div>
        <button onClick={() => downloadDailyVisitorCsv(rows)} className="h-9 rounded-full border border-teal-200 px-4 text-sm font-semibold text-teal-800">导出每日记录 CSV</button>
      </div>
      <div className="max-h-[42rem] overflow-auto">
        {rows.map((row) => (
          <details key={row.date} className="group border-b border-slate-100 last:border-b-0">
            <summary className="grid cursor-pointer list-none grid-cols-2 gap-3 p-4 text-sm hover:bg-slate-50 sm:grid-cols-6">
              <strong className="text-teal-800">{row.date}</strong>
              <span><span className="text-slate-400">访问次数</span><strong className="ml-2">{row.totalVisits}</strong></span>
              <span><span className="text-slate-400">独立访客</span><strong className="ml-2">{row.uniqueVisitors}</strong></span>
              <span><span className="text-slate-400">新访客</span><strong className="ml-2">{row.newVisitors}</strong></span>
              <span><span className="text-slate-400">回访</span><strong className="ml-2">{row.returningVisitors}</strong></span>
              <span className="text-right text-slate-400 group-open:text-teal-700">展开明细 ▾</span>
            </summary>
            <div className="overflow-x-auto bg-slate-50/60 px-4 pb-4">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="text-slate-500"><tr><th className="py-3">访客 ID</th><th>当日访问</th><th>首次访问</th><th>最后访问</th><th>访问页面</th><th>当日 IP</th></tr></thead>
                <tbody>
                  {row.visitors.map((visitor) => (
                    <tr key={visitor.visitorId} className="border-t border-slate-200 align-top">
                      <td className="max-w-72 truncate py-3 font-mono" title={visitor.visitorId}>{visitor.visitorId}</td>
                      <td className="font-semibold">{visitor.visits}</td>
                      <td>{formatDate(visitor.firstVisit)}</td><td>{formatDate(visitor.lastVisit)}</td>
                      <td className="max-w-80 truncate" title={visitor.pages.join(' → ')}>{visitor.pages.join(' → ') || '-'}</td>
                      <td className="max-w-64 truncate font-mono" title={visitor.ips.join(', ')}>{visitor.ips.join(', ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {!rows.length && <p className="p-8 text-center text-sm text-slate-400">暂无页面访问记录</p>}
      </div>
    </section>
  );
}

function VisitorDetailsTable({ rows }: { rows: VisitorDetail[] }) {
  const [visitorQuery, setVisitorQuery] = useState('');
  const [alertsOnly, setAlertsOnly] = useState(false);
  const visibleRows = useMemo(() => {
    const needle = visitorQuery.trim().toLowerCase();
    return rows.filter((visitor) => {
      if (alertsOnly && !visitor.highFrequency) return false;
      if (!needle) return true;
      return [visitor.visitorId, visitor.alertReason, ...visitor.recentPages]
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [alertsOnly, rows, visitorQuery]);

  return (
    <section className={panel}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold">访客明细</h2>
          <p className="mt-1 text-xs text-slate-500">按浏览器 visitorId 统计；今日按 Asia/Shanghai 时区，首次访问为当前可读取记录中的最早时间。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={visitorQuery}
            onChange={(event) => setVisitorQuery(event.target.value)}
            placeholder="搜索访客或页面…"
            aria-label="搜索访客或页面"
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
          />
          <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm">
            <input type="checkbox" checked={alertsOnly} onChange={(event) => setAlertsOnly(event.target.checked)} />
            只看高频提醒
          </label>
          <button onClick={() => downloadVisitorCsv(visibleRows)} className="h-9 rounded-full border border-teal-200 px-4 text-sm font-semibold text-teal-800">导出访客 CSV</button>
        </div>
      </div>
      <div className="max-h-[36rem] overflow-auto">
        <table className="w-full min-w-[1650px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
            <tr><th className="p-3">访客 ID / 提醒</th><th>今日</th><th>7 天</th><th>30 天</th><th>活跃天数</th><th>总请求 / 生成</th><th>首次访问</th><th>最近访问</th><th>平均访问间隔</th><th>IP 数</th><th>最近页面</th></tr>
          </thead>
          <tbody>
            {visibleRows.map((visitor) => (
              <tr key={visitor.visitorId} className={`border-t border-slate-100 align-top ${visitor.highFrequency ? 'bg-amber-50/70' : ''}`}>
                <td className="max-w-72 p-3">
                  <span className="block truncate font-mono" title={visitor.visitorId}>{visitor.visitorId}</span>
                  {visitor.highFrequency && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800" title={visitor.alertReason}>高频 · {visitor.alertReason}</span>}
                </td>
                <td>{visitor.todayVisits}</td><td>{visitor.sevenDayVisits}</td><td>{visitor.thirtyDayVisits}</td>
                <td>{visitor.activeDays}</td><td>{visitor.totalRequests} / {visitor.generateRequests}</td>
                <td>{formatDate(visitor.firstSeen)}</td><td>{formatDate(visitor.lastSeen)}</td>
                <td>{formatInterval(visitor.averageVisitIntervalMs)}</td><td>{visitor.ipCount}</td>
                <td className="max-w-80 truncate" title={visitor.recentPages.join(' → ')}>{visitor.recentPages.join(' → ') || '-'}</td>
              </tr>
            ))}
            {!visibleRows.length && <tr><td colSpan={11} className="p-8 text-center text-sm text-slate-400">暂无匹配访客</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">共 {visibleRows.length} 位浏览器访客；高频提醒阈值可通过 VISITOR_ALERT_PAGE_VIEWS_PER_HOUR 调整，默认每小时 30 次页面访问。</p>
    </section>
  );
}

export default function UsageAdminPage() {
  const [token, setToken] = useState('');
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | UsageEventStatus>('all');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const loadReport = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/admin/usage?days=${days}&limit=50000`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) setHasSession(false); throw new Error(data.message || data.error); }
      setReport(data); setPage(1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取监控数据');
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => {
    fetch('/api/admin/verify', { cache: 'no-store' }).then((response) => response.json()).then((data) => setHasSession(Boolean(data.isAdmin))).catch(() => setHasSession(false));
  }, []);
  useEffect(() => { if (hasSession) loadReport(); }, [hasSession, loadReport]);
  useEffect(() => {
    if (!autoRefresh || !hasSession) return;
    const timer = window.setInterval(loadReport, 30_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, hasSession, loadReport]);

  const startSession = async () => {
    if (!token.trim()) return setError('请输入管理 Token');
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }) });
      if (!response.ok) throw new Error('管理 Token 无效');
      setToken(''); setHasSession(true);
    } catch (sessionError) { setError(sessionError instanceof Error ? sessionError.message : '登录失败'); setLoading(false); }
  };

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (report?.recentEvents || []).filter((event) => {
      if (status !== 'all' && event.status !== status) return false;
      if (!needle) return true;
      return [event.endpoint, event.visitorId, event.ip, event.model, event.title, event.taskId, event.error].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [query, report, status]);
  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const pageEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize);
  const successRate = report?.totalRequests ? ((report.successRequests / report.totalRequests) * 100).toFixed(1) : '0.0';

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-3 py-5 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className={`${panel} p-5`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><p className="text-sm font-semibold text-teal-700">EchoTaste Admin</p><h1 className="mt-1 text-3xl font-semibold">API 与业务监控</h1><Link href="/admin/music" className="mt-2 inline-block text-sm font-semibold text-teal-700">存储健康与音乐管理 →</Link></div>
            <div className="flex flex-wrap items-end gap-2">
              {!hasSession && <input type="password" value={token} onChange={(event) => setToken(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') startSession(); }} placeholder="ADMIN_USAGE_TOKEN" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />}
              <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value={1}>1 天</option><option value={7}>7 天</option><option value={14}>14 天</option><option value={30}>30 天</option><option value={90}>90 天</option><option value={365}>365 天</option></select>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />30 秒自动刷新</label>
              <button onClick={hasSession ? loadReport : startSession} disabled={loading} className="h-10 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50">{loading ? '加载中…' : hasSession ? '刷新' : '登录'}</button>
            </div>
          </div>
          {report && <p className="mt-3 text-xs text-slate-400">最后聚合：{formatDate(report.generatedAt)}；最多读取 50,000 条事件</p>}
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Stat label="总请求" value={report?.totalRequests || 0} /><Stat label="成功率" value={`${successRate}%`} /><Stat label="生成调用" value={report?.generateRequests || 0} />
          <Stat label="错误" value={report?.errorRequests || 0} /><Stat label="限流" value={report?.blockedRequests || 0} /><Stat label="访客" value={report?.uniqueVisitors || 0} />
          <Stat label="IP" value={report?.uniqueIps || 0} /><Stat label="回访率" value={`${report?.retention.returnRate || 0}%`} />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <TrendChart rows={report?.trend || []} />
          <section className={`${panel} p-5`}><h2 className="font-semibold">生成漏斗</h2><div className="mt-4 space-y-3">
            {Object.entries(report?.funnel || { submitted: 0, created: 0, completed: 0, persisted: 0, failed: 0 }).map(([label, value], index) => {
              const names: Record<string, string> = { submitted: '提交', created: '任务创建', completed: '生成完成', persisted: '永久保存', failed: '失败任务' };
              const base = report?.funnel.submitted || 1;
              return <div key={label}><div className="mb-1 flex justify-between text-xs"><span>{names[label]}</span><strong>{value}</strong></div><div className="h-3 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${label === 'failed' ? 'bg-red-500' : index === 3 ? 'bg-teal-700' : 'bg-teal-400'}`} style={{ width: `${Math.min(100, (Number(value) / base) * 100)}%` }} /></div></div>;
            })}
          </div></section>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="接口平均延迟" value={formatBytes(report?.latency.averageMs || 0)} note={`P50 ${formatBytes(report?.latency.p50Ms || 0)}`} />
          <Stat label="接口 P95" value={formatBytes(report?.latency.p95Ms || 0)} note={`P99 ${formatBytes(report?.latency.p99Ms || 0)}`} />
          <Stat label="完整生成平均时间" value={formatBytes(report?.generationLatency.averageMs || 0)} note={`${report?.generationLatency.completedTasks || 0} 个可配对任务`} />
          <Stat label="Suno 任务 / 估算成本" value={`${report?.suno.generationCalls || 0} / ${report?.suno.estimatedCost == null ? '未配置' : `${report.suno.estimatedCost} ${report.suno.currency}`}`} note="成本需配置单次估算值" />
        </section>

        <div className="grid gap-5 xl:grid-cols-3">
          <section className={`${panel} p-5`}><h2 className="font-semibold">错误原因排行</h2><div className="mt-3 space-y-2">{(report?.errors || []).slice(0, 8).map((row) => <div key={row.reason} className="flex justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-xs"><span className="truncate text-red-800" title={row.reason}>{row.reason}</span><strong>{row.count}</strong></div>)}{!report?.errors.length && <p className="text-sm text-slate-400">暂无错误</p>}</div></section>
          <section className={`${panel} p-5`}><h2 className="font-semibold">模型使用排行</h2><div className="mt-3 space-y-2">{(report?.models || []).map((row) => <div key={row.model} className="rounded-lg bg-slate-50 px-3 py-2 text-xs"><div className="flex justify-between"><strong>{row.model}</strong><span>{row.requests} 次</span></div><p className="mt-1 text-slate-500">成功 {row.successes} · 错误 {row.errors}</p></div>)}</div></section>
          <section className={`${panel} p-5`}><h2 className="font-semibold">访客留存</h2><div className="mt-4 grid grid-cols-2 gap-3"><Stat label="单日访客" value={report?.retention.newVisitors || 0} /><Stat label="跨日回访" value={report?.retention.returningVisitors || 0} /></div><p className="mt-3 text-xs text-slate-500">按同一 visitorId 是否出现在多个自然日计算。</p></section>
        </div>

        <section className={panel}><h2 className="border-b border-slate-100 px-4 py-3 font-semibold">接口健康</h2><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">接口</th><th>请求</th><th>成功率</th><th>错误</th><th>限流</th><th>平均</th><th>P95</th></tr></thead><tbody>{(report?.endpoints || []).map((row) => <tr key={row.endpoint} className="border-t border-slate-100"><td className="p-3 font-mono">{row.endpoint}</td><td>{row.requests}</td><td>{row.successRate}%</td><td>{row.errors}</td><td>{row.blocked}</td><td>{row.averageMs}ms</td><td>{row.p95Ms}ms</td></tr>)}</tbody></table></div></section>

        <DailyVisitorRecords rows={report?.dailyVisitors || []} />

        <VisitorDetailsTable rows={report?.visitorDetails || []} />

        <div className="grid gap-5 xl:grid-cols-2"><ActorTable title={`访客排行 · 高频 ${report?.highFrequencyVisitors || 0}`} rows={report?.topVisitors || []} /><ActorTable title="IP 排行" rows={report?.topIps || []} /></div>

        <section className={panel}>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-semibold">最近请求</h2><p className="mt-1 text-xs text-slate-500">支持搜索访客、IP、任务、模型、接口和错误</p></div><div className="flex flex-wrap gap-2"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索…" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" /><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="all">全部状态</option><option value="success">成功</option><option value="error">错误</option><option value="blocked">限流</option></select><button onClick={() => downloadCsv(filteredEvents)} className="h-9 rounded-full border border-teal-200 px-4 text-sm font-semibold text-teal-800">导出 CSV</button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">时间</th><th>状态</th><th>接口</th><th>访客</th><th>IP 地址</th><th>模型 / 页面 / 标题</th><th>耗时</th><th>错误</th></tr></thead><tbody>{pageEvents.map((event) => <tr key={event.id} className="border-t border-slate-100 align-top"><td className="p-3">{formatDate(event.createdAt)}</td><td><span className={`rounded-full px-2 py-1 font-semibold ${event.status === 'success' ? 'bg-emerald-50 text-emerald-700' : event.status === 'blocked' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{event.statusCode}</span></td><td className="font-mono">{event.endpoint}</td><td className="max-w-52 truncate font-mono" title={event.visitorId}>{event.visitorId}</td><td className="whitespace-nowrap font-mono text-slate-600"><span className="select-all" title={event.ip}>{event.ip}</span></td><td className="max-w-52 truncate">{[event.model, event.title].filter(Boolean).join(' / ') || '-'}</td><td>{event.durationMs}ms</td><td className="max-w-60 truncate text-red-600" title={event.error}>{event.error || '-'}</td></tr>)}</tbody></table></div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm"><span>{filteredEvents.length} 条匹配记录</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">上一页</button><span>{page}/{pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">下一页</button></div></div>
        </section>
      </div>
    </main>
  );
}
