/**
 * Bundled pack: Breast Expansion (NSFW)
 *
 * The prose-craft companion to the BE engine (src/lib/services/be/). The
 * engine owns ALL body state: the classifier proposes events, the
 * deterministic reducer moves the canonical tier, and the narrative templates
 * receive [BODY STATE] + [BE GENRE RULES] blocks with authority over when
 * growth happens and how much.
 *
 * This pack deliberately defines NO runtime variables and NO state of its
 * own — duplicating engine gauges in classifier-extracted variables would
 * double-track and drift. What it adds is the storytelling layer the compact
 * genre-rules block leaves out: story-focus shaping, character interiority
 * around transformation, consequence threads between growth beats, and
 * explicit-scene integration guidance.
 *
 * Use with a story that has BE Mode enabled, and pair with the Mature or
 * Explicit content rating in Story Settings.
 */

import type { BundledPackDefinition } from './types'

/**
 * Craft section inserted into both narrative templates (adventure and
 * creative-writing), directly before the '# Dialogue Guidelines' heading.
 * Defers to the engine's [BODY STATE] / [BE GENRE RULES] blocks on all
 * size and growth authority.
 */
const BE_CRAFT_SECTION = `# Breast Expansion Storytelling
This story features breast expansion as a central theme. All characters are adults.

## Authority
When [BODY STATE] and [BE GENRE RULES] blocks are present, they are the sole authority on every character's current size and on when and how much growth happens — this section never overrides them; it governs the storytelling around them. If no [BODY STATE] block is present, maintain size continuity strictly through prose: a character's proportions never change off-page.

## Story Focus
{% if beFocus == 'transformation-central' %}Transformation is the story's spine: most scenes connect to growth, its anticipation, or its consequences — even quiet scenes carry its undertow.{% else %}Transformation is a strong recurring thread woven through a larger story: let plot, relationships, and world-building breathe between growth beats, and let those threads collide with the transformation rather than pause for it.{% endif %}

## Character Interiority
- Each character's relationship to her transformation flows from who she is — craving, accepting, conflicted, fearful, or resentful — and from her tracked attitude when the state block reports one. Keep it consistent and let it evolve only through on-page experience
- Show her awareness of her own body in incidental beats: reaching past herself, adjusting posture, catching reflections, recalibrating space
- Other characters notice, react, and remember — attraction, envy, concern, opportunism — each according to their own personality and stake
- Denial, embarrassment, pride, and negotiation with one's own desire are richer material than simple enjoyment; keep the inner conflict alive

## Consequence Threads (between growth beats)
- Wardrobe is a running storyline: outgrown clothes, replacements, improvisations, the meaning of choosing to show or conceal
- Physical adaptation accumulates: balance, doorways, chairs, sleep, work — small persistent frictions that make scale feel real
- Social gravity shifts: attention in public, changed dynamics with friends and rivals, rumors, practical accommodations
- Never resolve these threads in a single line; let them build, complicate, and pay off across scenes
- Between growth directives, weave anticipation — warmth, sensitivity, tightness, appetite — without ever depicting actual growth the state block did not authorize

## Explicit Integration
When the story's content rating permits explicit content, growth and intimacy interleave naturally: sensation during change is erotic material, on-page and specific, written in the character's voice and emotional register. Follow the content guidelines for explicitness; follow the state block for physical facts.`

/** Marker heading the craft section is inserted before. */
const INSERTION_MARKER = '# Dialogue Guidelines'

/**
 * Insert the BE craft section into a baseline narrative template.
 * Falls back to appending at the end if the marker heading is ever renamed.
 */
function insertCraftSection(baselineContent: string): string {
  if (baselineContent.includes(INSERTION_MARKER)) {
    return baselineContent.replace(INSERTION_MARKER, `${BE_CRAFT_SECTION}\n\n${INSERTION_MARKER}`)
  }
  return `${baselineContent}\n\n${BE_CRAFT_SECTION}`
}

export const breastExpansionBundle: BundledPackDefinition = {
  bundleId: 'breast-expansion',
  name: 'Breast Expansion (NSFW)',
  description:
    'Prose-craft companion for BE Mode stories: story-focus shaping, character interiority around transformation, consequence threads between growth beats, and explicit-scene integration. Body state stays engine-tracked — enable BE Mode on the story and pair with the Mature or Explicit content rating.',
  author: 'Aventuras',
  /** templateId -> transform applied to the baseline content. */
  templateTransforms: {
    adventure: insertCraftSection,
    'creative-writing': insertCraftSection,
  },
  customVariables: [
    {
      variableName: 'beFocus',
      displayName: 'Story Focus',
      description: 'How central transformation is to the narrative',
      variableType: 'enum',
      isRequired: false,
      sortOrder: 0,
      defaultValue: 'balanced',
      enumOptions: [
        { label: 'Transformation-Central', value: 'transformation-central' },
        { label: 'Balanced with Plot', value: 'balanced' },
      ],
    },
  ],
  // Deliberately empty: the BE engine (services/be) is the single owner of
  // body state. Pack-defined gauges would double-track it via the classifier.
  runtimeVariables: [],
}
