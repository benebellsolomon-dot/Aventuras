/**
 * Bundled pack: Breast Expansion (NSFW)
 *
 * A transformation-focused storytelling pack for adult text-adventure and
 * visual-novel style stories. Ports the proven mechanics shape from the
 * ambrosia/UIE engines onto Aventuras' native systems:
 *
 * - Per-character gauges (cup size index, transformation stage, pressure,
 *   desire, lactation) as pack runtime variables — the classifier extracts
 *   updates each turn and values are injected back into prompts.
 * - Rule-based mechanics (stage gates, growth episodes, consequence rules)
 *   as a template section inserted into the narrative baselines.
 * - Story-level knobs (catalyst, pacing, focus) as pack custom variables.
 */

import type { BundledPackDefinition } from './types'

/**
 * Mechanics section inserted into both narrative templates (adventure and
 * creative-writing), directly before the '# Dialogue Guidelines' heading.
 * References pack custom variables and runtime variable context blocks.
 */
const BE_MECHANICS_SECTION = `# Transformation Engine (Breast Expansion)
This story features breast expansion as a central transformation theme. All characters are adults. Track and honor each character's physical state precisely.

## Current Transformation State (canonical — never contradict)
{% if runtimeVars_characters != '' %}{{ runtimeVars_characters }}{% else %}No transformation values recorded yet — characters are at their baseline.{% endif %}

## Cup Size Index (0–35 scale)
The cupSizeIndex value maps to physical scale. Anchors:
- 0 = AA (flat) · 1 = A · 2 = B · 3 = C · 4 = D · 5 = DD/E
- 6 = F · 7 = G (head-sized) · 9 = J · 11 = L (torso-width)
- 14 = N (watermelon+) · 17 = beachball-sized · 20 = hip-width, arm-filling
- 25 = bean-bag scale, reshaping posture and movement
- 30 = furniture-displacing, room presence
- 35 = beyond-scale fantasy proportions
Describe each character's figure consistently with their current index, including how it affects posture, movement, clothing, and how others react.

## Transformation Stages (0–5, gated)
- Stage 0 — Baseline: no exposure to the catalyst yet
- Stage 1 — Awakening: first exposure; warmth, tingling, heightened sensitivity; subtle firmness
- Stage 2 — Acceleration: visible growth episodes begin; pressure builds between episodes; clothing grows snug
- Stage 3 — Transformation: dramatic growth; wardrobe and social consequences are unavoidable; desire becomes self-reinforcing
- Stage 4 — Abundance: figure dominates physical presence; lactation typically active; growth comes easily
- Stage 5 — Apotheosis: fantasy scale; transformation is an embraced part of identity
A stage advance is a story beat — it happens on-page through a meaningful scene, never silently between responses. Stages do not regress unless the author/player explicitly directs it.

## Catalyst
{% if beCatalyst != '' %}{{ beCatalyst }}{% else %}An unnamed catalyst drives transformation — establish it early in the story.{% endif %}

## Growth Episodes
- Growth happens in discrete on-page episodes triggered by catalyst exposure, high pressure, or peaks of desire — never as an offhand mention
- Pacing ({{ beGrowthPacing }}): slow-burn = +1 index per episode, rare; steady = +1–2 per episode; rapid = +2–4 per episode, frequent
- Write episodes fully: onset sensations, the swell itself, fabric strain, the character's reaction, and aftermath
- Growth has real consequences — strained clothing, attention, balance, back-ache at higher indices, changed social dynamics. Costs make payoffs land; do not smooth them away
- Pressure rises between episodes when growth is denied or delayed; release it through an episode
- Desire tracks how much the character wants further growth; let personality govern whether they chase, resist, or deny it — characters keep their agency and their conflicts

## Story Focus
{% if beFocus == 'transformation-central' %}Transformation is the story's spine: most scenes connect to growth, its anticipation, or its consequences.{% else %}Transformation is a strong recurring thread woven through a larger story: let plot, relationships, and world-building breathe between episodes.{% endif %}
{% if inlineImageMode %}
## Visual Continuity
When embedding <pic> tags, always reflect each depicted character's CURRENT cup size index in the prompt with concrete size descriptors (e.g. "gigantic breasts larger than her head" at index 8+). Never render a character at an outdated size.{% endif %}`

/** Marker heading the mechanics section is inserted before. */
const INSERTION_MARKER = '# Dialogue Guidelines'

/**
 * Insert the BE mechanics section into a baseline narrative template.
 * Falls back to appending at the end if the marker heading is ever renamed.
 */
function insertMechanics(baselineContent: string): string {
  if (baselineContent.includes(INSERTION_MARKER)) {
    return baselineContent.replace(
      INSERTION_MARKER,
      `${BE_MECHANICS_SECTION}\n\n${INSERTION_MARKER}`,
    )
  }
  return `${baselineContent}\n\n${BE_MECHANICS_SECTION}`
}

export const breastExpansionBundle: BundledPackDefinition = {
  bundleId: 'breast-expansion',
  name: 'Breast Expansion (NSFW)',
  description:
    'Transformation-focused adult storytelling pack. Adds per-character growth gauges (cup size index, stage, pressure, desire, lactation) tracked automatically each turn, plus stage-gated growth mechanics in the narrative prompts. Pair with the Explicit content rating in Story Settings for full effect.',
  author: 'Aventuras',
  /** templateId -> transform applied to the baseline content. */
  templateTransforms: {
    adventure: insertMechanics,
    'creative-writing': insertMechanics,
  },
  customVariables: [
    {
      variableName: 'beCatalyst',
      displayName: 'Growth Catalyst',
      description: 'What drives transformation in this story (substance, magic, curse, ritual…)',
      variableType: 'textarea',
      isRequired: false,
      sortOrder: 0,
      defaultValue:
        'Ambrosia — a sweet, faintly glowing nectar. Each taste is warm, euphoric, and quietly addictive; regular exposure drives growth.',
    },
    {
      variableName: 'beGrowthPacing',
      displayName: 'Growth Pacing',
      description: 'How fast growth episodes escalate',
      variableType: 'enum',
      isRequired: false,
      sortOrder: 1,
      defaultValue: 'steady',
      enumOptions: [
        { label: 'Slow Burn', value: 'slow-burn' },
        { label: 'Steady', value: 'steady' },
        { label: 'Rapid', value: 'rapid' },
      ],
    },
    {
      variableName: 'beFocus',
      displayName: 'Story Focus',
      description: 'How central transformation is to the narrative',
      variableType: 'enum',
      isRequired: false,
      sortOrder: 2,
      defaultValue: 'balanced',
      enumOptions: [
        { label: 'Transformation-Central', value: 'transformation-central' },
        { label: 'Balanced with Plot', value: 'balanced' },
      ],
    },
  ],
  runtimeVariables: [
    {
      entityType: 'character',
      variableName: 'cupSizeIndex',
      displayName: 'Cup Size Index',
      description:
        'Current breast size on the 0-35 index (0=AA, 2=B, 4=D, 6=F, 9=J, 14=N, 20=hip-width, 35=beyond-scale). Increase only when a growth episode happens on-page in the narrative. Never decrease unless the story explicitly reverses growth.',
      variableType: 'number',
      defaultValue: '3',
      minValue: 0,
      maxValue: 35,
      color: '#ec4899',
      pinned: true,
      sortOrder: 0,
    },
    {
      entityType: 'character',
      variableName: 'transformationStage',
      displayName: 'Transformation Stage',
      description:
        'Transformation stage 0-5 (0=baseline, 1=awakening, 2=acceleration, 3=transformation, 4=abundance, 5=apotheosis). Advance only when the narrative plays a clear stage-advance beat on-page. Never decrease.',
      variableType: 'number',
      defaultValue: '0',
      minValue: 0,
      maxValue: 5,
      color: '#a855f7',
      pinned: true,
      sortOrder: 1,
    },
    {
      entityType: 'character',
      variableName: 'pressure',
      displayName: 'Pressure',
      description:
        'Built-up transformation pressure 0-100. Rises when growth is teased, delayed, or denied; drops sharply (by 40-80) when a growth episode releases it.',
      variableType: 'number',
      defaultValue: '0',
      minValue: 0,
      maxValue: 100,
      color: '#f97316',
      pinned: false,
      sortOrder: 2,
    },
    {
      entityType: 'character',
      variableName: 'desire',
      displayName: 'Transformation Desire',
      description:
        'How much this character wants further growth, 0-100. Adjust gradually based on their on-page reactions — attraction, fear, denial, or craving.',
      variableType: 'number',
      defaultValue: '10',
      minValue: 0,
      maxValue: 100,
      color: '#e11d48',
      pinned: false,
      sortOrder: 3,
    },
    {
      entityType: 'character',
      variableName: 'lactation',
      displayName: 'Lactation',
      description:
        'Lactation state. Progresses none -> latent -> active -> heavy, typically from stage 3 upward. Only change when depicted or clearly implied on-page.',
      variableType: 'enum',
      defaultValue: 'none',
      enumOptions: [
        { label: 'None', value: 'none' },
        { label: 'Latent', value: 'latent' },
        { label: 'Active', value: 'active' },
        { label: 'Heavy', value: 'heavy' },
      ],
      color: '#38bdf8',
      pinned: false,
      sortOrder: 4,
    },
  ],
}
