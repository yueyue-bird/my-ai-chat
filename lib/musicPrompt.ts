export type TasteKey = 'sweet' | 'sour' | 'bitter' | 'salty';
export type AffectiveKey = 'liked' | 'disliked' | 'mixed';
export type AnchorStageKey = 'onset' | 'development' | 'aftertaste';

export interface TasteTrajectoryAnchor {
  id: string;
  position: number;
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

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const intensityTag = (intensity: number) => {
  if (intensity < 34) return 'Low';
  if (intensity < 67) return 'Medium';
  return 'High';
};

const normalizeIntensity = (intensity: number) => Math.max(0, Math.min(100, Math.round(intensity)));

const describeAnchorForTrajectory = (anchor: TasteTrajectoryAnchor | undefined, fallbackStage: AnchorStageKey) => {
  const stage = anchor?.stage || fallbackStage;
  const position = Math.max(0, Math.min(1, anchor?.position ?? 0));
  const intensity = intensityTag(normalizeIntensity(anchor?.intensity ?? 0)).toLowerCase();
  const taste = anchor?.taste || 'sweet';
  const affective = anchor?.affective || 'mixed';
  const mouthfeel = anchor?.mouthfeel?.trim();

  return `${intensity}-intensity ${taste} ${stageLabelMap[stage].toLowerCase()} at normalized time ${position.toFixed(2)} that feels ${
    affectiveContextMap[affective]
  }${mouthfeel ? ` and carries a ${mouthfeel} mouthfeel` : ''}`;
};

const buildOverallTrajectory = (anchors: TasteTrajectoryAnchor[]) => {
  if (!anchors.length) return 'Overall trajectory: no taste anchors selected.';

  return `Overall trajectory: ${anchors
    .map((anchor) => describeAnchorForTrajectory(anchor, anchor.stage))
    .join('; then ')}.`;
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
    `Normalized time: ${Math.max(0, Math.min(1, anchor.position)).toFixed(2)}`,
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
  const anchors = [...input.anchors]
    .sort((a, b) => a.position - b.position)
    .map((anchor) => ({
      ...anchor,
      position: Math.max(0, Math.min(1, anchor.position)),
      intensity: normalizeIntensity(anchor.intensity),
      mouthfeel: anchor.mouthfeel?.trim() || '',
    }));
  const firstTaste = anchors[0]?.taste || 'sweet';
  const lastTaste = anchors[anchors.length - 1]?.taste || firstTaste;

  const prompt = [
    `Create instrumental music from a ${anchors.length}-anchor taste trajectory over normalized tasting time.`,
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
        `${stageLabelMap[anchor.stage]} at ${anchor.position.toFixed(2)}: ${anchor.taste} / ${anchor.intensity}/100 / ${anchor.affective}${
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
    summary: `${summary} | Suno format: ${anchors.length} taste anchors`,
    negativeTags: 'harsh, distorted, aggressive, dissonant, vocal',
  };
}
