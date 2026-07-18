// app/generate/GenerateContent.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  affectiveOptions,
  anchorStageOptions,
  buildResearchMusicPrompt,
  tasteOptions,
  type AffectiveKey,
  type TasteKey,
  type TasteTrajectoryAnchor,
} from '@/lib/musicPrompt';

const saveSubmittedPrompt = (taskId: string, requestBody: any, taskToken: string) => {
  if (typeof window === 'undefined') return;

  let prompts: Record<string, any> = {};
  const stored = localStorage.getItem('music_submitted_prompts');
  if (stored) {
    try {
      prompts = JSON.parse(stored);
    } catch {
      prompts = {};
    }
  }

  prompts[taskId] = {
    prompt: requestBody.prompt || '',
    title: requestBody.title || '',
    negativeTags: requestBody.negativeTags || '',
    model: requestBody.model || '',
    taskToken,
    createdAt: Date.now(),
  };
  localStorage.setItem('music_submitted_prompts', JSON.stringify(prompts));
};

const getVisitorId = () => {
  if (typeof window === 'undefined') return 'anonymous';

  const existing = localStorage.getItem('usage_visitor_id');
  if (existing) return existing;

  const nextId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem('usage_visitor_id', nextId);
  return nextId;
};

const panelClass = 'food-panel';

const tasteToneMap: Record<TasteKey, string> = {
  sweet: 'bg-rose-50/80',
  sour: 'bg-lime-50/80',
  bitter: 'bg-stone-100/80',
  salty: 'bg-sky-50/80',
};

type NewAnchorDraft = Pick<TasteTrajectoryAnchor, 'position' | 'taste' | 'intensity' | 'affective' | 'mouthfeel'>;

const defaultNewAnchorDraft: NewAnchorDraft = {
  position: 0.5,
  taste: 'sweet',
  intensity: 50,
  affective: 'mixed',
  mouthfeel: '',
};

const defaultAnchors: TasteTrajectoryAnchor[] = [
  { id: 'onset', position: 0, stage: 'onset', taste: 'sour', intensity: 70, affective: 'mixed', mouthfeel: '' },
  { id: 'development', position: 0.5, stage: 'development', taste: 'sweet', intensity: 55, affective: 'liked', mouthfeel: '' },
  { id: 'aftertaste', position: 1, stage: 'aftertaste', taste: 'sweet', intensity: 30, affective: 'liked', mouthfeel: '' },
];

const clampPosition = (position: number) => Math.max(0, Math.min(1, position));

const getAnchorX = (position: number) => 8 + clampPosition(position) * 144;
const getAnchorY = (intensity: number) => 84 - Math.max(0, Math.min(100, intensity)) * 0.72;

const chartTasteStyles: Record<TasteKey, { fill: string; ring: string }> = {
  sweet: { fill: '#df7b69', ring: '#fde4df' },
  sour: { fill: '#8aa94f', ring: '#e6f0d3' },
  bitter: { fill: '#806b5b', ring: '#e9e0d6' },
  salty: { fill: '#4e8faa', ring: '#dcecf2' },
};

const buildAnchorPath = (anchors: TasteTrajectoryAnchor[]) => {
  const points = anchors.map((anchor) => {
    const x = getAnchorX(anchor.position);
    const y = getAnchorY(anchor.intensity);
    return `${x},${y}`;
  });
  return points.join(' ');
};

const buildFullTrajectoryPath = (anchors: TasteTrajectoryAnchor[]) => {
  const sortedAnchors = [...anchors].sort((a, b) => a.position - b.position);
  const first = sortedAnchors[0];
  const last = sortedAnchors[sortedAnchors.length - 1];
  if (!first || !last) return '';

  const points = sortedAnchors.map((anchor) => `${getAnchorX(anchor.position)},${getAnchorY(anchor.intensity)}`);
  if (getAnchorX(first.position) > 8) points.unshift(`8,${getAnchorY(first.intensity)}`);
  if (getAnchorX(last.position) < 152) points.push(`152,${getAnchorY(last.intensity)}`);
  return points.join(' ');
};

const getDominantTaste = (anchors: TasteTrajectoryAnchor[]) => anchors[0]?.taste || 'sweet';

export default function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastTaskId = searchParams.get('taskId');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentTaskId, setRecentTaskId] = useState<string | null>(lastTaskId);
  const [canViewSunoPrompt, setCanViewSunoPrompt] = useState(false);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [isAddingAnchor, setIsAddingAnchor] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [newAnchorDraft, setNewAnchorDraft] = useState<NewAnchorDraft>(defaultNewAnchorDraft);
  const [formData, setFormData] = useState({
    researchAnchors: defaultAnchors,
    model: 'V4_5PLUS',
  });

  const researchPrompt = buildResearchMusicPrompt({
    anchors: formData.researchAnchors,
  });
  const activePrompt = researchPrompt;
  const isMissingApiKeyError = error?.includes('SUNO_API_KEY');
  const selectedAnchor = selectedAnchorId
    ? formData.researchAnchors.find((anchor) => anchor.id === selectedAnchorId)
    : null;
  const selectedAnchorIndex = selectedAnchor
    ? formData.researchAnchors.findIndex((anchor) => anchor.id === selectedAnchor.id)
    : -1;
  const selectedStageOption = selectedAnchor
    ? anchorStageOptions.find((stage) => stage.value === selectedAnchor.stage)
    : null;
  const averageIntensity = Math.round(
    formData.researchAnchors.reduce((total, anchor) => total + anchor.intensity, 0) /
      formData.researchAnchors.length
  );
  const peakAnchor = formData.researchAnchors.reduce(
    (peak, anchor) => (anchor.intensity > peak.intensity ? anchor : peak),
    formData.researchAnchors[0]
  );
  const dominantTaste = getDominantTaste(formData.researchAnchors);
  const dominantTasteLabel = tasteOptions.find((taste) => taste.value === dominantTaste)?.label ?? dominantTaste;

  useEffect(() => {
    if (lastTaskId) {
      setRecentTaskId(lastTaskId);
    }
  }, [lastTaskId]);

  useEffect(() => {
    const verifyAdmin = async () => {
      if (typeof window === 'undefined') return;

      try {
        const res = await fetch('/api/admin/verify');
        const data = await res.json();
        setCanViewSunoPrompt(Boolean(data.isAdmin));
      } catch {
        setCanViewSunoPrompt(false);
      }
    };

    verifyAdmin();
  }, []);

  const updateAnchor = <K extends keyof TasteTrajectoryAnchor>(
    id: string,
    key: K,
    value: TasteTrajectoryAnchor[K]
  ) => {
    setFormData({
      ...formData,
      researchAnchors: formData.researchAnchors.map((anchor) =>
        anchor.id === id ? { ...anchor, [key]: value } : anchor
      ),
    });
  };

  const addAnchor = () => {
    const position = clampPosition(newAnchorDraft.position);
    const newAnchor: TasteTrajectoryAnchor = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `anchor-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      position,
      stage: 'development',
      taste: newAnchorDraft.taste,
      intensity: newAnchorDraft.intensity,
      affective: newAnchorDraft.affective,
      mouthfeel: newAnchorDraft.mouthfeel,
    };

    setFormData({
      ...formData,
      researchAnchors: [...formData.researchAnchors, newAnchor].sort((a, b) => a.position - b.position),
    });
    setIsAddingAnchor(false);
  };

  const openAddAnchorForm = () => {
    setNewAnchorDraft(defaultNewAnchorDraft);
    setIsAddingAnchor(true);
  };

  const closeAnchorEditor = () => {
    setSelectedAnchorId(null);
    setIsConfirmingDelete(false);
  };

  const deleteSelectedAnchor = () => {
    if (!selectedAnchor || formData.researchAnchors.length === 1) return;

    setFormData({
      ...formData,
      researchAnchors: formData.researchAnchors.filter((anchor) => anchor.id !== selectedAnchor.id),
    });
    closeAnchorEditor();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const requestBody: any = {
        customMode: true,
        instrumental: true,
        model: formData.model,
        title: activePrompt.title,
        prompt: activePrompt.prompt,
      };

      if (activePrompt.negativeTags) {
        requestBody.negativeTags = activePrompt.negativeTags;
      }

      const res = await fetch('/api/chat/suno/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-visitor-id': getVisitorId(),
        },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || '生成失败');
      }

      const taskId = data.task_id;
      if (typeof taskId !== 'string' || typeof data.task_token !== 'string') {
        throw new Error('生成服务未返回有效的任务访问凭证');
      }
      saveSubmittedPrompt(taskId, requestBody, data.task_token);
      setRecentTaskId(taskId);
      router.push(`/generate/result/${taskId}?from=generate`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <main className="food-shell text-slate-950">
      <div className="px-3 pt-3 sm:px-5 sm:pt-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-[1.45rem] border border-white/80 bg-white/75 px-4 py-3 shadow-[0_8px_28px_rgba(59,91,105,.08)] backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#dcecdf] text-xl shadow-inner">🍐</div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#6d8b85]">food sound studio</p>
              <h1 className="text-lg font-bold tracking-tight text-[#233a4a] md:text-xl">Taste to Music Lab</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push('/generate/history')}
              className="food-nav-action rounded-full px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-[#afcbc0] sm:px-4"
            >
              历史记录
            </button>
            <button
              type="button"
              onClick={() => router.push('/generate/favorites?from=generate')}
              className="food-action rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 sm:px-4"
            >
              收藏夹
            </button>
          </div>
        </div>
      </div>

      {isAddingAnchor && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4"
          onClick={() => setIsAddingAnchor(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-teal-800 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">Anchor editor</p>
                  <h2 className="mt-1 text-xl font-semibold">添加锚点</h2>
                  <p className="mt-1 text-sm text-teal-50/80">填写锚点信息后，点击确定添加。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingAnchor(false)}
                  className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white hover:bg-white/20"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_112px]">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">
                    横坐标（时间位置）：{newAnchorDraft.position.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={newAnchorDraft.position}
                    onChange={(event) =>
                      setNewAnchorDraft({ ...newAnchorDraft, position: Number(event.target.value) })
                    }
                    className="h-11 w-full accent-teal-700"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">精确数值</span>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={newAnchorDraft.position}
                    onChange={(event) =>
                      setNewAnchorDraft({
                        ...newAnchorDraft,
                        position: clampPosition(Number(event.target.value)),
                      })
                    }
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Taste</span>
                  <select
                    value={newAnchorDraft.taste}
                    onChange={(event) =>
                      setNewAnchorDraft({ ...newAnchorDraft, taste: event.target.value as TasteKey })
                    }
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  >
                    {tasteOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">
                    Intensity: {newAnchorDraft.intensity}/100
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newAnchorDraft.intensity}
                    onChange={(event) =>
                      setNewAnchorDraft({ ...newAnchorDraft, intensity: Number(event.target.value) })
                    }
                    className="h-11 w-full accent-teal-700"
                  />
                </label>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Affective response</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {affectiveOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setNewAnchorDraft({ ...newAnchorDraft, affective: option.value as AffectiveKey })
                      }
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        newAnchorDraft.affective === option.value
                          ? 'border-teal-600 bg-teal-50 text-teal-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block font-semibold">{option.label}</span>
                    </button>
                  ))}
                </div>
              </section>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-900">Mouthfeel</span>
                <input
                  type="text"
                  value={newAnchorDraft.mouthfeel}
                  onChange={(event) => setNewAnchorDraft({ ...newAnchorDraft, mouthfeel: event.target.value })}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  placeholder="e.g., fizzy, creamy, dry, melting..."
                />
              </label>

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddingAnchor(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={addAnchor}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  确定添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAnchor && selectedStageOption && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4" onClick={closeAnchorEditor}>
          <div
            className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="bg-teal-800 px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">Anchor editor</p>
                  <h2 className="mt-1 text-xl font-semibold">
                    锚点 {selectedAnchorIndex + 1} · {selectedStageOption.label}
                  </h2>
                  <p className="mt-1 text-sm text-teal-50/80">
                    time {selectedAnchor.position.toFixed(2)} / {selectedStageOption.role}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAnchorEditor}
                  className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white hover:bg-white/20"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Taste</span>
                  <select
                    value={selectedAnchor.taste}
                    onChange={(e) => updateAnchor(selectedAnchor.id, 'taste', e.target.value as TasteKey)}
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  >
                    {tasteOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Intensity: {selectedAnchor.intensity}/100</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedAnchor.intensity}
                    onChange={(e) => updateAnchor(selectedAnchor.id, 'intensity', Number(e.target.value))}
                    className="h-11 w-full accent-teal-700"
                  />
                </label>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">Affective response</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  {affectiveOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateAnchor(selectedAnchor.id, 'affective', option.value)}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        selectedAnchor.affective === option.value
                          ? 'border-teal-600 bg-teal-50 text-teal-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block font-semibold">{option.label}</span>
                    </button>
                  ))}
                </div>
              </section>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-900">Mouthfeel</span>
                <input
                  type="text"
                  value={selectedAnchor.mouthfeel}
                  onChange={(e) => updateAnchor(selectedAnchor.id, 'mouthfeel', e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  placeholder="e.g., fizzy, creamy, dry, melting..."
                />
              </label>

              <div className="border-t border-slate-100 pt-4">
                {isConfirmingDelete ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-800">确认删除这个锚点？</p>
                    <p className="mt-1 text-sm text-red-700">删除后无法恢复。</p>
                    <div className="mt-3 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDelete(false)}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedAnchor}
                        className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
                      >
                        确认删除
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(true)}
                      disabled={formData.researchAnchors.length === 1}
                      className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                    >
                      删除此锚点
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className={`relative overflow-hidden ${panelClass} ${tasteToneMap[getDominantTaste(formData.researchAnchors)]}`}>
            <div className="relative z-10 max-w-[70%]">
              <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#3e7a68]">Taste composer</p>
              <p className="text-sm leading-6 text-slate-600">用酸甜、口感与时间曲线，生成一段属于这次品尝的旋律。</p>
            </div>
            <div aria-hidden="true" className="absolute bottom-3 right-3 flex items-end gap-1 text-3xl drop-shadow-sm sm:right-6 sm:text-4xl"><span className="-rotate-12">🍋</span><span className="mb-2 rotate-6">🍓</span><span className="-rotate-6">🍐</span></div>
            <h2 className="relative z-10 mt-3 max-w-[70%] text-xl font-bold tracking-tight text-[#233a4a]">味觉词汇生成</h2>
            <p className="relative z-10 mt-2 max-w-[70%] text-sm leading-6 text-slate-500">
              Taste, affective response, mouthfeel texture, time curve.
            </p>
          </section>

          <section className={panelClass}>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Taste trajectory anchors</h2>
                </div>
                <button
                  type="button"
                  onClick={openAddAnchorForm}
                  className="food-action rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
                >
                  添加锚点
                </button>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Trajectory: normalized time curve</h3>
                <div className="rounded-2xl border border-[#dde9e5] bg-[#fcfdfb] p-3 shadow-sm sm:p-4">
                  <div className="grid gap-3 lg:grid-cols-[172px_minmax(0,1fr)]">
                    <aside className="relative overflow-hidden rounded-xl bg-[#365a78] p-4 text-white shadow-[0_8px_18px_rgba(54,90,120,.16)]">
                      <div aria-hidden="true" className="absolute -right-4 -top-6 text-6xl opacity-20">🍽️</div>
                      <p className="relative text-[10px] font-bold uppercase tracking-[.18em] text-[#d9eee7]">flavor pulse</p>
                      <div className="relative mt-2 flex items-center gap-3">
                        <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0" role="img" aria-label={`Average intensity ${averageIntensity}`}>
                          <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(255,255,255,.17)" strokeWidth="8" />
                          <circle
                            cx="50"
                            cy="50"
                            r="39"
                            fill="none"
                            stroke={chartTasteStyles[dominantTaste].fill}
                            strokeLinecap="round"
                            strokeWidth="8"
                            pathLength="100"
                            strokeDasharray="100"
                            strokeDashoffset={100 - averageIntensity}
                            transform="rotate(-90 50 50)"
                          />
                          <text x="50" y="52" textAnchor="middle" className="fill-white text-[23px] font-bold">{averageIntensity}</text>
                          <text x="50" y="66" textAnchor="middle" className="fill-[#d9eee7] text-[8px] font-semibold">AVG</text>
                        </svg>
                        <div className="min-w-0">
                          <p className="text-xs text-[#d9eee7]">主导风味</p>
                          <p className="mt-1 truncate text-lg font-bold">{dominantTasteLabel}</p>
                          <p className="mt-1 text-[11px] text-white/70">{formData.researchAnchors.length} 个风味锚点</p>
                        </div>
                      </div>
                      <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 text-center">
                        <div className="rounded-lg bg-white/10 py-2"><p className="text-[10px] text-white/65">PEAK</p><p className="mt-0.5 text-sm font-bold">{peakAnchor.intensity}</p></div>
                        <div className="rounded-lg bg-white/10 py-2"><p className="text-[10px] text-white/65">TIME</p><p className="mt-0.5 text-sm font-bold">{peakAnchor.position.toFixed(2)}</p></div>
                      </div>
                    </aside>
                    <div className="rounded-xl bg-[#f0f6f4] px-3 py-4 sm:px-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-[#e7f1ed] px-3 py-1 text-xs font-bold text-[#3e7a68]">风味轨迹图</span>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[#78908d]">
                      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#df7b69]" />甜</span>
                      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#8aa94f]" />酸</span>
                      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#806b5b]" />苦</span>
                      <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#4e8faa]" />咸</span>
                    </div>
                  </div>
                  <p className="mb-3 text-sm text-slate-500">请点击曲线中的锚点，编辑该时间点的味道、强度、喜爱程度和口腔感受。</p>
                  <div className="rounded-lg bg-white/55 px-2 py-2 sm:px-3 sm:py-3">
                  <svg viewBox="-20 0 184 110" className="h-52 w-full sm:h-60 lg:h-64" role="img" aria-label="Taste intensity trajectory chart">
                    <defs>
                      <linearGradient id="trajectory-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#5d9b88" stopOpacity="0.34" />
                        <stop offset="100%" stopColor="#5d9b88" stopOpacity="0.02" />
                      </linearGradient>
                      <linearGradient id="trajectory-line" x1="8" x2="152" y1="12" y2="84" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#4d8d7c" />
                        <stop offset="55%" stopColor="#386e76" />
                        <stop offset="100%" stopColor="#567c9b" />
                      </linearGradient>
                      <filter id="trajectory-shadow" x="-20%" y="-30%" width="140%" height="170%">
                        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#315e65" floodOpacity="0.22" />
                      </filter>
                    </defs>
                    <rect x="8" y="12" width="144" height="72" rx="8" fill="#f9fcfb" stroke="#d8e7e1" />
                    {[12, 30, 48, 66, 84].map((y) => (
                      <line key={y} x1="8" y1={y} x2="152" y2={y} stroke="#dce9e5" strokeDasharray={y === 84 ? '0' : '2 3'} strokeWidth={y === 84 ? '1.25' : '1'} />
                    ))}
                    {[8, 44, 80, 116, 152].map((x) => (
                      <line key={x} x1={x} y1="12" x2={x} y2="84" stroke="#edf4f1" strokeWidth="1" />
                    ))}
                    {[{ value: 100, y: 15 }, { value: 50, y: 51 }, { value: 0, y: 87 }].map(({ value, y }) => (
                      <text key={value} x="1" y={y} textAnchor="end" className="fill-[#7c9092] text-[7px] font-semibold">
                        {value}
                      </text>
                    ))}
                    <text x="8" y="7" className="fill-[#5d7777] text-[7px] font-bold tracking-[.08em]">intensity</text>
                    <polygon
                      points={`8,84 ${buildFullTrajectoryPath(formData.researchAnchors)} 152,84`}
                      fill="url(#trajectory-fill)"
                    />
                    {formData.researchAnchors.map((anchor) => (
                      <line
                        key={`${anchor.id}-guide`}
                        x1={getAnchorX(anchor.position)}
                        y1={getAnchorY(anchor.intensity)}
                        x2={getAnchorX(anchor.position)}
                        y2="84"
                        stroke="#92b8aa"
                        strokeDasharray="2 3"
                        strokeWidth="1"
                      />
                    ))}
                    <polyline
                      points={buildFullTrajectoryPath(formData.researchAnchors)}
                      fill="none"
                      stroke="url(#trajectory-line)"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="4"
                      filter="url(#trajectory-shadow)"
                    />
                    {formData.researchAnchors.map((anchor) => (
                      <g
                        key={anchor.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Edit ${anchor.stage} anchor`}
                        className="cursor-pointer outline-none"
                        onClick={() => setSelectedAnchorId(anchor.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedAnchorId(anchor.id);
                          }
                        }}
                      >
                        <title>{`${anchor.stage}: ${anchor.intensity}/100`}</title>
                        <circle
                          cx={getAnchorX(anchor.position)}
                          cy={getAnchorY(anchor.intensity)}
                          r="10"
                          fill={chartTasteStyles[anchor.taste].ring}
                          className="transition-all"
                        />
                        <circle
                          cx={getAnchorX(anchor.position)}
                          cy={getAnchorY(anchor.intensity)}
                          r="6.4"
                          fill={chartTasteStyles[anchor.taste].fill}
                          stroke="white"
                          strokeWidth="2.4"
                          filter="url(#trajectory-shadow)"
                        />
                        <circle
                          cx={getAnchorX(anchor.position)}
                          cy={getAnchorY(anchor.intensity)}
                          r="1.7"
                          fill="white"
                        />
                      </g>
                    ))}
                    <text x="8" y="97" textAnchor="middle" className="fill-[#6f8685] text-[7px] font-semibold">0.0</text>
                    <text x="80" y="97" textAnchor="middle" className="fill-[#6f8685] text-[7px] font-semibold">0.5</text>
                    <text x="152" y="97" textAnchor="middle" className="fill-[#6f8685] text-[7px] font-semibold">1.0</text>
                    <text x="152" y="105" textAnchor="end" className="fill-[#7c9092] text-[7px] font-medium">normalized time</text>
                   </svg>
                   </div>
                 </div>
                </div>
              </div>
               </section>
          </section>

          <div className="flex flex-col gap-3 rounded-2xl border border-[#dce9e4] bg-white/85 p-3 shadow-sm sm:flex-row">
            <button
              type="submit"
              disabled={loading}
              className="food-action h-12 flex-1 rounded-full px-6 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? '生成中，正在跳转...' : '生成味觉音乐'}
            </button>

            {recentTaskId && (
              <button
                type="button"
                onClick={() => router.push(`/generate/result/${recentTaskId}?from=generate`)}
                className="food-nav-action h-12 rounded-full px-6 text-sm font-semibold transition-colors hover:bg-[#f5f9f6]"
              >
                返回上次结果
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
              {isMissingApiKeyError && (
                <p className="mt-2 text-xs">
                  当前服务没有读取到 Suno API Key。请确认项目根目录存在 .env.local，并在重启开发服务后重新打开页面。
                </p>
              )}
            </div>
          )}
        </form>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <section className="overflow-hidden rounded-[1.5rem] border border-[#dce9e4] bg-white shadow-[0_18px_45px_rgba(59,91,105,.1)]">
            <div className="relative overflow-hidden bg-[#365a78] p-5 text-white">
              <div aria-hidden="true" className="absolute -right-5 -top-6 text-8xl opacity-20">🍽️</div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{activePrompt.title}</h2>
                  <p className="mt-2 text-sm text-teal-50/80">
                    结构化选择会实时转译为音乐生成语言。
                  </p>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
                  <div className="h-7 w-7 rounded-full border-4 border-teal-200 border-t-white" />
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-white/10 p-3">
                <svg viewBox="0 0 160 96" className="h-20 w-full" role="img" aria-label="Current intensity curve">
                  <polyline
                    points={buildAnchorPath(formData.researchAnchors)}
                    fill="none"
                    stroke="#99f6e4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl bg-[#f2f7f5] p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{activePrompt.summary}</p>
              </div>

              {activePrompt.negativeTags && (
                <div className="rounded-2xl bg-[#f2f7f5] p-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Negative Tags</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{activePrompt.negativeTags}</p>
                </div>
              )}

              {canViewSunoPrompt && (
              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-500">最终发送给 Suno 的 prompt</span>
                <textarea
                  value={activePrompt.prompt}
                  readOnly
                  rows={12}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs leading-5 text-slate-700 outline-none"
                />
              </label>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
