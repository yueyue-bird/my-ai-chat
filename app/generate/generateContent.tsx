// app/generate/page.tsx
'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function GeneratePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastTaskId = searchParams.get('taskId');
  
  // 选项配置
  const rhythmOptions = [
    { value: 'slow', label: '🐢 慢速', tags: 'slow, relaxing, calm' },
    { value: 'medium', label: '⚡ 中速', tags: 'medium tempo, moderate' },
    { value: 'fast', label: '🔥 快速', tags: 'fast, energetic, upbeat' },
    { value: 'variable', label: '🎭 多变节奏', tags: 'variable tempo, dynamic' },
  ];

  const styleOptions = [
    { value: 'ambient', label: '🌊 氛围音乐', tags: 'ambient, atmospheric' },
    { value: 'classical', label: '🎻 古典', tags: 'classical, orchestral' },
    { value: 'electronic', label: '⚡ 电子', tags: 'electronic, synth' },
    { value: 'jazz', label: '🎷 爵士', tags: 'jazz, smooth' },
    { value: 'pop', label: '🎤 流行', tags: 'pop, catchy' },
    { value: 'rock', label: '🎸 摇滚', tags: 'rock, guitar' },
    { value: 'cinematic', label: '🎬 电影配乐', tags: 'cinematic, epic' },
    { value: 'lofi', label: '📼 Lo-Fi', tags: 'lofi, chill' },
  ];

  const instrumentOptions = [
    { value: 'piano', label: '🎹 钢琴', tags: 'piano' },
    { value: 'guitar', label: '🎸 吉他', tags: 'guitar' },
    { value: 'strings', label: '🎻 弦乐', tags: 'strings, violin' },
    { value: 'synth', label: '🎛️ 合成器', tags: 'synth, synthesizer' },
    { value: 'drums', label: '🥁 鼓点', tags: 'drums, percussion' },
    { value: 'flute', label: '🎵 长笛', tags: 'flute' },
    { value: 'voice', label: '🎤 人声', tags: 'vocal, voice' },
    { value: 'mixed', label: '🎼 混合乐器', tags: 'full band, ensemble' },
  ];

  const [formData, setFormData] = useState({
    // 纯音乐模式字段
    selectedRhythms: ['medium'],
    selectedStyles: ['ambient'],
    selectedInstruments: ['piano'],
    // 自定义模式字段
    customPrompt: '',
    customTags: 'pop, rock',
    customModeType: 'lyrics',  // 'lyrics' 或 'instrumental'
    // 通用高级选项
    model: 'V4_5ALL',
    vocalGender: '',
  });
  
  // UI 状态
  const [mode, setMode] = useState<'instrumental' | 'custom'>('instrumental');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentTaskId, setRecentTaskId] = useState<string | null>(lastTaskId);

  useEffect(() => {
    if (lastTaskId) {
      setRecentTaskId(lastTaskId);
    }
  }, [lastTaskId]);

  // 生成标签字符串（仅纯音乐模式使用）
  const generateTags = (rhythms: string[], styles: string[], instruments: string[]) => {
    const rhythmTags = rhythms.map(r => rhythmOptions.find(opt => opt.value === r)?.tags || '').join(', ');
    const styleTags = styles.map(s => styleOptions.find(opt => opt.value === s)?.tags || '').join(', ');
    const instrumentTags = instruments.map(i => instrumentOptions.find(opt => opt.value === i)?.tags || '').join(', ');
    
    const allTags = [rhythmTags, styleTags, instrumentTags].filter(t => t).join(', ');
    return allTags;
  };

  // 获取选中项的标签文本（用于预览）
  const getSelectedLabels = (selectedValues: string[], options: typeof rhythmOptions) => {
    return selectedValues.map(v => options.find(opt => opt.value === v)?.label || '').join('、');
  };

  // 处理多选切换
  const toggleSelection = (value: string, selectedArray: string[], setSelected: (newArray: string[]) => void) => {
    if (selectedArray.includes(value)) {
      setSelected(selectedArray.filter(v => v !== value));
    } else {
      setSelected([...selectedArray, value]);
    }
  };

  const handleModeChange = (newMode: 'instrumental' | 'custom') => {
    setMode(newMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let requestBody: any = {
        mv: 'sonic-v4',
        model: formData.model,
      };
      
      if (formData.vocalGender) {
        requestBody.vocalGender = formData.vocalGender;
      }

      if (mode === 'instrumental') {
        // 纯音乐模式 - 使用三个选项生成标签
        const tags = generateTags(
          formData.selectedRhythms,
          formData.selectedStyles,
          formData.selectedInstruments
        );
        
        requestBody = {
          ...requestBody,
          tags: tags,
          make_instrumental: true,
          custom_mode: false,
          prompt: `Create a beautiful ${tags} instrumental piece`,
        };
      } else {
        // 自定义模式
        const isInstrumental = formData.customModeType === 'instrumental';
        
        requestBody = {
          ...requestBody,
          tags: formData.customTags,
          make_instrumental: isInstrumental,
          custom_mode: !isInstrumental,
          prompt: formData.customPrompt,
        };
      }

      console.log('请求参数:', requestBody);

      const res = await fetch('/api/chat/suno/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || data.details || '生成失败');
      }
      
      const taskId = data.task_id;
      setRecentTaskId(taskId);
      
      router.push(`/generate/result/${taskId}?from=generate`);
      
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleGoToLastResult = () => {
    if (recentTaskId) {
      router.push(`/generate/result/${recentTaskId}?from=generate`);
    }
  };

  // 渲染多选选项组
  const renderMultiSelectGroup = (
    title: string,
    options: { value: string; label: string; tags: string }[],
    selectedValues: string[],
    onToggle: (value: string) => void
  ) => (
    <div>
      <label className="block text-sm font-medium mb-2">{title}（可多选）</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={`px-3 py-1.5 rounded-full text-sm transition-all ${
              selectedValues.includes(option.value)
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option.label}
            {selectedValues.includes(option.value) && (
              <span className="ml-1 text-xs">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        
        {/* 收藏夹和历史记录按钮 */}
        <div className="flex justify-between items-center mb-4">
           <div className="flex gap-2">
    <button
      type="button"
      onClick={() => router.push('/generate/history')}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
    >
      <span>📜</span> 历史记录
    </button>
  </div>
          <button
            type="button"
            onClick={() => router.push('/generate/favorites?from=generate')}
            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors"
          >
            <span>⭐</span> 我的收藏夹
          </button>
        </div>

        <h1 className="text-3xl font-bold text-center mb-8">
          🎵 AI 音乐生成器
        </h1>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* ========== 模式选择 ========== */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <label className="block text-sm font-medium mb-2">选择生成模式</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={mode === 'instrumental'}
                    onChange={() => handleModeChange('instrumental')}
                    className="mr-2"
                  />
                  <span>🎵 纯音乐模式</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={mode === 'custom'}
                    onChange={() => handleModeChange('custom')}
                    className="mr-2"
                  />
                  <span>✏️ 自定义模式</span>
                </label>
              </div>
            </div>

            {/* ========== 纯音乐模式选项 ========== */}
            {mode === 'instrumental' && (
              <>
                {renderMultiSelectGroup(
                  '🎚️ 节奏选项',
                  rhythmOptions,
                  formData.selectedRhythms,
                  (value) => {
                    const newSelected = formData.selectedRhythms.includes(value)
                      ? formData.selectedRhythms.filter(v => v !== value)
                      : [...formData.selectedRhythms, value];
                    setFormData({ ...formData, selectedRhythms: newSelected });
                  }
                )}

                {renderMultiSelectGroup(
                  '🎵 音乐风格选项',
                  styleOptions,
                  formData.selectedStyles,
                  (value) => {
                    const newSelected = formData.selectedStyles.includes(value)
                      ? formData.selectedStyles.filter(v => v !== value)
                      : [...formData.selectedStyles, value];
                    setFormData({ ...formData, selectedStyles: newSelected });
                  }
                )}

                {renderMultiSelectGroup(
                  '🎸 乐器选项',
                  instrumentOptions,
                  formData.selectedInstruments,
                  (value) => {
                    const newSelected = formData.selectedInstruments.includes(value)
                      ? formData.selectedInstruments.filter(v => v !== value)
                      : [...formData.selectedInstruments, value];
                    setFormData({ ...formData, selectedInstruments: newSelected });
                  }
                )}
              </>
            )}

            {/* ========== 自定义模式选项 ========== */}
            {mode === 'custom' && (
              <>
                {/* 纯音乐/带歌词 切换 */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium mb-2">生成类型</label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={formData.customModeType === 'lyrics'}
                        onChange={() => setFormData({ ...formData, customModeType: 'lyrics' })}
                        className="mr-2"
                      />
                      <span>🎤 带歌词</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={formData.customModeType === 'instrumental'}
                        onChange={() => setFormData({ ...formData, customModeType: 'instrumental' })}
                        className="mr-2"
                      />
                      <span>🎵 纯音乐</span>
                    </label>
                  </div>
                </div>

                {/* 歌词/描述输入框 */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {formData.customModeType === 'lyrics' ? '歌词' : '音乐描述'} 
                    <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={6}
                    value={formData.customPrompt}
                    onChange={(e) => setFormData({ ...formData, customPrompt: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                    placeholder={
                      formData.customModeType === 'lyrics' 
                        ? `[Verse]\nStars are shining in the night\nMusic takes me to the sky\n\n[Chorus]\nFeel the rhythm, feel the beat\nLet the music set you free`
                        : `描述你想要的音乐氛围和风格...\n\n例如：\n"A peaceful piano piece with strings, suitable for studying"\n"Energetic electronic dance music with a driving beat"`
                    }
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {formData.customModeType === 'lyrics' 
                      ? '输入歌词内容，可以包含段落结构' 
                      : '描述你想要的音乐氛围、情绪、风格等'}
                  </p>
                </div>

                {/* 风格标签输入框 */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    风格标签 <span className="text-gray-400 text-xs">(可选，用逗号分隔)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.customTags}
                    onChange={(e) => setFormData({ ...formData, customTags: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="pop, rock, electronic, ballad, sad, energetic"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    示例: pop, rock, electronic, classical, jazz, sad, energetic, relaxing
                  </p>
                </div>
              </>
            )}

            {/* ========== 高级选项（可折叠） ========== */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                {showAdvanced ? '▼' : '▶'} 高级选项
              </button>
            </div>

            {showAdvanced && (
              <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                {/* 模型版本 */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    模型版本
                  </label>
                  <select
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-white"
                     title="选择模型版本"
                  >
                    <option value="V4_5ALL">V4.5 (推荐)</option>
                    <option value="V4">V4</option>
                    <option value="V3_5">V3.5</option>
                  </select>
                </div>

                {/* 人声性别（仅在自定义模式且带歌词时显示） */}
                {mode === 'custom' && formData.customModeType === 'lyrics' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">人声性别</label>
                    <div className="flex space-x-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="vocalGender"
                          checked={formData.vocalGender === ''}
                          onChange={() => setFormData({ ...formData, vocalGender: '' })}
                          className="mr-2"
                        />
                        自动
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="vocalGender"
                          checked={formData.vocalGender === 'm'}
                          onChange={() => setFormData({ ...formData, vocalGender: 'm' })}
                          className="mr-2"
                        />
                        👨 男声
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="vocalGender"
                          checked={formData.vocalGender === 'f'}
                          onChange={() => setFormData({ ...formData, vocalGender: 'f' })}
                          className="mr-2"
                        />
                        👩 女声
                      </label>
                    </div>
                  </div>
                )}

                {/* 纯音乐模式提示 */}
                {mode === 'instrumental' && (
                  <div className="text-xs text-gray-400 italic">
                    纯音乐模式下，人声性别选项不可用
                  </div>
                )}
                
                {/* 自定义模式纯音乐提示 */}
                {mode === 'custom' && formData.customModeType === 'instrumental' && (
                  <div className="text-xs text-gray-400 italic">
                    纯音乐模式下，人声性别选项不可用
                  </div>
                )}
              </div>
            )}

            {/* 当前选择预览（仅纯音乐模式） */}
            {mode === 'instrumental' && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">当前选择预览：</p>
                <p className="text-sm text-gray-700">
                  节奏: {getSelectedLabels(formData.selectedRhythms, rhythmOptions) || '未选择'} | 
                  风格: {getSelectedLabels(formData.selectedStyles, styleOptions) || '未选择'} | 
                  乐器: {getSelectedLabels(formData.selectedInstruments, instrumentOptions) || '未选择'}
                </p>
              </div>
            )}

            {/* 自定义模式预览 */}
            {mode === 'custom' && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">当前设置预览：</p>
                <p className="text-sm text-gray-700">
                  类型: {formData.customModeType === 'lyrics' ? '🎤 带歌词' : '🎵 纯音乐'} | 
                  风格: {formData.customTags || '未设置'}
                </p>
              </div>
            )}

            {/* ========== 按钮区域 ========== */}
            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={loading || (mode === 'custom' && !formData.customPrompt)}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '生成中，跳转中...' : (mode === 'instrumental' ? '🎵 生成纯音乐' : '✏️ 生成自定义音乐')}
              </button>

              {recentTaskId && (
                <button
                  type="button"
                  onClick={handleGoToLastResult}
                  className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <span>🎵</span>
                  返回上次生成的结果
                </button>
              )}
            </div>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">
              ❌ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}