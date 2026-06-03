export type TasteKey = 'sweet' | 'sour' | 'bitter' | 'salty';
export type AffectiveKey = 'liked' | 'disliked' | 'mixed';
export type TextureKey = 'soft' | 'hard' | 'crispy' | 'crunchy' | 'moist' | 'dry' | 'smooth' | 'rough';
export type TrajectoryKey = 'burst' | 'bloom' | 'constant' | 'residue';

export interface ResearchMusicPromptInput {
  taste: TasteKey;
  affective: AffectiveKey;
  textures: TextureKey[];
  textureNote?: string;
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
  { value: 'sweet', label: 'Sweet' },
  { value: 'sour', label: 'Sour' },
  { value: 'bitter', label: 'Bitter' },
  { value: 'salty', label: 'Salty' },
];

export const affectiveOptions: Array<{ value: AffectiveKey; label: string; tone: string }> = [
  { value: 'liked', label: 'Liked', tone: 'welcoming, pleasant, open' },
  { value: 'disliked', label: 'Disliked', tone: 'resistant, tense, uneasy' },
  { value: 'mixed', label: 'Mixed / Neutral', tone: 'ambivalent, balanced, unresolved' },
];

export const textureOptions: Array<{ value: TextureKey; label: string }> = [
  { value: 'soft', label: 'Soft' },
  { value: 'hard', label: 'Hard' },
  { value: 'crispy', label: 'Crispy' },
  { value: 'crunchy', label: 'Crunchy' },
  { value: 'moist', label: 'Moist' },
  { value: 'dry', label: 'Dry' },
  { value: 'smooth', label: 'Smooth' },
  { value: 'rough', label: 'Rough' },
];

export const trajectoryOptions: Array<{ value: TrajectoryKey; label: string; curve: string }> = [
  { value: 'burst', label: 'Burst', curve: 'immediate high-intensity onset with quick release' },
  { value: 'bloom', label: 'Bloom', curve: 'gradual opening and expansion across normalized time' },
  { value: 'constant', label: 'Constant', curve: 'stable intensity across normalized time' },
  { value: 'residue', label: 'Residue', curve: 'lingering tail and delayed decay' },
];

const tastePromptMap: Record<TasteKey, { prompt: string; tags: string; title: string }> = {
  sweet: {
    title: 'Sweet Taste Track',
    tags: 'sweet taste, smooth, rounded, warm, gentle, consonant',
    prompt:
      'Use a qualitative sweet-taste vocabulary: smooth contours, rounded timbre, warm resonance, gentle articulation, consonant harmony, and soft continuity.',
  },
  sour: {
    title: 'Sour Taste Track',
    tags: 'sour taste, bright, tangy, sharp, agile, fizzy',
    prompt:
      'Use a qualitative sour-taste vocabulary: bright color, tangy tension, sharp edges, agile gestures, fizzy texture, and quick contrast.',
  },
  bitter: {
    title: 'Bitter Taste Track',
    tags: 'bitter taste, dark, dry, rough, hollow, restrained',
    prompt:
      'Use a qualitative bitter-taste vocabulary: darker color, dry resonance, rough grain, hollow space, restrained motion, and shadowed density.',
  },
  salty: {
    title: 'Salty Taste Track',
    tags: 'salty taste, crisp, granular, clean, percussive, edged',
    prompt:
      'Use a qualitative salty-taste vocabulary: crisp attacks, granular detail, clean edges, lightly percussive texture, and clear separation.',
  },
};

const affectivePromptMap: Record<AffectiveKey, string> = {
  liked: 'The affective response is liked: welcoming, pleasant, open, and easy to approach.',
  disliked: 'The affective response is disliked: resistant, tense, uneasy, and slightly withholding.',
  mixed: 'The affective response is mixed or neutral: ambivalent, balanced, unresolved, and not emotionally extreme.',
};

const texturePromptMap: Record<TextureKey, string> = {
  soft: 'soft',
  hard: 'hard',
  crispy: 'crispy',
  crunchy: 'crunchy',
  moist: 'moist',
  dry: 'dry',
  smooth: 'smooth',
  rough: 'rough',
};

const trajectoryPromptMap: Record<TrajectoryKey, string> = {
  burst: 'Use a burst trajectory: immediate attack, short high-intensity onset, and quick release.',
  bloom: 'Use a bloom trajectory: gradual opening, widening texture, and slow expansion over normalized time.',
  constant: 'Use a constant trajectory: stable intensity, steady movement, and consistent texture over normalized time.',
  residue: 'Use a residue trajectory: delayed decay, lingering tail, and a fading aftertaste-like ending.',
};

const joinParts = (parts: string[]) => parts.filter(Boolean).join(' ');

export function buildResearchMusicPrompt(input: ResearchMusicPromptInput): BuiltResearchMusicPrompt {
  const taste = tastePromptMap[input.taste];
  const affective = affectivePromptMap[input.affective];
  const textureWords = input.textures.map((texture) => texturePromptMap[texture]).filter(Boolean);
  const textureNote = input.textureNote?.trim();
  const extraStyle = input.extraStyle?.trim();

  const prompt = joinParts([
    `Create instrumental music for a ${input.taste} taste experience using one unified qualitative taste vocabulary.`,
    taste.prompt,
    affective,
    textureWords.length
      ? `Mouthfeel texture words should guide timbre and articulation: ${textureWords.join(', ')}.`
      : '',
    textureNote ? `User-described mouthfeel texture: ${textureNote}.` : '',
    trajectoryPromptMap[input.trajectory],
    extraStyle ? `Additional style constraint: ${extraStyle}.` : '',
    'No lyrics. Avoid numeric tempo, frequency, or pitch constraints; translate sensory vocabulary into coherent musical choices.',
  ]);

  const tags = [
    taste.tags,
    input.affective,
    textureWords.join(', '),
    input.trajectory,
    extraStyle || '',
    'instrumental, sensory music, qualitative taste mapping',
  ]
    .filter(Boolean)
    .join(', ');

  const summary = [
    `Taste: ${input.taste}`,
    `Affective: ${input.affective}`,
    `Texture: ${textureWords.length ? textureWords.join(', ') : 'free description only'}`,
    `Curve: ${input.trajectory}`,
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
        'Translate the prompt into clear musical decisions: instrumentation, timbre, dynamics, structure, emotional arc, and texture.',
        'No lyrics. Keep the result focused, coherent, and suitable for AI music generation.',
      ])
    : joinParts([
        'Create a song based on this user prompt or lyric draft.',
        `User content: ${userPrompt}`,
        tags ? `Style tags: ${tags}.` : '',
        'Use the content as the central creative direction. If it contains lyrics, preserve the meaning and shape; if it is descriptive, turn it into a singable musical concept.',
        'Make the arrangement, mood, and vocal delivery match the prompt.',
      ]);

  return {
    prompt,
    tags: tags || (input.isInstrumental ? 'instrumental, custom prompt' : 'custom song, vocal'),
    title: input.isInstrumental ? 'Custom Instrumental Prompt' : 'Custom Song Prompt',
    summary: `${input.isInstrumental ? 'Instrumental' : 'Song'} custom prompt | Tags: ${tags || 'none'}`,
  };
}
