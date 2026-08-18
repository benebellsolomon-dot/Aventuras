/**
 * BE engine — the tier ladder: pure derivations off the canonical tier scalar.
 *
 * Comparatives and band words are lookups into the generated NAI v0.4.7 tables
 * (ladder-data.ts). Cup letters are DERIVED from the corrected bust-diff
 * closed-form (research/38 C4: strict re-anchor, 1 inch of reference-frame
 * bust−band per letter — tier 47 ≈ T-cup, true X-cup ≈ tier 64), saturating
 * into 'ZZ'/'ZZ+' at the top. One canonical scalar, everything else a pure
 * tested function of it (31a lesson 1).
 */

import { BAND_WORD_THRESHOLDS, COMPARATIVE_BANDS } from './ladder-data'
import { letterForTier, letterTierAnchors } from './curves'

const clampTier = (tier: number): number =>
  Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0

/** Derived cup letter (corrected-math ladder; saturates at the top). */
export function cupLetter(tier: number): string {
  return letterForTier(clampTier(tier))
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

/**
 * Reverse map for card seeding: cup letter → first tier reaching it (derived
 * anchors). Doubled letters outside the canonical ladder (FF, GG, …) resolve to
 * their base letter's anchor. Null when unknown.
 */
export function tierForCupLetter(letter: string): number | null {
  const key = String(letter || '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]?CUPS?$/, '')
  if (!key) return null
  const anchors = letterTierAnchors()
  if (key in anchors) return anchors[key]
  // A/B sit below the genre floor (tier 0 is already C — documented ruling in
  // curves.ts): clamp them to tier 0 so "A-cup" cards seed instead of failing.
  if (key === 'A' || key === 'B') return 0
  // Legacy doubled letters (FF/GG/HH/…): use the base letter's anchor.
  if (key.length >= 2 && /^([A-Z])\1+$/.test(key)) {
    const base = key[0]
    if (base in anchors) return anchors[base]
  }
  return null
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
 * Position of the tier within its band: 0 at the band floor, 1 at the last
 * tier before the next band. The open-ended top band uses a nominal 10-tier
 * span and saturates at 1. Lets image prompts reinforce WHERE in a band a
 * character sits — "huge breasts" at tier 29 should render larger than at 22.
 */
export function bandPosition(tier: number): number {
  const t = clampTier(tier)
  const idx = bandIndex(t)
  const floor = BAND_WORD_THRESHOLDS[idx].minTier
  const next = BAND_WORD_THRESHOLDS[idx + 1]?.minTier ?? floor + 10
  const span = Math.max(1, next - floor)
  return Math.min(1, (t - floor) / span)
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
