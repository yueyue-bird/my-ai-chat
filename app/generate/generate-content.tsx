// app/generate/GenerateContent.tsx
'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  affectiveOptions,
  buildCustomMusicPrompt,
  buildResearchMusicPrompt,
  tasteOptions,
  textureOptions,
  trajectoryOptions,
  type AffectiveKey,
  type TasteKey,
  type TextureKey,
  type TrajectoryKey,
} from '@/lib/musicPrompt';

type GenerateMode = 'research' | 'custom';
type CustomModeType = 'lyrics' | 'instrumental';

const chipBaseClass =
  'rounded-full border px-3 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-teal-200';

const panelClass = 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm';

const tasteToneMap: Record<TasteKey, string> = {
  sweet: 'bg-rose-50',
  sour: 'bg-lime-50',
  bitter: 'bg-stone-100',
  salty: 'bg-sky-50',
};

const curvePathMap: Record<TrajectoryKey, string> = {
  burst: 'M8 70 C16 22, 28 12, 44 20 C72 34, 96 62, 152 70',
  bloom: 'M8 76 C36 72, 58 60, 80 48 C104 34, 128 22, 152 18',
  constant: 'M8 52 C32 52, 56 52, 80 52 C104 52, 128 52, 152 52',
  residue: 'M8 28 C34 24, 58 30, 80 44 C104 58, 126 68, 152 74',
};

export default function GenerateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastTaskId = searchParams.get('taskId');

  const [mode, setMode] = useState<GenerateMode>('research');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentTaskId, setRecentTaskId] = useState<string | null>(lastTaskId);
  const [formData, setFormData] = useState({
    customPrompt: '',
    customTags: 'ambient, sensory, clear texture',
    customModeType: 'instrumental' as CustomModeType,
    researchTaste: 'sweet' as TasteKey,
    researchAffective: 'liked' as AffectiveKey,
    researchTextures: ['soft', 'smooth'] as TextureKey[],
    researchTextureNote: '',
    researchTrajectory: 'constant' as TrajectoryKey,
    researchExtraStyle: 'ambient, minimal, clear instrumental texture',
    model: 'V4_5ALL',
    vocalGender: '',
  });

  const researchPrompt = buildResearchMusicPrompt({
    taste: formData.researchTaste,
    affective: formData.researchAffective,
    textures: formData.researchTextures,
    textureNote: formData.researchTextureNote,
    trajectory: formData.researchTrajectory,
    extraStyle: formData.researchExtraStyle,
  });
  const customPrompt = buildCustomMusicPrompt({
    userPrompt: formData.customPrompt,
    tags: formData.customTags,
    isInstrumental: formData.customModeType === 'instrumental',
  });
  const activePrompt = mode === 'research' ? researchPrompt : customPrompt;
  const isMissingApiKeyError = error?.includes('SUNO_API_KEY');

  useEffect(() => {
    if (lastTaskId) {
      setRecentTaskId(lastTaskId);
    }
  }, [lastTaskId]);

  const toggleListValue = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const renderChipGroup = <T extends string>(
    title: string,
    options: Array<{ value: T; label: string }>,
    selectedValues: T[],
    onToggle: (value: T) => void
  ) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-500">{selectedValues.length} selected</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              className={`${chipBaseClass} ${
                selected
                  ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const isCustom = mode === 'custom';
      const isInstrumental = !isCustom || formData.customModeType === 'instrumental';
      const requestBody: any = {
        mv: 'sonic-v4',
        model: formData.model,
        tags: activePrompt.tags,
        title: activePrompt.title,
        make_instrumental: isInstrumental,
        custom_mode: true,
        prompt: activePrompt.prompt,
      };

      if (formData.vocalGender && isCustom && !isInstrumental) {
        requestBody.vocalGender = formData.vocalGender;
      }

      const res = await fetch('/api/chat/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || '生成失败');
      }

      const taskId = data.task_id;
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
            <p className="mt-1 text-sm text-slate-500">统一词汇体系下的轻量味觉音乐 prompt 生成器</p>
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

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={handleSubmit} className="space-y-5">
          <section className={`${panelClass} ${mode === 'research' ? tasteToneMap[formData.researchTaste] : 'bg-teal-50'}`}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">选择生成入口</h2>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode('research')}
                className={`flex min-h-[116px] flex-col justify-start rounded-lg border p-4 text-left transition-all ${
                  mode === 'research'
                    ? 'border-teal-600 bg-white text-teal-950 shadow-sm'
                    : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
                }`}
              >
                <span className="block text-lg font-semibold">味觉词汇生成</span>
                <span className="mt-2 block text-sm leading-6 text-slate-500">Taste, affective response, mouthfeel texture, time curve.</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('custom')}
                className={`flex min-h-[116px] flex-col justify-start rounded-lg border p-4 text-left transition-all ${
                  mode === 'custom'
                    ? 'border-teal-600 bg-white text-teal-950 shadow-sm'
                    : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
                }`}
              >
                <span className="block text-lg font-semibold">自定义描述生成</span>
                <span className="mt-2 block text-sm leading-6 text-slate-500">把文字 prompt 转成可生成的音乐指令。</span>
              </button>
            </div>
          </section>

          {mode === 'research' ? (
            <section className={panelClass}>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">轻量研究参数</h2>
                </div>
                <div className="flex overflow-hidden rounded-full border border-slate-200 bg-slate-50 p-1">
                  {tasteOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, researchTaste: option.value })}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        formData.researchTaste === option.value
                          ? 'bg-teal-700 text-white'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Taste main track</span>
                  <select
                    value={formData.researchTaste}
                    onChange={(e) => setFormData({ ...formData, researchTaste: e.target.value as TasteKey })}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-colors focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                  >
                    {tasteOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Affective track</h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {affectiveOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, researchAffective: option.value })}
                        className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                          formData.researchAffective === option.value
                            ? 'border-teal-600 bg-teal-50 text-teal-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="block font-semibold">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {renderChipGroup('Embodied track: mouthfeel texture', textureOptions, formData.researchTextures, (value) =>
                  setFormData({
                    ...formData,
                    researchTextures: toggleListValue(formData.researchTextures, value),
                  })
                )}

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Texture note</span>
                  <textarea
                    rows={3}
                    value={formData.researchTextureNote}
                    onChange={(e) => setFormData({ ...formData, researchTextureNote: e.target.value })}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    placeholder="例如：入口像湿润的海盐泡沫，后段变得粗糙、干燥。"
                  />
                </label>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Trajectory: normalized time curve</h3>
                  <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <svg viewBox="0 0 160 96" className="h-32 w-full" role="img" aria-label="Normalized intensity curve">
                        <line x1="8" y1="84" x2="152" y2="84" stroke="#cbd5e1" strokeWidth="1.5" />
                        <line x1="8" y1="12" x2="8" y2="84" stroke="#cbd5e1" strokeWidth="1.5" />
                        <path
                          d={curvePathMap[formData.researchTrajectory]}
                          fill="none"
                          stroke="#0f766e"
                          strokeLinecap="round"
                          strokeWidth="4"
                        />
                        <text x="78" y="94" textAnchor="middle" className="fill-slate-500 text-[8px]">
                          time
                        </text>
                        <text x="2" y="10" className="fill-slate-500 text-[8px]">
                          intensity
                        </text>
                      </svg>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {trajectoryOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, researchTrajectory: option.value })}
                          className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                            formData.researchTrajectory === option.value
                              ? 'border-teal-600 bg-teal-50 text-teal-950'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="block font-semibold">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-900">风格标签</span>
                  <input
                    type="text"
                    value={formData.researchExtraStyle}
                    onChange={(e) => setFormData({ ...formData, researchExtraStyle: e.target.value })}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-colors focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    placeholder="ambient, piano, electronic, no vocals"
                  />
                </label>
              </div>
            </section>
          ) : (
            <section className={panelClass}>
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-slate-950">自定义 prompt 编译</h2>
              </div>
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, customModeType: 'instrumental' })}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      formData.customModeType === 'instrumental'
                        ? 'border-teal-600 bg-teal-50 text-teal-950'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span className="block font-semibold">纯音乐</span>
                    <span className="mt-1 block text-sm text-slate-500">把文字描述转成器乐 prompt。</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, customModeType: 'lyrics' })}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      formData.customModeType === 'lyrics'
                        ? 'border-teal-600 bg-teal-50 text-teal-950'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <span className="block font-semibold">带歌词</span>
                    <span className="mt-1 block text-sm text-slate-500">把歌词或主题转成歌曲 prompt。</span>
                  </button>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {formData.customModeType === 'lyrics' ? '歌词或歌曲主题 prompt' : '音乐描述 prompt'}
                  </span>
                  <textarea
                    rows={8}
                    value={formData.customPrompt}
                    onChange={(e) => setFormData({ ...formData, customPrompt: e.target.value })}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition-colors focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    placeholder={
                      formData.customModeType === 'lyrics'
                        ? '[Verse]\nSip the feeling slowly\nLet the flavor turn to sound\n\n[Chorus]\nEvery color in my cup\nIs a memory spinning round'
                        : '例如：一段像柠檬气泡水一样明亮、跳跃、带有闪烁合成器和短促钢琴音的纯音乐。'
                    }
                    required
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">风格标签</span>
                  <input
                    type="text"
                    value={formData.customTags}
                    onChange={(e) => setFormData({ ...formData, customTags: e.target.value })}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-colors focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    placeholder="ambient, electronic, playful, piano"
                  />
                </label>
              </div>
            </section>
          )}

          <section className={panelClass}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between text-sm font-semibold text-slate-800"
            >
              <span>高级选项</span>
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
                    <option value="V4_5ALL">V4.5 (推荐)</option>
                    <option value="V4">V4</option>
                    <option value="V3_5">V3.5</option>
                  </select>
                </label>

                {mode === 'custom' && formData.customModeType === 'lyrics' && (
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-900">人声性别</span>
                    <select
                      value={formData.vocalGender}
                      onChange={(e) => setFormData({ ...formData, vocalGender: e.target.value })}
                      className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition-colors focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100"
                    >
                      <option value="">自动</option>
                      <option value="m">男声</option>
                      <option value="f">女声</option>
                    </select>
                  </label>
                )}
              </div>
            )}
          </section>

          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
            <button
              type="submit"
              disabled={loading || (mode === 'custom' && !formData.customPrompt.trim())}
              className="h-12 flex-1 rounded-full bg-teal-700 px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? '生成中，正在跳转...' : mode === 'research' ? '生成味觉音乐' : '根据自定义 prompt 生成'}
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
                    {mode === 'research' ? '结构化选择会实时转译为音乐生成语言。' : '你的文字会被整理成可用的音乐描述。'}
                  </p>
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-lg bg-white/10">
                  <div className="h-7 w-7 rounded-full border-4 border-teal-200 border-t-white" />
                </div>
              </div>
              <div className="mt-5 rounded-lg bg-white/10 p-3">
                <svg viewBox="0 0 160 72" className="h-20 w-full" role="img" aria-label="Current intensity curve">
                  <path d={curvePathMap[formData.researchTrajectory]} fill="none" stroke="#99f6e4" strokeLinecap="round" strokeWidth="4" />
                </svg>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{activePrompt.summary}</p>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Tags</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{activePrompt.tags}</p>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-500">最终发送给 Suno 的 prompt</span>
                <textarea
                  value={activePrompt.prompt}
                  readOnly
                  rows={12}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs leading-5 text-slate-700 outline-none"
                />
              </label>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
