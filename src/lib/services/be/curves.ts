/**
 * BE engine — the corrected measurement closed-forms (research/38).
 *
 * The mass/volume spine is the validated NAI quadratic (untouched). Bust is now a
 * RUNTIME closed-form instead of a baked spine curve: the spine's P6 ptosis
 * partition under-read forward projection ~35% against the one hard real-world
 * anchor (Norma Stitz: measured 178 cm bust at ~19 L/side; the spine gave ~154).
 * Ruling C1: keep the validated small-size dome, anchor the large end to reality
 * with linear-dimension (V^1/3) scaling. Cup letters derive from the same
 * closed-form at the reference frame, 1 inch of bust−band per letter (ruling C4:
 * strict re-anchor — tier 47 ≈ T-cup, true X-cup ≈ tier 65).
 */

import { MEASUREMENT_CONSTANTS } from './ladder-data'
import type { BodyBaseline, BodyShape } from './types'

const K = MEASUREMENT_CONSTANTS

// Hand-ported spine tables (ambrosia-v0.4.7.naiscript:946-968) — byte-identical values.
export const SHAPE_CIRC_SPREAD: Readonly<Record<BodyShape, number>> = {
  natural: 1.15,
  firm: 1.0,
  gravity_defying: 0.85,
}
const SHAPE_PROJECTION_LAW: Readonly<Record<BodyShape, { k: number; div: number }>> = {
  natural: { k: 0.3, div: 10 },
  firm: { k: 0.4, div: 6 },
  gravity_defying: { k: 0.5, div: 4 },
}
export const BUILD_BAND_OFFSET: Readonly<Record<string, number>> = {
  petite: 3,
  slim: 4,
  average: 5,
  curvy: 8,
  athletic: 5,
  full: 10,
}
/** Typical baseline breast mass already inside the frame estimate (naiscript:952). */
export const BASELINE_BREAST_KG = 1.0

// research/38 C1 anchors (D5: tuning constants; the 30 cm @ 19 L point is Norma
// Stitz's measured bust−band ÷ (2 × natural spread) — the one hard real anchor).
const ANCHOR_PROJ_CM = 30
const ANCHOR_VOL_ML = 19_000
const BLEND_LO_ML = 1350 // validated classic-dome region ends (spine P6 window)
const BLEND_HI_ML = 1850 // fully on the anchored curve
const REF_WAIST_CM = 61 // spine BASELINE_WAIST_CM (reference frame)

const clampTier = (tier: number): number =>
  Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0
const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

/** Dry tissue mass per side (kg) — the validated NAI quadratic at reference frame. */
export function dryKgPerSide(tier: number): number {
  const t = clampTier(tier)
  return K.baseWeightConst + K.baseWeightLinear * t + K.baseWeightQuad * t * t
}

/** Tissue volume per side (ml) — mass over the validated density. */
export function tissueVolMlPerSide(tier: number): number {
  return dryKgPerSide(tier) / K.tissueDensityKgPerCm3
}

/** Fluid capacity per side (ml) — tissue volume × the NAI milk fraction. */
export function capacityMlPerSide(tier: number): number {
  return tissueVolMlPerSide(tier) * K.milkFraction
}

/** Current fluid load per side (ml) at a fill level. */
export function fillMlPerSide(tier: number, fillPercent: number): number {
  return capacityMlPerSide(tier) * (clampPercent(fillPercent) / 100)
}

/** Current mass per side (kg) at a fill level (fluid at milk density). */
export function nowKgPerSide(tier: number, fillPercent: number): number {
  return dryKgPerSide(tier) + (fillMlPerSide(tier, fillPercent) * K.milkDensity) / 1000
}

/**
 * Corrected forward projection (cm) — research/38 C1. Classic validated dome for
 * small volumes; real-anchored V^(1/3) curve past the blend window; effective
 * volume includes the current fluid load (engorgement projects honestly).
 */
export function bustProjectionCm(tier: number, shape: BodyShape, fillPercent = 0): number {
  const t = clampTier(tier)
  const fill = clampPercent(fillPercent)
  const vol = tissueVolMlPerSide(t) + fillMlPerSide(t, fill)
  const law = SHAPE_PROJECTION_LAW[shape] ?? SHAPE_PROJECTION_LAW.natural
  const baseR = Math.cbrt((3 * vol) / (2 * Math.PI))
  const flatten = Math.min(1, 0.7 + 0.015 * t)
  let shapeFactor = 1 + law.k * Math.log(1 + t / law.div)
  if (fill > 0) shapeFactor += 0.15 * Math.pow(fill / 100, 1.5)
  const dome = baseR * flatten * shapeFactor
  const anchored = ANCHOR_PROJ_CM * Math.cbrt(vol / ANCHOR_VOL_ML)
  if (vol <= BLEND_LO_ML) return dome
  if (vol >= BLEND_HI_ML) return anchored
  const w = (vol - BLEND_LO_ML) / (BLEND_HI_ML - BLEND_LO_ML)
  return dome * (1 - w) + anchored * w
}

/** Bust − band (cm): the tape difference the cup letter rides. Band-independent. */
export function bustDiffCm(tier: number, shape: BodyShape, fillPercent = 0): number {
  const spread = SHAPE_CIRC_SPREAD[shape] ?? 1.0
  return 2 * bustProjectionCm(tier, shape, fillPercent) * spread
}

/**
 * Resolve the build key: explicit baseline build wins; else inferred from stored
 * waist (and hips) vs height (research/38 C3b — D5-tunable bands); else average.
 */
export function resolveBuild(baseline?: BodyBaseline): string {
  const explicit = baseline?.build
  if (explicit && explicit in BUILD_BAND_OFFSET) return explicit
  const waist = baseline?.waistCm
  if (!waist || waist <= 0) return 'average'
  const height = baseline?.heightCm && baseline.heightCm >= 100 ? baseline.heightCm : K.refHeightCm
  const whtr = waist / height
  let build =
    whtr <= 0.36
      ? 'petite'
      : whtr <= 0.4
        ? 'slim'
        : whtr <= 0.44
          ? 'average'
          : whtr <= 0.49
            ? 'curvy'
            : 'full'
  const hips = baseline?.hipsCm
  if (hips && hips - waist >= 26) {
    if (build === 'petite') build = 'slim'
    else if (build === 'slim') build = 'average'
    else if (build === 'average') build = 'curvy'
  }
  return build
}

/** Underbust band (cm): waist + build offset (spine convention; reference waist 61). */
export function bandCm(baseline?: BodyBaseline): number {
  const waist = baseline?.waistCm && baseline.waistCm > 0 ? baseline.waistCm : REF_WAIST_CM
  return waist + (BUILD_BAND_OFFSET[resolveBuild(baseline)] ?? 5)
}

/** Bust circumference (cm) on the character's own band — the corrected model. */
export function bustCmFor(
  tier: number,
  shape: BodyShape,
  fillPercent = 0,
  baseline?: BodyBaseline,
): number {
  return bandCm(baseline) + bustDiffCm(tier, shape, fillPercent)
}

// ── Derived cup-letter ladder (ruling C4: 1 inch of reference-frame diff per letter) ──

const CM_PER_LETTER = 2.54
const CANONICAL_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'DD',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const
const ZZ_MIN_INDEX = CANONICAL_LETTERS.length + 1 // 27
const ZZ_PLUS_MIN_INDEX = ZZ_MIN_INDEX + 3 // 30

/** Cup letter for a tier — derived from the corrected diff at the reference frame. */
export function letterForTier(tier: number): string {
  const inches = bustDiffCm(clampTier(tier), 'natural', 0) / CM_PER_LETTER
  const idx = Math.max(1, Math.round(inches))
  if (idx <= CANONICAL_LETTERS.length) return CANONICAL_LETTERS[idx - 1]
  if (idx < ZZ_PLUS_MIN_INDEX) return 'ZZ'
  return 'ZZ+'
}

const MAX_ANCHOR_TIER = 400
let anchorCache: Readonly<Record<string, number>> | null = null

/** Letter → first tier reaching it (for card seeding / text sniffing). */
export function letterTierAnchors(): Readonly<Record<string, number>> {
  if (anchorCache) return anchorCache
  const anchors: Record<string, number> = {}
  for (let t = 0; t <= MAX_ANCHOR_TIER; t++) {
    const letter = letterForTier(t)
    if (!(letter in anchors)) anchors[letter] = t
  }
  anchorCache = anchors
  return anchors
}
