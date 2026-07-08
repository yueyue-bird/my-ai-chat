'use client';

import { useEffect, useMemo, useState } from 'react';

type UsageActorSummary = {
  id: string;
  requests: number;
  generateRequests: number;
  errors: number;
  lastSeen: string;
  lastUserAgent: string;
};

type UsageEndpointSummary = {
  endpoint: string;
  requests: number;
  errors: number;
};

type UsageEvent = {
  id: string;
  createdAt: string;
  endpoint: string;
  method: string;
  status: 'success' | 'error' | 'blocked';
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

type UsageReport = {
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

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const statClass = 'rounded-lg border border-slate-200 bg-white p-4 shadow-sm';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={statClass}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ActorTable({ title, rows }: { title: string; rows: UsageActorSummary[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">标识</th>
              <th className="px-4 py-3">请求</th>
              <th className="px-4 py-3">生成</th>
              <th className="px-4 py-3">错误</th>
              <th className="px-4 py-3">最后使用</th>
              <th className="px-4 py-3">浏览器</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-slate-500" colSpan={6}>
                  暂无记录
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-700">{row.id}</td>
                  <td className="px-4 py-3">{row.requests}</td>
                  <td className="px-4 py-3">{row.generateRequests}</td>
                  <td className="px-4 py-3">{row.errors}</td>
                  <td className="px-4 py-3">{formatDate(row.lastSeen)}</td>
                  <td className="max-w-[320px] truncate px-4 py-3 text-xs text-slate-500">{row.lastUserAgent || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function UsageAdminPage() {
  const [token, setToken] = useState('');
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpointRows = useMemo(() => report?.endpoints || [], [report]);

  useEffect(() => {
    const savedToken = localStorage.getItem('usage_admin_token') || '';
    setToken(savedToken);
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ days: String(days), limit: '1000' });
      const headers: HeadersInit = {};

      if (token.trim()) {
        headers.Authorization = `Bearer ${token.trim()}`;
        localStorage.setItem('usage_admin_token', token.trim());
      }

      const response = await fetch(`/api/admin/usage?${params.toString()}`, {
        headers,
        cache: 'no-store',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || '无法读取用量数据');
      }

      setReport(data);
    } catch (err: any) {
      setError(err.message || '无法读取用量数据');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Admin</p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">API 使用监控</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-[220px_140px_auto]">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase text-slate-500">管理 Token</span>
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="ADMIN_USAGE_TOKEN"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase text-slate-500">时间范围</span>
              <select
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value={1}>最近 1 天</option>
                <option value={7}>最近 7 天</option>
                <option value={30}>最近 30 天</option>
                <option value={90}>最近 90 天</option>
              </select>
            </label>
            <button
              type="button"
              onClick={loadReport}
              disabled={loading}
              className="h-10 self-end rounded-full bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:bg-slate-300"
            >
              {loading ? '刷新中...' : '刷新'}
            </button>
          </div>
        </header>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="总请求" value={report?.totalRequests || 0} />
          <StatCard label="生成请求" value={report?.generateRequests || 0} />
          <StatCard label="成功" value={report?.successRequests || 0} />
          <StatCard label="错误" value={report?.errorRequests || 0} />
          <StatCard label="访客 / IP" value={`${report?.uniqueVisitors || 0} / ${report?.uniqueIps || 0}`} />
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <ActorTable title="访客排行" rows={report?.topVisitors || []} />
          <ActorTable title="IP 排行" rows={report?.topIps || []} />
        </div>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">接口统计</h2>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            {endpointRows.length === 0 ? (
              <p className="text-sm text-slate-500">暂无记录</p>
            ) : (
              endpointRows.map((row) => (
                <div key={row.endpoint} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-mono text-xs text-slate-600">{row.endpoint}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    请求 {row.requests} 次，错误 {row.errors} 次
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-950">最近请求</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">接口</th>
                  <th className="px-4 py-3">访客</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">模型 / 标题</th>
                  <th className="px-4 py-3">耗时</th>
                  <th className="px-4 py-3">错误</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(report?.recentEvents || []).length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-slate-500" colSpan={8}>
                      暂无记录
                    </td>
                  </tr>
                ) : (
                  report?.recentEvents.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="px-4 py-3">{formatDate(event.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            event.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {event.statusCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{event.endpoint}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs">{event.visitorId}</td>
                      <td className="px-4 py-3 font-mono text-xs">{event.ip}</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-xs text-slate-600">
                        {[event.model, event.title].filter(Boolean).join(' / ') || '-'}
                      </td>
                      <td className="px-4 py-3">{event.durationMs}ms</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-xs text-red-600">{event.error || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
