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
type UsageReport = {
  totalRequests: number; successRequests: number; errorRequests: number; blockedRequests: number;
  generateRequests: number; uniqueVisitors: number; uniqueIps: number; generatedAt: string;
  topVisitors: Actor[]; topIps: Actor[]; endpoints: Endpoint[]; recentEvents: UsageEvent[];
  trend: Trend[]; latency: Latency; generationLatency: Latency & { completedTasks: number };
  funnel: { submitted: number; created: number; completed: number; persisted: number; failed: number };
  errors: Array<{ reason: string; count: number }>;
  models: Array<{ model: string; requests: number; successes: number; errors: number }>;
  retention: { newVisitors: number; returningVisitors: number; returnRate: number };
  suno: { generationCalls: number; estimatedCost: number | null; currency: string };
};

const panel = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(new Date(value));
const formatBytes = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;

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
              <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-10 rounded-xl border border-slate-200 px-3 text-sm"><option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option><option value={365}>365 天</option></select>
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

        <div className="grid gap-5 xl:grid-cols-2"><ActorTable title="访客排行" rows={report?.topVisitors || []} /><ActorTable title="IP 排行" rows={report?.topIps || []} /></div>

        <section className={panel}>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-semibold">最近请求</h2><p className="mt-1 text-xs text-slate-500">支持搜索访客、IP、任务、模型、接口和错误</p></div><div className="flex flex-wrap gap-2"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索…" className="h-9 rounded-lg border border-slate-200 px-3 text-sm" /><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="all">全部状态</option><option value="success">成功</option><option value="error">错误</option><option value="blocked">限流</option></select><button onClick={() => downloadCsv(filteredEvents)} className="h-9 rounded-full border border-teal-200 px-4 text-sm font-semibold text-teal-800">导出 CSV</button></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">时间</th><th>状态</th><th>接口</th><th>访客 / IP</th><th>模型 / 标题</th><th>耗时</th><th>错误</th></tr></thead><tbody>{pageEvents.map((event) => <tr key={event.id} className="border-t border-slate-100 align-top"><td className="p-3">{formatDate(event.createdAt)}</td><td><span className={`rounded-full px-2 py-1 font-semibold ${event.status === 'success' ? 'bg-emerald-50 text-emerald-700' : event.status === 'blocked' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{event.statusCode}</span></td><td className="font-mono">{event.endpoint}</td><td className="max-w-52 truncate font-mono">{event.visitorId}<br /><span className="text-slate-400">{event.ip}</span></td><td className="max-w-52 truncate">{[event.model, event.title].filter(Boolean).join(' / ') || '-'}</td><td>{event.durationMs}ms</td><td className="max-w-60 truncate text-red-600" title={event.error}>{event.error || '-'}</td></tr>)}</tbody></table></div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm"><span>{filteredEvents.length} 条匹配记录</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">上一页</button><span>{page}/{pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">下一页</button></div></div>
        </section>
      </div>
    </main>
  );
}
