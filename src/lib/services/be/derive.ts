/**
 * BE engine — grounding facts for prose honesty.
 *
 * Since the D4 depth-(b) bake (research/35 §3.4), these are the VERBATIM NAI
 * posture/mobility/clothing rungs selected by the moment model at reference
 * frame, generated per (tier, shape) into ladder-data.ts — including the
 * gravity_defying column (magical support eases the whole burden channel in
 * the spine itself, so no hand-authored escape hatch remains). The shape
 * descriptor + hang channel live beside them via measurements.bodyRow.
 */

import { bodyRow } from './measurements'
import type { BodyShape, GroundingFacts } from './types'

/** Posture/mobility/clothing for (tier, shape) — baked NAI rung parity. */
export function groundingFacts(tier: number, shape: BodyShape): GroundingFacts {
  const row = bodyRow(tier, shape)
  return { posture: row.posture, mobility: row.mobility, clothing: row.clothing }
}
