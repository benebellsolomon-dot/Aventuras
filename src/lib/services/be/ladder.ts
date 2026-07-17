/**
 * BE engine — the tier ladder: pure derivations off the canonical tier scalar.
 *
 * Everything here is a lookup into the generated NAI v0.4.7 tables (ladder-data.ts).
 * One canonical scalar, everything else a pure tested function of it (31a lesson 1).
 * The letter table is bounded and saturates into 'ZZ+' past its last rung — the D1
 * ruling's "bounded derived letter table, named descriptors past Z".
 */

import {
  BAND_WORD_THRESHOLDS,
  COMPARATIVE_BANDS,
  CUP_LETTER_THRESHOLDS,
  LETTER_TO_TIER,
} from './ladder-data'

const clampTier = (tier: number): number =>
  Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0

/** Derived cup letter (bounded table; saturates at the top rung). */
export function cupLetter(tier: number): string {
  const t = clampTier(tier)
  let cup = CUP_LETTER_THRESHOLDS[0].cup
  for (const row of CUP_LETTER_THRESHOLDS) {
    if (t >= row.minTier) cup = row.cup
    else break
  }
  return cup
}

/** Derived size-band word (NAI tierToCupTag convention — see the ladder-data calibration note). */
export function bandWord(tier: number): string {
  const t = clampTier(tier)
  let word = BAND_WORD_THRESHOLDS[0].word
  for (const row of BAND_WORD_THRESHOLDS) {
    if (t >= row.minTier) word = row.word
    else break
  }
  return word
}

/** Validated size-only comparative prose for the tier (51 bands, saturating). */
export function comparative(tier: number): string {
  const t = clampTier(tier)
  for (const band of COMPARATIVE_BANDS) {
    if (t <= band.tierMax) return band.description
  }
  return COMPARATIVE_BANDS[COMPARATIVE_BANDS.length - 1].description
}

/**
 * The image-facing size phrase. Today this is the band word — sizeBandMarker.ts
 * derives the bridge's `__betier__` marker from exactly this vocabulary, so emitting
 * it keeps the engine→image contract unchanged until the cross-calibration ruling
 * (research/34 §2 B2 note).
 */
export function imageSizePhrase(tier: number): string {
  return bandWord(tier)
}

/** Reverse map for card seeding: cup letter → canonical tier anchor. Null when unknown. */
export function tierForCupLetter(letter: string): number | null {
  const key = String(letter || '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]?CUPS?$/, '')
  if (!key) return null
  const tier = LETTER_TO_TIER[key]
  return typeof tier === 'number' && Number.isFinite(tier) ? tier : null
}

/** Index of the tier's band among the band thresholds (monotonicity canary support). */
export function bandIndex(tier: number): number {
  const t = clampTier(tier)
  let idx = 0
  for (let i = 0; i < BAND_WORD_THRESHOLDS.length; i++) {
    if (t >= BAND_WORD_THRESHOLDS[i].minTier) idx = i
    else break
  }
  return idx
}
