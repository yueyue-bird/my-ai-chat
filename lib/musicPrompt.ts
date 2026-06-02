export type TasteKey = 'sweet' | 'sour' | 'bitter' | 'salty';
export type AffectiveBaseKey = 'welcomed' | 'resisted' | 'ambivalent';
export type EmotionKey =
  | 'wonder'
  | 'transcendence'
  | 'nostalgia'
  | 'tenderness'
  | 'peacefulness'
  | 'joy'
  | 'power'
  | 'tension'
  | 'sadness';
export type EmbodiedKey =
  | 'soft'
  | 'viscosity'
  | 'cloud'
  | 'mouthFilling'
  | 'lingering'
  | 'punch'
  | 'firework'
  | 'explosive'
  | 'sharp'
  | 'flash'
  | 'thin'
  | 'medicineLike'
  | 'granulated'
  | 'dynamic'
  | 'movingAround'
  | 'notMouthFilling';
export type TrajectoryKey = 'burst' | 'bloom' | 'constant' | 'residue';

export interface ResearchMusicPromptInput {
  taste: TasteKey;
  affectiveBase: AffectiveBaseKey;
  emotions: EmotionKey[];
  embodiedFeelings: EmbodiedKey[];
  trajectory: TrajectoryKey;
  extraStyle?: string;
}

export interface BuiltResearchMusicPrompt {
  prompt: string;
  tags: string;
  title: string;
  summary: string;
}

export interface CustomMusicPromptInput {
  userPrompt: string;
  tags: string;
  isInstrumental: boolean;
}

export const tasteOptions: Array<{ value: TasteKey; label: string }> = [
  { value: 'sweet', label: 'Sweet 甜味' },
  { value: 'sour', label: 'Sour 酸味' },
  { value: 'bitter', label: 'Bitter 苦味' },
  { value: 'salty', label: 'Salty 咸味' },
];

export const affectiveBaseOptions: Array<{ value: AffectiveBaseKey; label: string }> = [
  { value: 'welcomed', label: 'Welcomed 接纳' },
  { value: 'resisted', label: 'Resisted 抵触' },
  { value: 'ambivalent', label: 'Ambivalent 矛盾' },
];

export const emotionOptions: Array<{ value: EmotionKey; label: string }> = [
  { value: 'wonder', label: 'Wonder 惊奇' },
  { value: 'transcendence', label: 'Transcendence 超越' },
  { value: 'nostalgia', label: 'Nostalgia 怀旧' },
  { value: 'tenderness', label: 'Tenderness 温柔' },
  { value: 'peacefulness', label: 'Peacefulness 平静' },
  { value: 'joy', label: 'Joy 快乐' },
  { value: 'power', label: 'Power 力量' },
  { value: 'tension', label: 'Tension 紧张' },
  { value: 'sadness', label: 'Sadness 悲伤' },
];

export const embodiedOptions: Array<{ value: EmbodiedKey; label: string }> = [
  { value: 'soft', label: 'soft 柔软' },
  { value: 'viscosity', label: 'viscosity 黏稠' },
  { value: 'cloud', label: 'cloud 云状' },
  { value: 'mouthFilling', label: 'mouth-filling 充满口腔' },
  { value: 'lingering', label: 'lingering 留存' },
  { value: 'punch', label: 'punch 冲击' },
  { value: 'firework', label: 'firework 烟花感' },
  { value: 'explosive', label: 'explosive 爆发' },
  { value: 'sharp', label: 'sharp 尖锐' },
  { value: 'flash', label: 'flash 闪现' },
  { value: 'thin', label: 'thin 单薄' },
  { value: 'medicineLike', label: 'medicine-like 药感' },
  { value: 'granulated', label: 'granulated 颗粒感' },
  { value: 'dynamic', label: 'dynamic 动态' },
  { value: 'movingAround', label: 'moving around 游移' },
  { value: 'notMouthFilling', label: 'not mouth-filling 不饱满' },
];

export const trajectoryOptions: Array<{ value: TrajectoryKey; label: string }> = [
  { value: 'burst', label: 'Burst 瞬时爆发' },
  { value: 'bloom', label: 'Bloom 渐开' },
  { value: 'constant', label: 'Constant 稳定持续' },
  { value: 'residue', label: 'Residue 余味残留' },
];

const tastePromptMap: Record<TasteKey, { prompt: string; tags: string; title: string }> = {
  sweet: {
    title: 'Sweet Taste Track',
    tags: 'sweet taste, 120-150 BPM, smooth, rounded, legato, medium sharpness',
    prompt:
      'Use a high pitch range around 500-1500 Hz, 120-150 BPM, low roughness, smooth and rounded timbre, legato and soft articulation, continuous phrasing, and medium sharpness.',
  },
  sour: {
    title: 'Sour Taste Track',
    tags: 'sour taste, 140-185 BPM, harsh, staccato, discontinuous, piercing',
    prompt:
      'Use a pitch range around 350-1000 Hz, 140-185 BPM, high roughness, harsh and abrasive timbre, staccato articulation, high discontinuity, and high piercing sharpness.',
  },
  bitter: {
    title: 'Bitter Taste Track',
    tags: 'bitter taste, 120-140 BPM, low pitch, rough, legato, discontinuous',
    prompt:
      'Use a low pitch range around 180-350 Hz, 120-140 BPM, high roughness, harsh and abrasive timbre. Keep legato phrasing, but preserve discontinuity through separated events, fragmented accents, and staccato-like breaks. Use low sharpness.',
  },
  salty: {
    title: 'Salty Taste Track',
    tags: 'salty taste, 140-170 BPM, textured, staccato, discontinuous',
    prompt:
      'Use a pitch range around 260-500 Hz, 140-170 BPM, medium roughness, textured timbre, staccato articulation, discontinuous phrasing, and medium sharpness.',
  },
};

const affectiveBasePromptMap: Record<AffectiveBaseKey, string> = {
  welcomed: 'welcomed, approachable, receptive',
  resisted: 'resisted, tense, withholding',
  ambivalent: 'ambivalent, mixed, uncertain',
};

const emotionPromptMap: Record<EmotionKey, string> = {
  wonder: 'dazzled, moved, amazed, fascinated',
  transcendence: 'transcendent, ethereal, spiritual, immersive, sublime, heavenly, celestial, overwhelming',
  nostalgia: 'nostalgic, dreamy, bittersweet, warm',
  tenderness: 'tender, affectionate, loving, gentle, warm, intimate, soft, heartfelt',
  peacefulness: 'peaceful, calm, serene, meditative, tranquil, soothing, still, relaxing',
  joy: 'joyful, happy, playful, bright, cheerful, radiant, lively, uplifting',
  power: 'powerful, strong, triumphant, epic, energetic, bold, driving, heroic',
  tension: 'tense, anxious, agitated, nervous, suspenseful, dark, unstable, urgent',
  sadness: 'sad, sorrowful, melancholic, lonely, fragile, emotional, yearning, somber',
};

const embodiedPromptMap: Record<EmbodiedKey, string> = {
  soft: 'smooth, gentle, flowing',
  viscosity: 'flowing, continuous, immersive',
  cloud: 'diffuse, floating, surrounding',
  mouthFilling: 'dense, full, resonant',
  lingering: 'slowly decaying, sustained, lingering',
  punch: 'percussive, impactful, accented',
  firework: 'sparkling, bursting, scattered',
  explosive: 'explosive, expanding, energetic',
  sharp: 'bright, piercing, tense',
  flash: 'rapid, transient, flickering',
  thin: 'sparse, narrow, hollow',
  medicineLike: 'dry, rough, dark',
  granulated: 'granular, fragmented, textured',
  dynamic: 'fluctuating, moving, unstable',
  movingAround: 'drifting, swirling, moving',
  notMouthFilling: 'sparse, light, separated',
};

const trajectoryPromptMap: Record<TrajectoryKey, string> = {
  burst: 'Use a burst trajectory: immediate attack, short high-energy onset, quick release.',
  bloom: 'Use a bloom trajectory: gradual opening, widening texture, slow expansion over time.',
  constant: 'Use a constant trajectory: stable intensity, steady movement, consistent texture.',
  residue: 'Use a residue trajectory: delayed decay, lingering tail, fading aftertaste-like ending.',
};

const joinParts = (parts: string[]) => parts.filter(Boolean).join(' ');

export function buildResearchMusicPrompt(input: ResearchMusicPromptInput): BuiltResearchMusicPrompt {
  const taste = tastePromptMap[input.taste];
  const affectiveWords = [
    affectiveBasePromptMap[input.affectiveBase],
    ...input.emotions.map((emotion) => emotionPromptMap[emotion]),
  ].filter(Boolean);
  const embodiedWords = input.embodiedFeelings.map((feeling) => embodiedPromptMap[feeling]).filter(Boolean);
  const extraStyle = input.extraStyle?.trim();

  const prompt = joinParts([
    `Instrumental music for a ${input.taste} taste experience.`,
    taste.prompt,
    affectiveWords.length
      ? `Affective modifiers should be secondary rather than dominant: ${affectiveWords.join(', ')}.`
      : '',
    embodiedWords.length ? `Embodied texture and movement: ${embodiedWords.join(', ')}.` : '',
    trajectoryPromptMap[input.trajectory],
    extraStyle ? `Additional style constraint: ${extraStyle}.` : '',
    'No lyrics. Focus on taste-to-sound mapping, controlled musical parameters, and a clear sensory trajectory rather than a generic song.',
  ]);

  const tags = [
    taste.tags,
    affectiveWords.join(', '),
    embodiedWords.join(', '),
    input.trajectory,
    extraStyle || '',
    'instrumental, sensory music, taste mapping',
  ]
    .filter(Boolean)
    .join(', ');

  const summary = [
    `Taste: ${input.taste}`,
    `Affective: ${input.affectiveBase}${input.emotions.length ? ` + ${input.emotions.join(', ')}` : ''}`,
    `Embodied: ${input.embodiedFeelings.length ? input.embodiedFeelings.join(', ') : 'none'}`,
    `Trajectory: ${input.trajectory}`,
  ].join(' | ');

  return {
    prompt,
    tags,
    title: taste.title,
    summary,
  };
}

export function buildCustomMusicPrompt(input: CustomMusicPromptInput): BuiltResearchMusicPrompt {
  const userPrompt = input.userPrompt.trim();
  const tags = input.tags.trim();
  const prompt = input.isInstrumental
    ? joinParts([
        'Create instrumental music based on this user prompt.',
        `User prompt: ${userPrompt}`,
        tags ? `Style tags: ${tags}.` : '',
        'Translate the prompt into clear musical decisions: tempo, instrumentation, timbre, dynamics, structure, emotional arc, and texture.',
        'No lyrics. Keep the result focused, coherent, and suitable for AI music generation.',
      ])
    : joinParts([
        'Create a song based on this user prompt or lyric draft.',
        `User content: ${userPrompt}`,
        tags ? `Style tags: ${tags}.` : '',
        'Use the content as the central creative direction. If it contains lyrics, preserve the meaning and shape; if it is descriptive, turn it into a singable musical concept.',
        'Make the arrangement, mood, tempo, and vocal delivery match the prompt.',
      ]);

  return {
    prompt,
    tags: tags || (input.isInstrumental ? 'instrumental, custom prompt' : 'custom song, vocal'),
    title: input.isInstrumental ? 'Custom Instrumental Prompt' : 'Custom Song Prompt',
    summary: `${input.isInstrumental ? 'Instrumental' : 'Song'} custom prompt | Tags: ${tags || 'none'}`,
  };
}
