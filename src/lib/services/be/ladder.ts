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

/**
 * Sniff a tier from free text (card descriptions, visual descriptors) for
 * auto-seeding. Order: explicit "<letter>-cup" mention (global scan, first
 * RESOLVABLE letter wins — word-embedded pseudo-letters like "teacup" resolve to
 * nothing and are skipped, the NAI sniff lesson), then band vocabulary. Null when
 * neither appears.
 */
export function sniffTierFromText(text: string): number | null {
  const s = String(text || '')
  const cupRe = /\b([A-Za-z]{1,3})[-\s]?cups?\b/gi
  let match: RegExpExecArray | null
  while ((match = cupRe.exec(s)) !== null) {
    const tier = tierForCupLetter(match[1])
    if (tier !== null) return tier
  }
  for (let i = BAND_WORD_THRESHOLDS.length - 1; i >= 0; i--) {
    const row = BAND_WORD_THRESHOLDS[i]
    if (new RegExp(row.word.replace(/ /g, '[\\s,]+'), 'i').test(s)) return row.minTier
  }
  return null
}

// Derived from the ladder's own band table so a future band word can't drift out
// of the replacement vocabulary (a literal copy here silently stopped matching
// new bands).
const ALL_BAND_WORDS_PATTERN = new RegExp(
  `\\b(?:${BAND_WORD_THRESHOLDS.map((row) => row.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
)

/**
 * Ground an image prompt's size vocabulary in the canonical tier (research/31
 * §2.3): the engine's derived band word replaces whatever size band the model
 * wrote, or is appended when the model wrote none. The model's words become a
 * fallback, never the source of truth. Callers must only pass a tier when it is
 * unambiguous for the prompt (see uniformBodyStateTier — a multi-character
 * prompt with different bands must NOT be grounded to one character's size).
 */
export function groundImagePromptSize(prompt: string, tier: number): string {
  const canonical = bandWord(tier)
  const hasBandWords = ALL_BAND_WORDS_PATTERN.test(prompt)
  ALL_BAND_WORDS_PATTERN.lastIndex = 0
  if (hasBandWords) {
    return prompt.replace(ALL_BAND_WORDS_PATTERN, canonical)
  }
  return `${prompt.trimEnd().replace(/[.,]$/, '')}, ${canonical}`
}
