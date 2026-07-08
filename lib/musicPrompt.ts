export type TasteKey = 'sweet' | 'sour' | 'bitter' | 'salty';
export type AffectiveKey = 'liked' | 'disliked' | 'mixed';
export type AnchorStageKey = 'onset' | 'development' | 'aftertaste';

export interface TasteTrajectoryAnchor {
  stage: AnchorStageKey;
  taste: TasteKey;
  intensity: number;
  affective: AffectiveKey;
  mouthfeel?: string;
}

export interface ResearchMusicPromptInput {
  anchors: TasteTrajectoryAnchor[];
}

export interface BuiltResearchMusicPrompt {
  prompt: string;
  title: string;
  summary: string;
  negativeTags?: string;
}

export interface CustomMusicPromptInput {
  userPrompt: string;
  isInstrumental: boolean;
}

export const tasteOptions: Array<{ value: TasteKey; label: string }> = [
  { value: 'sweet', label: 'Sweet' },
  { value: 'sour', label: 'Sour' },
  { value: 'bitter', label: 'Bitter' },
  { value: 'salty', label: 'Salty' },
];

export const affectiveOptions: Array<{ value: AffectiveKey; label: string }> = [
  { value: 'liked', label: 'Liked' },
  { value: 'disliked', label: 'Disliked' },
  { value: 'mixed', label: 'Mixed / Neutral' },
];

export const anchorStageOptions: Array<{ value: AnchorStageKey; label: string; role: string; timeLabel: string }> = [
  { value: 'onset', label: 'Onset', role: 'Intro', timeLabel: '0.0' },
  { value: 'development', label: 'Development', role: 'Development', timeLabel: '0.5' },
  { value: 'aftertaste', label: 'Aftertaste', role: 'Outro', timeLabel: '1.0' },
];

const stageRoleMap: Record<AnchorStageKey, string> = {
  onset: 'Intro',
  development: 'Development',
  aftertaste: 'Outro',
};

const stageLabelMap: Record<AnchorStageKey, string> = {
  onset: 'Onset',
  development: 'Development',
  aftertaste: 'Aftertaste',
};

const softTasteSuggestionMap: Record<TasteKey, string> = {
  sweet: 'warmth, smoothness, or continuity',
  sour: 'brightness, tension, or sharpness',
  bitter: 'dryness, roughness, or restraint',
  salty: 'crispness, grain, or clear edges',
};

const affectiveContextMap: Record<AffectiveKey, string> = {
  liked: 'more accepted',
  disliked: 'less comfortable',
  mixed: 'mixed or ambivalent',
};

const joinParts = (parts: string[]) => parts.filter(Boolean).join(' ');

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const intensityTag = (intensity: number) => {
  if (intensity < 34) return 'Low';
  if (intensity < 67) return 'Medium';
  return 'High';
};

const normalizeIntensity = (intensity: number) => Math.max(0, Math.min(100, Math.round(intensity)));

const getAnchorByStage = (anchors: TasteTrajectoryAnchor[], stage: AnchorStageKey) =>
  anchors.find((anchor) => anchor.stage === stage);

const describeAnchorForTrajectory = (anchor: TasteTrajectoryAnchor | undefined, fallbackStage: AnchorStageKey) => {
  const stage = anchor?.stage || fallbackStage;
  const intensity = intensityTag(normalizeIntensity(anchor?.intensity ?? 0)).toLowerCase();
  const taste = anchor?.taste || 'sweet';
  const affective = anchor?.affective || 'mixed';
  const mouthfeel = anchor?.mouthfeel?.trim();

  return `${intensity}-intensity ${taste} ${stageLabelMap[stage].toLowerCase()} that feels ${
    affectiveContextMap[affective]
  }${mouthfeel ? ` and carries a ${mouthfeel} mouthfeel` : ''}`;
};

const buildOverallTrajectory = (anchors: TasteTrajectoryAnchor[]) => {
  const onset = getAnchorByStage(anchors, 'onset') || anchors[0];
  const development = getAnchorByStage(anchors, 'development') || anchors[1] || onset;
  const aftertaste = getAnchorByStage(anchors, 'aftertaste') || anchors[2] || development;

  return `Overall trajectory: ${describeAnchorForTrajectory(
    onset,
    'onset'
  )}; then ${describeAnchorForTrajectory(
    development,
    'development'
  )}; finally ${describeAnchorForTrajectory(
    aftertaste,
    'aftertaste'
  )}.`;
};

const buildAnchorLine = (anchor: TasteTrajectoryAnchor) => {
  const intensity = normalizeIntensity(anchor.intensity);
  const mouthfeel = anchor.mouthfeel?.trim();
  const taste = titleCase(anchor.taste);
  const stage = stageLabelMap[anchor.stage];
  const affective = titleCase(anchor.affective);

  const sectionInstruction: Record<AnchorStageKey, string> = {
    onset: 'Introduce the first sensory impression.',
    development: 'Develop the central sensory impression.',
    aftertaste: 'Let the sensory impression soften or linger.',
  };

  const details = [
    `Taste: ${taste}`,
    `Affective response: ${affective}`,
    `Intensity: ${intensityTag(intensity)}, ${intensity}/100`,
    mouthfeel ? `Mouthfeel: ${mouthfeel}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const guidance = [
    sectionInstruction[anchor.stage],
    `Use ${anchor.taste} as a sensory cue; possible musical qualities include ${
      softTasteSuggestionMap[anchor.taste]
    }.`,
    `Use the ${anchor.affective} response as preference context (${affectiveContextMap[anchor.affective]}), not as a strict emotion label.`,
    mouthfeel
      ? 'Use mouthfeel to inform timbre, articulation, density, and decay.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return [`[${stageRoleMap[anchor.stage]} / ${stage}]`, details, guidance].join('\n\n');
};

export function buildResearchMusicPrompt(input: ResearchMusicPromptInput): BuiltResearchMusicPrompt {
  const anchors = input.anchors.map((anchor) => ({
    ...anchor,
    intensity: normalizeIntensity(anchor.intensity),
    mouthfeel: anchor.mouthfeel?.trim() || '',
  }));
  const firstTaste = anchors[0]?.taste || 'sweet';
  const lastTaste = anchors[anchors.length - 1]?.taste || firstTaste;

  const prompt = [
    'Create instrumental music from a three-anchor taste trajectory over normalized tasting time.',
    'Translate the trajectory in an interpretive and non-literal way. Taste is a sensory cue, affective response is preference context, and intensity guides relative musical energy. Do not treat taste as a fixed genre or formula.',
    buildOverallTrajectory(anchors),
    anchors.map(buildAnchorLine).join('\n\n'),
    'No lyrics. Avoid numeric tempo, frequency, or pitch constraints.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const summary = anchors
    .map(
      (anchor) =>
        `${stageLabelMap[anchor.stage]}: ${anchor.taste} / ${anchor.intensity}/100 / ${anchor.affective}${
          anchor.mouthfeel ? ` / ${anchor.mouthfeel}` : ''
        }`
    )
    .join(' | ');

  return {
    prompt,
    title:
      firstTaste === lastTaste
        ? `${titleCase(firstTaste)} Taste Journey`
        : `${titleCase(firstTaste)} to ${titleCase(lastTaste)} Taste Journey`,
    summary: `${summary} | Suno format: 3 taste anchors`,
    negativeTags: 'harsh, distorted, aggressive, dissonant, vocal',
  };
}

export function buildCustomMusicPrompt(input: CustomMusicPromptInput): BuiltResearchMusicPrompt {
  const userPrompt = input.userPrompt.trim();
  const prompt = input.isInstrumental
    ? joinParts([
        'Create instrumental music based on this user prompt.',
        `User prompt: ${userPrompt}`,
        'Translate the prompt into clear musical decisions: instrumentation, timbre, dynamics, structure, emotional arc, and texture.',
        'No lyrics. Keep the result focused, coherent, and suitable for AI music generation.',
      ])
    : joinParts([
        'Create a song based on this user prompt or lyric draft.',
        `User content: ${userPrompt}`,
        'Use the content as the central creative direction. If it contains lyrics, preserve the meaning and shape; if it is descriptive, turn it into a singable musical concept.',
        'Make the arrangement, mood, and vocal delivery match the prompt.',
      ]);

  return {
    prompt,
    title: input.isInstrumental ? 'Custom Instrumental Prompt' : 'Custom Song Prompt',
    summary: `${input.isInstrumental ? 'Instrumental' : 'Song'} custom prompt`,
  };
}
