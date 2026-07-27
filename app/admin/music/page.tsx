'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type AdminMusicItem = {
  taskId: string; trackId: string; visitorId: string; title: string; tags: string;
  audioUrl: string; downloadUrl: string; imageUrl: string; prompt: string; negativeTags: string;
  model: string; duration: number; createdAt: string; audioPath: string | null; imagePath: string | null;
};
type HealthStatus = 'permanent' | 'temporary' | 'missing';
type TrackHealth = {
  taskId: string; trackId: string; audioStatus: HealthStatus; imageStatus: HealthStatus;
  audioReason: string; imageReason: string; audioBytes: number; imageBytes: number; sourceHost: string;
};
type StorageReport = {
  checkedAt: string; databaseRecords: number; permanentAudio: number; temporaryAudio: number; missingAudio: number;
  permanentImages: number; blobFiles: number; orphanFiles: number; totalBlobBytes: number;
  readProbe: { ok: boolean; path: string; error: string }; tracks: TrackHealth[];
  orphans: Array<{ pathname: string; size: number; uploadedAt: string }>;
};
type RetryResult = { updated?: string[]; errors?: string[] };

const panel = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

function StatusBadge({ status }: { status: HealthStatus }) {
  const label = status === 'permanent' ? '永久 Blob' : status === 'missing' ? '文件丢失' : '临时链接';
  const color = status === 'permanent' ? 'bg-emerald-50 text-emerald-700' : status === 'missing' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

function exportStorageCsv(items: AdminMusicItem[], health: Map<string, TrackHealth>) {
  const header = ['created_at', 'task_id', 'track_id', 'visitor_id', 'title', 'model', 'audio_status', 'audio_reason', 'audio_bytes', 'image_status', 'source_host'];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = items.map((item) => {
    const status = health.get(`${item.taskId}:${item.trackId}`);
    return [item.createdAt, item.taskId, item.trackId, item.visitorId, item.title, item.model, status?.audioStatus, status?.audioReason, status?.audioBytes, status?.imageStatus, status?.sourceHost].map(escape).join(',');
  });
  const url = URL.createObjectURL(new Blob([`\uFEFF${[header.join(','), ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `music-storage-${Date.now()}.csv`; link.click(); URL.revokeObjectURL(url);
}

export default function AdminMusicPage() {
  const [token, setToken] = useState('');
  const [items, setItems] = useState<AdminMusicItem[]>([]);
  const [total, setTotal] = useState(0);
  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | HealthStatus>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [musicResponse, monitorResponse] = await Promise.all([
        fetch('/api/admin/music?limit=1000', { cache: 'no-store' }),
        fetch('/api/admin/monitor', { cache: 'no-store' }),
      ]);
      const [musicData, monitorData] = await Promise.all([musicResponse.json(), monitorResponse.json()]);
      if (!musicResponse.ok) throw new Error(musicData.error || '无法读取歌曲记录');
      if (!monitorResponse.ok) throw new Error(monitorData.error || '无法读取存储健康');
      setItems(musicData.items || []); setTotal(musicData.total || 0); setStorage(monitorData); setPage(1);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取存储数据');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch('/api/admin/verify', { cache: 'no-store' }).then((response) => response.json()).then((data) => { const admin = Boolean(data.isAdmin); setHasSession(admin); if (!admin) setLoading(false); }).catch(() => setLoading(false));
  }, []);
  useEffect(() => { if (hasSession) loadData(); }, [hasSession, loadData]);
  useEffect(() => {
    if (!autoRefresh || !hasSession) return;
    const timer = window.setInterval(loadData, 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, hasSession, loadData]);

  const startSession = async () => {
    if (!token.trim()) return setError('请输入管理 Token');
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }) });
      if (!response.ok) throw new Error('管理 Token 无效');
      setToken(''); setHasSession(true);
    } catch (sessionError) { setError(sessionError instanceof Error ? sessionError.message : '登录失败'); setLoading(false); }
  };

  const runRetry = async (target?: AdminMusicItem) => {
    const key = target ? `${target.taskId}:${target.trackId}` : 'all';
    setActionLoading(key); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/monitor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', ...(target ? { targets: [{ taskId: target.taskId, trackId: target.trackId }] } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '重新转存失败');
      const results = data.results || [];
      const updated = results.filter((row: RetryResult) => row.updated?.length).length;
      const failed = results.filter((row: RetryResult) => row.errors?.length).length;
      setNotice(`重试完成：${updated} 首有更新，${failed} 首仍需处理。`);
      await loadData();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : '重新转存失败'); }
    finally { setActionLoading(''); }
  };

  const cleanupOrphans = async () => {
    if (!window.confirm(`确定删除 ${storage?.orphanFiles || 0} 个未被数据库引用的 Blob 文件吗？`)) return;
    setActionLoading('cleanup'); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/monitor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup-orphans' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '孤儿清理失败');
      setNotice(`已清理 ${data.deleted?.length || 0} 个孤儿文件。`); await loadData();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : '孤儿清理失败'); }
    finally { setActionLoading(''); }
  };

  const removeMusic = async (item: AdminMusicItem) => {
    if (!window.confirm(`确定删除“${item.title}”及其云端文件吗？此操作不可恢复。`)) return;
    const response = await fetch('/api/admin/music', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: item.taskId, trackId: item.trackId }) });
    const data = await response.json();
    if (!response.ok) return setError(data.error || '删除失败');
    setNotice('歌曲及对应 Blob 已删除。'); await loadData();
  };

  const healthMap = useMemo(() => new Map((storage?.tracks || []).map((track) => [`${track.taskId}:${track.trackId}`, track])), [storage]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const health = healthMap.get(`${item.taskId}:${item.trackId}`);
      if (status !== 'all' && health?.audioStatus !== status) return false;
      return !needle || [item.title, item.visitorId, item.taskId, item.trackId, item.model, health?.sourceHost].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [healthMap, items, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const uniqueVisitors = new Set(items.map((item) => item.visitorId)).size;

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-3 py-5 text-slate-950 sm:px-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className={`${panel} p-5`}><div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-sm font-semibold text-teal-700">EchoTaste Admin</p><h1 className="mt-1 text-3xl font-semibold">存储健康与音乐管理</h1><p className="mt-2 text-sm text-slate-500">检测永久、临时和丢失文件，并提供重新转存与孤儿清理。</p><Link href="/admin/usage" className="mt-2 inline-block text-sm font-semibold text-teal-700">API 与业务监控 →</Link></div><div className="flex flex-wrap items-end gap-2">{!hasSession && <input type="password" value={token} onChange={(event) => setToken(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') startSession(); }} placeholder="ADMIN_USAGE_TOKEN" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" />}<label className="flex h-10 items-center gap-2 rounded-xl border px-3 text-sm"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />60 秒自动刷新</label><button onClick={hasSession ? loadData : startSession} disabled={loading} className="h-10 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50">{loading ? '检测中…' : hasSession ? '重新检测' : '登录'}</button></div></div>{storage && <p className="mt-3 text-xs text-slate-400">最后检测：{formatDate(storage.checkedAt)}</p>}</header>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[['数据库记录', storage?.databaseRecords || total], ['永久音频', storage?.permanentAudio || 0], ['临时音频', storage?.temporaryAudio || 0], ['文件丢失', storage?.missingAudio || 0], ['永久封面', storage?.permanentImages || 0], ['Blob 文件', storage?.blobFiles || 0], ['孤儿文件', storage?.orphanFiles || 0], ['存储总量', formatBytes(storage?.totalBlobBytes || 0)]].map(([label, value]) => <div key={String(label)} className={`${panel} p-4`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
        </section>

        <section className={`${panel} p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-semibold">Blob 读取健康</h2><p className={`mt-2 text-sm ${storage?.readProbe.ok ? 'text-emerald-700' : 'text-red-700'}`}>{storage?.readProbe.ok ? '✓ SDK 读取探针通过' : `✕ ${storage?.readProbe.error || '尚未检测'}`}</p>{storage?.readProbe.path && <p className="mt-1 max-w-2xl truncate font-mono text-xs text-slate-400">{storage.readProbe.path}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => runRetry()} disabled={Boolean(actionLoading)} className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{actionLoading === 'all' ? '批量重试中…' : '重试全部异常'}</button><button onClick={cleanupOrphans} disabled={!storage?.orphanFiles || Boolean(actionLoading)} className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40">{actionLoading === 'cleanup' ? '清理中…' : '清理孤儿文件'}</button></div></div>
          {storage?.orphans.length ? <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs"><summary className="cursor-pointer font-semibold">查看 {storage.orphans.length} 个孤儿文件</summary><ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-slate-600">{storage.orphans.map((orphan) => <li key={orphan.pathname}>{orphan.pathname} · {formatBytes(orphan.size)}</li>)}</ul></details> : null}
        </section>

        <section className={panel}>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="font-semibold">歌曲存储明细</h2><p className="mt-1 text-xs text-slate-500">{total} 首歌曲 · {uniqueVisitors} 个访客</p></div><div className="flex flex-wrap gap-2"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索标题、访客、任务、模型…" className="h-9 w-60 rounded-lg border border-slate-200 px-3 text-sm" /><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm"><option value="all">全部状态</option><option value="permanent">永久 Blob</option><option value="temporary">临时链接</option><option value="missing">文件丢失</option></select><button onClick={() => exportStorageCsv(filtered, healthMap)} className="h-9 rounded-full border border-teal-200 px-4 text-sm font-semibold text-teal-800">导出 CSV</button></div></div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            {pageItems.map((item) => {
              const health = healthMap.get(`${item.taskId}:${item.trackId}`);
              const actionKey = `${item.taskId}:${item.trackId}`;
              return <article key={actionKey} className="overflow-hidden rounded-2xl border border-slate-200"><div className="grid sm:grid-cols-[150px_minmax(0,1fr)]"><div className="h-40 bg-gradient-to-br from-teal-100 to-rose-50 sm:h-full">{item.imageUrl ? <img src={item.imageUrl} alt={`${item.title} 封面`} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-4xl">♫</div>}</div><div className="min-w-0 space-y-3 p-4"><div><div className="flex items-start justify-between gap-2"><h3 className="truncate font-semibold">{item.title}</h3><span className="text-xs text-slate-500">{formatTime(item.duration)}</span></div><p className="mt-1 text-xs text-slate-400">{formatDate(item.createdAt)}</p></div><div className="flex flex-wrap gap-2"><StatusBadge status={health?.audioStatus || 'temporary'} /><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">封面：{health?.imageStatus === 'permanent' ? '永久' : health?.imageStatus === 'missing' ? '丢失' : '临时'}</span></div><p className="rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">{health?.audioReason || '等待检测'}{health?.audioBytes ? ` · ${formatBytes(health.audioBytes)}` : ''}</p>{health?.audioStatus === 'permanent' && <audio controls preload="metadata" src={item.audioUrl} className="w-full" />}<dl className="text-xs text-slate-500"><div><dt className="inline font-semibold">访客：</dt><dd className="inline break-all font-mono">{item.visitorId}</dd></div><div><dt className="inline font-semibold">模型：</dt><dd className="inline">{item.model || '-'}</dd></div>{health?.sourceHost && <div><dt className="inline font-semibold">源域名：</dt><dd className="inline font-mono">{health.sourceHost}</dd></div>}</dl><details className="rounded-lg bg-slate-50 p-2 text-xs"><summary className="cursor-pointer font-semibold">Prompt 与标识</summary><p className="mt-2 whitespace-pre-wrap">{item.prompt || '-'}</p><p className="mt-2 break-all font-mono text-slate-400">{item.taskId}:{item.trackId}</p></details><div className="flex flex-wrap gap-2">{health?.audioStatus === 'permanent' && <a href={item.downloadUrl} className="rounded-full bg-teal-700 px-3 py-2 text-xs font-semibold text-white">下载</a>}{health?.audioStatus !== 'permanent' && <button onClick={() => runRetry(item)} disabled={Boolean(actionLoading)} className="rounded-full bg-amber-500 px-3 py-2 text-xs font-semibold text-white">{actionLoading === actionKey ? '重试中…' : '重新转存'}</button>}<button onClick={() => removeMusic(item)} className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">删除</button></div></div></div></article>;
            })}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm"><span>{filtered.length} 条匹配记录</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">上一页</button><span>{page}/{pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1 disabled:opacity-40">下一页</button></div></div>
        </section>
      </div>
    </main>
  );
}
