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
import { curatedIdentityTags, resolveIdentityTags, mapBridgeBuild } from './bridgeSpec'
import {
  bandRepresentativeTier,
  bandWord,
  imageSizeAnchor,
  type SpriteExpression,
} from '$lib/services/be'

export interface SpriteCellInput {
  name: string
  visualDescriptors: {
    face?: string
    hair?: string
    eyes?: string
    build?: string
    clothing?: string
    distinguishing?: string
  } | null
  /** Curated image-tag bank; overrides derived identity tags when set. */
  imageTags?: string | null
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

/**
 * Identity for the prompt fallback: the curated tag bank wins (same authority
 * order as the bridge spec — size vocabulary already stripped), descriptors
 * excerpt otherwise. Keeps online-provider sprites on the locked identity
 * instead of a free-text paraphrase.
 */
function identityFallback(
  imageTags: string | null | undefined,
  d: SpriteCellInput['visualDescriptors'],
): string | undefined {
  return curatedIdentityTags(imageTags)?.join(', ') ?? identityExcerpt(d)
}

// The engine invariant: the engorged cell always wears the strain/distressed
// look — normalizing here keeps a naive 7×5 enumerator from minting off-spec
// cells like (positive, engorged).
const cellExpression = (input: SpriteCellInput): SpriteExpression =>
  input.engorged ? 'distressed' : input.expression

/** Structured spec for the si-bridge path. */
export function buildSpriteSpec(input: SpriteCellInput): StructuredImageSpecInput {
  const expression = cellExpression(input)
  const beMoments = [...EXPRESSION_MOMENTS[expression]]
  const extraTags: string[] = []
  if (expression === 'flushed') extraTags.push(FLUSH_CUE)
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
        build: mapBridgeBuild(input.visualDescriptors?.build),
        identity_tags: resolveIdentityTags(input.imageTags, input.visualDescriptors),
        appearance_excerpt: identityExcerpt(input.visualDescriptors),
      },
    ],
    scene_tags: [...clothingSceneTags(input), ...SPRITE_FRAMING_TAGS],
  }
  if (beMoments.length > 0) spec.be_moments = beMoments
  if (extraTags.length > 0) spec.extra_tags = extraTags
  return spec
}

// Canonical outfit on every cell — the appearance hash excludes clothing, so
// the outfit is set-stable by design; burst cells tear it via be_moments.
function clothingSceneTags(input: SpriteCellInput): string[] {
  const clothing = input.visualDescriptors?.clothing?.trim()
  return clothing ? [`wearing ${clothing}`] : []
}

/**
 * Anchor render spec: the character at their OWN tier (Ben's seed-tier ruling —
 * the "at rest" look), neutral, on the shared framing. Stored raw/un-matted as
 * the FaceID/pose source every cell renders from.
 */
export function buildAnchorSpec(
  tier: number,
  visualDescriptors: SpriteCellInput['visualDescriptors'],
): StructuredImageSpecInput {
  return {
    register: 'color',
    style_preset: 'semireal',
    intimacy: 'clean',
    characters: [
      {
        tier_index: Math.max(0, Math.round(tier)),
        appearance_excerpt: identityExcerpt(visualDescriptors),
      },
    ],
    scene_tags: [...SPRITE_FRAMING_TAGS],
  }
}

/** Anchor prompt fallback for external providers. */
export function buildAnchorPrompt(
  tier: number,
  visualDescriptors: SpriteCellInput['visualDescriptors'],
  imageTags?: string | null,
): string {
  const anchorTier = Math.max(0, Math.round(tier))
  const parts: string[] = [...SPRITE_FRAMING_TAGS, bandWord(anchorTier)]
  const sizeAnchor = imageSizeAnchor(anchorTier)
  if (sizeAnchor) parts.push(sizeAnchor)
  const appearance = identityFallback(imageTags, visualDescriptors)
  if (appearance) parts.push(appearance)
  return parts.join(', ')
}

/** Prompt fallback for external providers — banded, framed, prompt-only. */
export function buildSpritePrompt(input: SpriteCellInput): string {
  const tier = bandRepresentativeTier(input.bandIndex)
  const expression = cellExpression(input)
  const parts: string[] = [
    ...SPRITE_FRAMING_TAGS,
    bandWord(tier),
    ...EXPRESSION_MOMENTS[expression].map((m) => m.replace(/_/g, ' ')),
  ]
  const sizeAnchor = imageSizeAnchor(tier)
  if (sizeAnchor) parts.push(sizeAnchor)
  if (expression === 'flushed') parts.push(FLUSH_CUE)
  if (input.engorged) parts.push(engorgedCue(input.fluidType))
  const appearance = identityFallback(input.imageTags, input.visualDescriptors)
  if (appearance) parts.push(appearance)
  parts.push(...clothingSceneTags(input))
  return parts.join(', ')
}
