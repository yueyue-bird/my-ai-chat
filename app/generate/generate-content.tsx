// app/generate/generate-content.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  affectiveOptions,
  anchorStageOptions,
  buildResearchMusicPrompt,
  tasteOptions,
  type AffectiveKey,
  type AnchorStageKey,
  type TasteKey,
  type TasteTrajectoryAnchor,
} from '@/lib/musicPrompt';

const MODEL = 'V4_5PLUS';

const makeId = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

  const nextId = makeId('visitor');
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

type AnchorFieldValues = Pick<TasteTrajectoryAnchor, 'taste' | 'intensity' | 'affective' | 'mouthfeel'>;
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

// 图表绘图区常量（SVG viewBox 坐标）
const CHART_LEFT = 8;
const CHART_RIGHT = 152;
const CHART_WIDTH = CHART_RIGHT - CHART_LEFT;
const CHART_BOTTOM = 84;
const INTENSITY_SCALE = 0.72; // (CHART_BOTTOM - CHART_TOP) / 100

const clampPosition = (position: number) => Math.max(0, Math.min(1, position));
const clampIntensity = (intensity: number) => Math.max(0, Math.min(100, intensity));

const getAnchorX = (position: number) => CHART_LEFT + clampPosition(position) * CHART_WIDTH;
const getAnchorY = (intensity: number) => CHART_BOTTOM - clampIntensity(intensity) * INTENSITY_SCALE;

// 图表坐标 → 数据（拖拽 / 键盘用）
const xToPosition = (x: number) => clampPosition((x - CHART_LEFT) / CHART_WIDTH);
const yToIntensity = (y: number) => clampIntensity(Math.round((CHART_BOTTOM - y) / INTENSITY_SCALE));

// 按归一化时间推导阶段，保证拖拽后 stage 与 position 语义一致
const deriveStage = (position: number): AnchorStageKey => {
  if (position <= 0.33) return 'onset';
  if (position < 0.67) return 'development';
  return 'aftertaste';
};

const tasteColorMap: Record<TasteKey, string> = {
  sweet: '#df7b69',
  sour: '#8aa94f',
  bitter: '#806b5b',
  salty: '#4e8faa',
};

const buildAnchorPath = (anchors: TasteTrajectoryAnchor[]) =>
  [...anchors]
    .sort((a, b) => a.position - b.position)
    .map((anchor) => `${getAnchorX(anchor.position)},${getAnchorY(anchor.intensity)}`)
    .join(' ');

const buildFullTrajectoryPath = (anchors: TasteTrajectoryAnchor[]) => {
  const sortedAnchors = [...anchors].sort((a, b) => a.position - b.position);
  const first = sortedAnchors[0];
  const last = sortedAnchors[sortedAnchors.length - 1];
  if (!first || !last) return '';

  const points = sortedAnchors.map((anchor) => `${getAnchorX(anchor.position)},${getAnchorY(anchor.intensity)}`);
  if (getAnchorX(first.position) > CHART_LEFT) points.unshift(`${CHART_LEFT},${getAnchorY(first.intensity)}`);
  if (getAnchorX(last.position) < CHART_RIGHT) points.push(`${CHART_RIGHT},${getAnchorY(last.intensity)}`);
  return points.join(' ');
};

const getDominantTaste = (anchors: TasteTrajectoryAnchor[]) =>
  [...anchors].sort((a, b) => a.position - b.position)[0]?.taste || 'sweet';

// 共用锚点字段（新增 / 编辑复用）
function AnchorFields({
  values,
  onChange,
}: {
  values: AnchorFieldValues;
  onChange: (patch: Partial<AnchorFieldValues>) => void;
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-900">Taste</span>
          <select
            value={values.taste}
            onChange={(event) => onChange({ taste: event.target.value as TasteKey })}
            className="food-field"
          >
            {tasteOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-900">Intensity: {values.intensity}/100</span>
          <input
            type="range"
            min="0"
            max="100"
            value={values.intensity}
            onChange={(event) => onChange({ intensity: Number(event.target.value) })}
            className="h-11 w-full accent-[#3e7a68]"
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
              data-active={values.affective === option.value}
              onClick={() => onChange({ affective: option.value as AffectiveKey })}
              className="food-choice"
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
          value={values.mouthfeel ?? ''}
          onChange={(event) => onChange({ mouthfeel: event.target.value })}
          className="food-field"
          placeholder="e.g., fizzy, creamy, dry, melting..."
        />
      </label>
    </>
  );
}

// 统一的模态框外壳（食物主题头部）
function ModalShell({
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="food-modal-overlay" onClick={onClose}>
      <div className="food-modal" onClick={(event) => event.stopPropagation()}>
        <div className="food-modal-header">
          <div aria-hidden="true" className="pointer-events-none absolute -right-3 -top-4 text-7xl opacity-15">
            🍒
          </div>
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">{eyebrow}</p>
              <h2 className="mt-1 text-xl font-semibold">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-white/75">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/25"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">{children}</div>
      </div>
    </div>
  );
}

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
  const [anchors, setAnchors] = useState<TasteTrajectoryAnchor[]>(defaultAnchors);
  const [focusedAnchorId, setFocusedAnchorId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);

  const researchPrompt = buildResearchMusicPrompt({ anchors });
  const activePrompt = researchPrompt;
  const isMissingApiKeyError = error?.includes('SUNO_API_KEY');
  const selectedAnchor = selectedAnchorId ? anchors.find((anchor) => anchor.id === selectedAnchorId) : null;
  const selectedAnchorIndex = selectedAnchor ? anchors.findIndex((anchor) => anchor.id === selectedAnchor.id) : -1;
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

  const patchAnchor = (id: string, patch: Partial<TasteTrajectoryAnchor>) => {
    setAnchors((prev) => prev.map((anchor) => (anchor.id === id ? { ...anchor, ...patch } : anchor)));
  };

  const moveAnchor = (id: string, position: number, intensity: number) => {
    const nextPosition = clampPosition(position);
    patchAnchor(id, {
      position: nextPosition,
      intensity: clampIntensity(Math.round(intensity)),
      stage: deriveStage(nextPosition),
    });
  };

  const addAnchor = () => {
    const position = clampPosition(newAnchorDraft.position);
    const newAnchor: TasteTrajectoryAnchor = {
      id: makeId('anchor'),
      position,
      stage: deriveStage(position),
      taste: newAnchorDraft.taste,
      intensity: clampIntensity(newAnchorDraft.intensity),
      affective: newAnchorDraft.affective,
      mouthfeel: newAnchorDraft.mouthfeel,
    };

    setAnchors((prev) => [...prev, newAnchor].sort((a, b) => a.position - b.position));
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
    if (!selectedAnchor || anchors.length === 1) return;

    setAnchors((prev) => prev.filter((anchor) => anchor.id !== selectedAnchor.id));
    closeAnchorEditor();
  };

  // 屏幕坐标 → SVG viewBox 坐标
  const getSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  };

  const handleAnchorPointerDown = (event: React.PointerEvent<SVGGElement>, id: string) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, moved: false };
  };

  const handleAnchorPointerMove = (event: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
    drag.moved = true;

    const svgPoint = getSvgPoint(event.clientX, event.clientY);
    if (!svgPoint) return;
    moveAnchor(drag.id, xToPosition(svgPoint.x), yToIntensity(svgPoint.y));
  };

  const handleAnchorPointerUp = (event: React.PointerEvent<SVGGElement>, id: string) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // 未拖动 → 视为点击，打开精细编辑器
    if (drag && !drag.moved) {
      setSelectedAnchorId(id);
    }
  };

  const handleAnchorKeyDown = (event: React.KeyboardEvent<SVGGElement>, anchor: TasteTrajectoryAnchor) => {
    const intensityStep = event.shiftKey ? 10 : 2;
    const positionStep = event.shiftKey ? 0.1 : 0.02;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        setSelectedAnchorId(anchor.id);
        break;
      case 'ArrowUp':
        event.preventDefault();
        patchAnchor(anchor.id, { intensity: clampIntensity(anchor.intensity + intensityStep) });
        break;
      case 'ArrowDown':
        event.preventDefault();
        patchAnchor(anchor.id, { intensity: clampIntensity(anchor.intensity - intensityStep) });
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveAnchor(anchor.id, anchor.position + positionStep, anchor.intensity);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveAnchor(anchor.id, anchor.position - positionStep, anchor.intensity);
        break;
      default:
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const requestBody: any = {
        customMode: true,
        instrumental: true,
        model: MODEL,
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
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#5c7d76]">food sound studio</p>
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
        <ModalShell
          eyebrow="Anchor editor"
          title="添加锚点"
          subtitle="填写锚点信息后，点击确定添加。"
          onClose={() => setIsAddingAnchor(false)}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px]">
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
                onChange={(event) => setNewAnchorDraft({ ...newAnchorDraft, position: Number(event.target.value) })}
                className="h-11 w-full accent-[#3e7a68]"
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
                  setNewAnchorDraft({ ...newAnchorDraft, position: clampPosition(Number(event.target.value)) })
                }
                className="food-field"
              />
            </label>
          </div>

          <AnchorFields
            values={newAnchorDraft}
            onChange={(patch) => setNewAnchorDraft((prev) => ({ ...prev, ...patch }))}
          />

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setIsAddingAnchor(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={addAnchor}
              className="food-action rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            >
              确定添加
            </button>
          </div>
        </ModalShell>
      )}

      {selectedAnchor && selectedStageOption && (
        <ModalShell
          eyebrow="Anchor editor"
          title={`锚点 ${selectedAnchorIndex + 1} · ${selectedStageOption.label}`}
          subtitle={`time ${selectedAnchor.position.toFixed(2)} / ${selectedStageOption.role}`}
          onClose={closeAnchorEditor}
        >
          <AnchorFields
            values={selectedAnchor}
            onChange={(patch) => patchAnchor(selectedAnchor.id, patch)}
          />

          <div className="border-t border-slate-100 pt-4">
            {isConfirmingDelete ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">确认删除这个锚点？</p>
                <p className="mt-1 text-sm text-red-700">删除后无法恢复。</p>
                <div className="mt-3 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelectedAnchor}
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">提示：可直接在轨迹图上拖动锚点调整强度与时间。</p>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={anchors.length === 1}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  删除此锚点
                </button>
              </div>
            )}
          </div>
        </ModalShell>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className={`relative overflow-hidden ${panelClass} ${tasteToneMap[getDominantTaste(anchors)]}`}>
            <div className="relative z-10 sm:pr-32">
              <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-[#3e7a68]">Taste composer</p>
              <h2 className="text-xl font-bold tracking-tight text-[#233a4a]">味觉词汇生成</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                用酸甜、口感与时间曲线，把这次品尝转译成一段旋律。
              </p>
            </div>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 right-4 hidden items-end gap-1 text-4xl drop-shadow-sm sm:right-6 sm:flex"
            >
              <span className="-rotate-12">🍋</span>
              <span className="mb-2 rotate-6">🍓</span>
              <span className="-rotate-6">🍐</span>
            </div>
          </section>

          <section className={panelClass}>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-950">Taste trajectory anchors</h2>
              <button
                type="button"
                onClick={openAddAnchorForm}
                className="food-action rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              >
                添加锚点
              </button>
            </div>

            <section className="space-y-3">
              <div className="rounded-2xl border border-[#dde9e5] bg-[#f0f6f4] p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-[#e7f1ed] px-3 py-1 text-xs font-bold text-[#3e7a68]">风味轨迹图</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[#5c7470]">
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#df7b69]" />甜</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#8aa94f]" />酸</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#806b5b]" />苦</span>
                    <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#4e8faa]" />咸</span>
                  </div>
                </div>
                <p className="mb-3 text-sm text-slate-600">
                  拖动曲线上的锚点即可调整强度与时间；点击锚点可编辑味道、喜爱程度和口腔感受（也支持键盘方向键微调）。
                </p>
                <div className="rounded-xl bg-white/70 px-2 py-2 sm:px-3 sm:py-3">
                  <svg
                    ref={svgRef}
                    viewBox="-20 0 184 110"
                    className="trajectory-svg h-52 w-full sm:h-60 lg:h-64"
                    role="img"
                    aria-label="Taste intensity trajectory chart"
                  >
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
                      <line
                        key={y}
                        x1="8"
                        y1={y}
                        x2="152"
                        y2={y}
                        stroke="#dce9e5"
                        strokeDasharray={y === 84 ? '0' : '2 3'}
                        strokeWidth={y === 84 ? '1.25' : '1'}
                      />
                    ))}
                    {[8, 44, 80, 116, 152].map((x) => (
                      <line key={x} x1={x} y1="12" x2={x} y2="84" stroke="#edf4f1" strokeWidth="1" />
                    ))}
                    {[{ value: 100, y: 15 }, { value: 50, y: 51 }, { value: 0, y: 87 }].map(({ value, y }) => (
                      <text key={value} x="5.5" y={y} textAnchor="end" className="fill-[#5c7470] text-[8px] font-semibold">
                        {value}
                      </text>
                    ))}
                    <text
                      x="-13"
                      y="48"
                      textAnchor="middle"
                      transform="rotate(-90 -13 48)"
                      className="fill-[#5c7470] text-[8px] font-semibold tracking-[.08em]"
                    >
                      intensity
                    </text>
                    <polygon
                      points={`8,84 ${buildFullTrajectoryPath(anchors)} 152,84`}
                      fill="url(#trajectory-fill)"
                    />
                    {anchors.map((anchor) => (
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
                      points={buildFullTrajectoryPath(anchors)}
                      fill="none"
                      stroke="url(#trajectory-line)"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="4"
                      filter="url(#trajectory-shadow)"
                    />
                    {anchors.map((anchor) => {
                      const cx = getAnchorX(anchor.position);
                      const cy = getAnchorY(anchor.intensity);
                      const isFocused = focusedAnchorId === anchor.id;
                      return (
                        <g
                          key={anchor.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`编辑 ${anchor.stage} 锚点，强度 ${anchor.intensity}/100，时间 ${anchor.position.toFixed(2)}`}
                          className="anchor-node"
                          onPointerDown={(event) => handleAnchorPointerDown(event, anchor.id)}
                          onPointerMove={handleAnchorPointerMove}
                          onPointerUp={(event) => handleAnchorPointerUp(event, anchor.id)}
                          onKeyDown={(event) => handleAnchorKeyDown(event, anchor)}
                          onFocus={() => setFocusedAnchorId(anchor.id)}
                          onBlur={() => setFocusedAnchorId((current) => (current === anchor.id ? null : current))}
                        >
                          <title>{`${anchor.stage}: ${anchor.intensity}/100`}</title>
                          <circle cx={cx} cy={cy} r="13" fill="transparent" />
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isFocused ? 6.2 : 5}
                            fill={tasteColorMap[anchor.taste]}
                            filter="url(#trajectory-shadow)"
                            style={{ transition: 'r 120ms ease' }}
                          />
                        </g>
                      );
                    })}
                    <text x="80" y="93" textAnchor="middle" className="fill-[#5c7470] text-[8px] font-semibold">
                      0.5
                    </text>
                    <text x="152" y="93" textAnchor="middle" className="fill-[#5c7470] text-[8px] font-semibold">
                      1.0
                    </text>
                    <text x="80" y="104" textAnchor="middle" className="fill-[#5c7470] text-[8px] font-semibold">
                      time
                    </text>
                  </svg>
                </div>
              </div>
            </section>
          </section>

          <div className="flex flex-col gap-3 rounded-2xl border border-[#dce9e4] bg-white/85 p-3 shadow-sm sm:flex-row">
            <button
              type="submit"
              disabled={loading}
              className="food-action h-12 flex-1 rounded-full px-6 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="food-hero-gradient relative overflow-hidden p-5 text-white">
              <div aria-hidden="true" className="absolute -right-5 -top-6 text-8xl opacity-20">🍽️</div>
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{activePrompt.title}</h2>
                  <p className="mt-2 text-sm text-white/80">结构化选择会实时转译为音乐生成语言。</p>
                </div>
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10">
                  <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-white/40">
                    <span className="h-2 w-2 rounded-full bg-white/85" />
                  </div>
                </div>
              </div>
              <div className="relative mt-5 rounded-2xl bg-white/10 p-3">
                <svg viewBox="0 0 160 96" className="h-20 w-full" role="img" aria-label="Current intensity curve">
                  <polyline
                    points={buildAnchorPath(anchors)}
                    fill="none"
                    stroke="#a7f3d0"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-2xl bg-[#f2f7f5] p-4">
                <p className="text-xs font-semibold uppercase text-slate-600">Summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{activePrompt.summary}</p>
              </div>

              {activePrompt.negativeTags && (
                <div className="rounded-2xl bg-[#f2f7f5] p-4">
                  <p className="text-xs font-semibold uppercase text-slate-600">Negative Tags</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{activePrompt.negativeTags}</p>
                </div>
              )}

              {canViewSunoPrompt && (
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase text-slate-600">最终发送给 Suno 的 prompt</span>
                  <textarea
                    value={activePrompt.prompt}
                    readOnly
                    rows={12}
                    className="food-field font-mono text-xs leading-5 text-slate-700"
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
