/**
 * Sprite cell spec/prompt builder (Spec 4 V2a Task 6). Pure.
 *
 * One cell = (band, expression cluster, engorged) rendered SOLO on the fixed
 * framing contract: same pose vocabulary + plain background for every cell of
 * a set, so cells swap without the stage jumping and app-side matting has a
 * clean background to remove. si-bridge renders get the structured spec (the
 * caller attaches the FaceID anchor for identity-hold); external providers get
 * the prompt fallback (banded but prompt-only — identity drift accepted per
 * the provider-agnostic ruling).
 */

import type { StructuredImageSpecInput } from './providers/types'
import { bandRepresentativeTier, bandWord, type SpriteExpression } from '$lib/services/be'

export interface SpriteCellInput {
  name: string
  visualDescriptors: {
    face?: string
    hair?: string
    eyes?: string
    build?: string
    distinguishing?: string
  } | null
  bandIndex: number
  expression: SpriteExpression
  engorged: boolean
  fluidType: string
}

/** The one-framing-per-set contract; plain background is load-bearing for matting. */
export const SPRITE_FRAMING_TAGS: readonly string[] = [
  'solo',
  'full body',
  'standing',
  'facing viewer',
  'looking at viewer',
  'plain simple background',
  'white background',
  'neutral studio lighting',
]

const EXPRESSION_MOMENTS: Record<SpriteExpression, string[]> = {
  positive: ['pleasure'],
  neutral: [],
  distressed: ['embarrassed'],
  flushed: ['pleasure'],
}

const FLUSH_CUE = 'flushed, visibly aroused expression'
const engorgedCue = (fluidType: string): string =>
  `breasts visibly engorged, taut and heavy with ${fluidType}`

function identityExcerpt(d: SpriteCellInput['visualDescriptors']): string | undefined {
  if (!d) return undefined
  const joined = [d.face, d.hair, d.eyes, d.build, d.distinguishing]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join('; ')
  return joined || undefined
}

/** Structured spec for the si-bridge path. */
export function buildSpriteSpec(input: SpriteCellInput): StructuredImageSpecInput {
  const beMoments = [...EXPRESSION_MOMENTS[input.expression]]
  const extraTags: string[] = []
  if (input.expression === 'flushed') extraTags.push(FLUSH_CUE)
  if (input.engorged) {
    beMoments.push('strain')
    extraTags.push(engorgedCue(input.fluidType))
  }

  const spec: StructuredImageSpecInput = {
    register: 'color',
    style_preset: 'semireal',
    intimacy: 'clean',
    characters: [
      {
        tier_index: bandRepresentativeTier(input.bandIndex),
        appearance_excerpt: identityExcerpt(input.visualDescriptors),
      },
    ],
    scene_tags: [...SPRITE_FRAMING_TAGS],
  }
  if (beMoments.length > 0) spec.be_moments = beMoments
  if (extraTags.length > 0) spec.extra_tags = extraTags
  return spec
}

/** Prompt fallback for external providers — banded, framed, prompt-only. */
export function buildSpritePrompt(input: SpriteCellInput): string {
  const tier = bandRepresentativeTier(input.bandIndex)
  const parts: string[] = [
    ...SPRITE_FRAMING_TAGS,
    bandWord(tier),
    ...EXPRESSION_MOMENTS[input.expression].map((m) => m.replace(/_/g, ' ')),
  ]
  if (input.expression === 'flushed') parts.push(FLUSH_CUE)
  if (input.engorged) parts.push(engorgedCue(input.fluidType))
  const appearance = identityExcerpt(input.visualDescriptors)
  if (appearance) parts.push(appearance)
  return parts.join(', ')
}
