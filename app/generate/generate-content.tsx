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

const panelClass = 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm';

const tasteToneMap: Record<TasteKey, string> = {
  sweet: 'bg-rose-50',
  sour: 'bg-lime-50',
  bitter: 'bg-stone-100',
  salty: 'bg-sky-50',
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

const buildAnchorPath = (anchors: TasteTrajectoryAnchor[]) => {
  const points = anchors.map((anchor) => {
    const x = getAnchorX(anchor.position);
    const y = 84 - Math.max(0, Math.min(100, anchor.intensity)) * 0.72;
    return `${x},${y}`;
  });
  return points.join(' ');
};

const getDominantTaste = (anchors: TasteTrajectoryAnchor[]) => anchors[0]?.taste || 'sweet';

export default function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastTaskId = searchParams.get('taskId');

  const [showAdvanced, setShowAdvanced] = useState(false);
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
    <main className="min-h-screen bg-[#f6f4ef] text-slate-950">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950 md:text-3xl">Taste to Music Lab</h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push('/generate/history')}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-slate-300"
            >
              历史记录
            </button>
            <button
              type="button"
              onClick={() => router.push('/generate/favorites?from=generate')}
              className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-800"
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

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className={`${panelClass} ${tasteToneMap[getDominantTaste(formData.researchAnchors)]}`}>
            <h2 className="text-xl font-semibold text-slate-950">味觉词汇生成</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
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
                  className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-800"
                >
                  添加锚点
                </button>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Trajectory: normalized time curve</h3>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-sm text-slate-500">请点击曲线中的锚点，编辑该时间点的味道、强度、喜爱程度和口腔感受。</p>
                  <div className="rounded-lg bg-slate-50 px-3 py-4">
                  <svg viewBox="-8 0 180 104" className="h-48 w-full sm:h-56 lg:h-60" role="img" aria-label="Three anchor taste intensity curve">
                    <line x1="8" y1="84" x2="152" y2="84" stroke="#cbd5e1" strokeWidth="1.5" />
                    <line x1="8" y1="12" x2="8" y2="84" stroke="#cbd5e1" strokeWidth="1.5" />
                    <polyline
                      points={buildAnchorPath(formData.researchAnchors)}
                      fill="none"
                      stroke="#0f766e"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="4"
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
                        <circle
                          cx={getAnchorX(anchor.position)}
                          cy={84 - Math.max(0, Math.min(100, anchor.intensity)) * 0.72}
                          r="7"
                          className="fill-teal-100 stroke-teal-700 transition-colors hover:fill-teal-200"
                          strokeWidth="2.5"
                        />
                        <circle
                          cx={getAnchorX(anchor.position)}
                          cy={84 - Math.max(0, Math.min(100, anchor.intensity)) * 0.72}
                          r="3"
                          className="fill-teal-700"
                        />
                      </g>
                    ))}
                    <text x="8" y="94" textAnchor="middle" className="fill-slate-500 text-[8px]">
                      0.0
                    </text>
                    <text x="80" y="94" textAnchor="middle" className="fill-slate-500 text-[8px]">
                      0.5
                    </text>
                    <text x="152" y="94" textAnchor="middle" className="fill-slate-500 text-[8px]">
                      1.0
                    </text>
                    <text x="-4" y="94" textAnchor="end" className="fill-slate-500 text-[8px]">
                      time
                    </text>
                    <text x="2" y="10" className="fill-slate-500 text-[8px]">
                      intensity
                    </text>
                  </svg>
                  </div>
                </div>
              </section>
          </section>

          <section className={panelClass}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between text-sm font-semibold text-slate-800"
            >
              <span>模型选项</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{showAdvanced ? '收起' : '展开'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">模型版本</span>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-colors focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                  >
                    <option value="V4_5PLUS">V4.5 Plus (推荐)</option>
                    <option value="V4_5ALL">V4.5 All</option>
                    <option value="V4">V4</option>
                    <option value="V3_5">V3.5</option>
                  </select>
                </label>

              </div>
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
            <button
              type="submit"
              disabled={loading}
              className="h-12 flex-1 rounded-full bg-teal-700 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? '生成中，正在跳转...' : '生成味觉音乐'}
            </button>

            {recentTaskId && (
              <button
                type="button"
                onClick={() => router.push(`/generate/result/${recentTaskId}?from=generate`)}
                className="h-12 rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
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
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="bg-teal-800 p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{activePrompt.title}</h2>
                  <p className="mt-2 text-sm text-teal-50/80">
                    结构化选择会实时转译为音乐生成语言。
                  </p>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-lg bg-white/10">
                  <div className="h-7 w-7 rounded-full border-4 border-teal-200 border-t-white" />
                </div>
              </div>
              <div className="mt-5 rounded-lg bg-white/10 p-3">
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
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{activePrompt.summary}</p>
              </div>

              {activePrompt.negativeTags && (
                <div className="rounded-lg bg-slate-50 p-4">
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
