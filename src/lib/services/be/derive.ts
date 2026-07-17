/**
 * BE engine — grounding facts for prose honesty (D4-thin derivation set).
 *
 * The NAI v0.4.7 comparatives were deliberately re-keyed SIZE-only because posture
 * and motion are shape-dependent (a magically supported bust at the same tier moves
 * differently). This module keeps that separation: posture/mobility/clothing come
 * from a coarse (tier, shape) table whose thresholds are lifted from the validated
 * ladder milestones (ambrosia-st research/ladder-reanchor-proposal.md).
 *
 * ⚠ D4 is RE-OPENED (research/31 status header): a dedicated research task decides
 * whether this thin table is enough for honest narration or whether the physics
 * derivations get ported. Keep the seam here — callers only ever see GroundingFacts.
 */

import type { BodyShape, GroundingFacts } from './types'

interface GroundingRow {
  minTier: number
  posture: string
  mobility: string
  clothing: string
}

/** Thresholds distilled from the validated 51-band ladder's own milestone language. */
const GROUNDING_ROWS: ReadonlyArray<GroundingRow> = [
  {
    minTier: 0,
    posture: 'unburdened',
    mobility: 'unrestricted',
    clothing: 'standard sizes fit',
  },
  {
    minTier: 13,
    posture: 'subtle back strain by evening',
    mobility: 'unrestricted',
    clothing: 'custom bras; fitted tops strain',
  },
  {
    minTier: 20,
    posture: 'gentle forward lean',
    mobility: 'adjusts her gait; braces when rising',
    clothing: 'requires custom support',
  },
  {
    minTier: 26,
    posture: 'shoulders drawn forward under the weight',
    mobility: 'needs support for long standing',
    clothing: 'custom-made only',
  },
  {
    minTier: 31,
    posture: 'permanent forward bow',
    mobility: 'braces to rise; stairs are slow',
    clothing: 'improvised wraps; nothing standard fits',
  },
  {
    minTier: 39,
    posture: 'cannot stand straight unaided',
    mobility: 'cannot rise without bracing against them',
    clothing: 'impractical — draped fabric at best',
  },
  {
    minTier: 47,
    posture: 'bowed beneath their mass',
    mobility: 'mostly stationary unless supported',
    clothing: 'impractical',
  },
  {
    minTier: 58,
    posture: 'her frame is a pedestal for them',
    mobility: 'they rest on whatever surface is beneath her; moving is a project',
    clothing: 'impractical',
  },
  {
    minTier: 82,
    posture: 'immobilized by scale',
    mobility: 'the room accommodates her, not the reverse',
    clothing: 'impractical',
  },
]

/**
 * Grounding facts for (tier, shape). `gravity_defying` (magical support) neutralizes
 * the weight burden — the genre's mobility escape hatch — while size facts (letter,
 * band, comparative) remain governed by the ladder.
 */
export function groundingFacts(tier: number, shape: BodyShape): GroundingFacts {
  const t = Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0
  if (shape === 'gravity_defying') {
    return {
      posture: 'held impossibly high and light — posture unaffected',
      mobility: 'carries them as if weightless',
      clothing: t >= 20 ? 'requires custom tailoring for sheer coverage' : 'standard sizes fit',
    }
  }
  let row = GROUNDING_ROWS[0]
  for (const candidate of GROUNDING_ROWS) {
    if (t >= candidate.minTier) row = candidate
    else break
  }
  return { posture: row.posture, mobility: row.mobility, clothing: row.clothing }
}
