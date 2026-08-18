/**
 * BE engine — sprite selection core (Spec 4 V2a Task 1).
 *
 * Pure and deterministic: which of a character's 35 sprite cells (7 bands ×
 * (4 expression clusters + 1 engorged cell)) the current bodyState selects,
 * which tier represents a band on renders, and the appearance hash + seed that
 * scope a sprite SET's validity. No Date.now / Math.random — the seed derives
 * from a sync content hash so replays and retries render identically.
 *
 * This module never imports from ai/image/ (the dependency runs the other way).
 */

import { ENGORGED_FILL_THRESHOLD } from './constants'
import { bandIndex } from './ladder'
import type { BodyShape, BodyState } from './types'

/** The 4 expression clusters (Ben's 35-cell ruling: flushed is first-class). */
export type SpriteExpression = 'positive' | 'neutral' | 'distressed' | 'flushed'

export interface SpriteSelection {
  bandIndex: number
  expression: SpriteExpression
  engorged: boolean
}

/** Arousal threshold for the flushed cluster — matches imageStateCues' flush cue. */
export const SPRITE_AROUSAL_FLUSH_THRESHOLD = 70

/**
 * Band-representative render tier per band index — the sizeBandMarker anchors,
 * already calibrated against the bridge ladder (top-of-band reads truest).
 */
export const BAND_SPRITE_TIER: readonly number[] = [0, 3, 13, 21, 29, 39, 45]

export function bandRepresentativeTier(band: number): number {
  const clamped = Math.min(BAND_SPRITE_TIER.length - 1, Math.max(0, Math.floor(band)))
  return BAND_SPRITE_TIER[clamped]
}

/**
 * Select the sprite cell for a body state. Precedence (Spec 4, tunable OD#S8):
 * engorged pins the band's single engorged cell (strain look) → landed growth
 * shows shock → arousal flush → transformation attitude, defaulting neutral.
 */
export function selectSprite(state: BodyState): SpriteSelection {
  const band = bandIndex(state.tier)

  if (state.fluids.fillPercent >= ENGORGED_FILL_THRESHOLD) {
    return { bandIndex: band, expression: 'distressed', engorged: true }
  }
  if ((state.lastGrowth?.delta ?? 0) > 0) {
    return { bandIndex: band, expression: 'distressed', engorged: false }
  }
  if ((state.arousal ?? 0) >= SPRITE_AROUSAL_FLUSH_THRESHOLD) {
    return { bandIndex: band, expression: 'flushed', engorged: false }
  }
  switch (state.attitude) {
    case 'craving':
    case 'accepting':
      return { bandIndex: band, expression: 'positive', engorged: false }
    case 'fearful':
    case 'resentful':
      return { bandIndex: band, expression: 'distressed', engorged: false }
    default:
      return { bandIndex: band, expression: 'neutral', engorged: false }
  }
}

/**
 * Identity-stable inputs that scope a sprite set. clothing/accessories are
 * DELIBERATELY absent (they churn per-scene and would thrash all 35 cells —
 * the pixelsaga cache-churn failure), as is fluidType (cell-level, not
 * set-level). The anchor is approved for this same hash.
 */
export interface SpriteAppearanceInput {
  visualDescriptors: {
    face?: string
    hair?: string
    eyes?: string
    build?: string
    distinguishing?: string
  } | null
  /** Curated image-tag bank; part of the identity hash so edits invalidate cached sprites. */
  imageTags?: string | null
  /** Per-character LoRA binding; part of the identity hash so edits invalidate cached sprites. */
  loraConfig?: {
    name?: string
    triggerWords?: string
    baseWeight?: number
    tierScale?: number
    maxWeight?: number
  } | null
  shape: BodyShape
  stylePreset: string
  register: string
}

// Unit separator: field boundaries must survive concatenation ('long silv' +
// 'erblue' must not hash like 'long silver' + 'blue').
const HASH_SEPARATOR = '\u001f'

// FNV-1a 32-bit — small, sync, dependency-free (crypto.subtle is async and
// would force the whole selection layer async for no security benefit).
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const normalize = (value: string | undefined): string => (value ?? '').trim().toLowerCase()

/** Hex hash of the identity-stable appearance — sprite-set + anchor validity key. */
export function spriteAppearanceHash(input: SpriteAppearanceInput): string {
  const d = input.visualDescriptors
  const fields = [
    normalize(d?.face),
    normalize(d?.hair),
    normalize(d?.eyes),
    normalize(d?.build),
    normalize(d?.distinguishing),
    input.shape,
    normalize(input.stylePreset),
    normalize(input.register),
  ]
  // The image-tag bank participates in identity only when set — appended as a
  // distinct segment so characters WITHOUT a bank keep their existing hash
  // (no mass sprite/anchor invalidation), while editing a bank regenerates.
  const bank = normalize(input.imageTags ?? undefined)
  if (bank) fields.push(`imgtags:${bank}`)
  // The LoRA binding likewise participates only when set — the stable fields
  // (name/weights/triggers) that change the rendered output, appended as one
  // segment so editing the LoRA regenerates the set without touching others.
  const lora = input.loraConfig
  if (lora && (lora.name || lora.triggerWords)) {
    const parts = [
      normalize(lora.name),
      normalize(lora.triggerWords),
      lora.baseWeight ?? '',
      lora.tierScale ?? '',
      lora.maxWeight ?? '',
    ].join('|')
    fields.push(`lora:${parts}`)
  }
  return fnv1a(fields.join(HASH_SEPARATOR)).toString(16).padStart(8, '0')
}

/** Deterministic per-set seed — every cell of a character's set shares it. */
export function spriteSeed(characterId: string, appearanceHash: string): number {
  return fnv1a(`${characterId}:${appearanceHash}`)
}
