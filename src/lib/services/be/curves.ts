/**
 * BE engine — the corrected measurement closed-forms (research/38 + the
 * independent 3-agent audit, research/39).
 *
 * The mass/volume spine is the validated NAI quadratic (untouched). Bust is a
 * runtime closed-form: the NATURAL-shape backbone (validated small-size dome →
 * real-anchored V^(1/3) curve, pinned to the one primary-source measurement:
 * Norma Stitz, Guinness-recorded 177.8 cm bust on a 109.2 cm band = 68.6 cm
 * diff at her scale). Shape enters ONCE as a tape multiplier in the STANDING
 * measurement order (geometry audit: compact/forward gravity_defying reads
 * bigger on a standing tape; pendulous natural partially escapes below the
 * tape line — its extra length lives in the droop channel instead). Fill acts
 * through effective volume only (branch-independent, monotone). Cup letters
 * derive from the natural backbone at the reference frame, 1 inch of bust−band
 * per letter (ruling C4: tier 47 ≈ T-cup, true X-cup ≈ tier 64).
 *
 * Documented approximations (audit-accepted): the genre floor is C (tier 0
 * already carries ~2.9 in of diff — A/B are unreachable by design, matching
 * the NAI ladder's t0=C); the band is the underbust (bust-height torso
 * widening ~4 cm is absorbed by the anchor fit); torso width beyond the build
 * offsets is not modeled (±20% frame ⇒ ∓9% diff at moderate sizes, ∓3% huge).
 */

import { MEASUREMENT_CONSTANTS } from './ladder-data'
import type { BodyBaseline, BodyShape } from './types'

const K = MEASUREMENT_CONSTANTS

// Natural-backbone constants: dome law from the spine (natural row of
// SHAPE_PROJECTION_LAW, naiscript:968) + the spine's natural circumferential
// spread (naiscript:946). The backbone IS the pinned curve — do not re-tune
// one without re-pinning the Norma anchor test.
const DOME_LAW_K = 0.3
const DOME_LAW_DIV = 10
const NATURAL_SPREAD = 1.15

/**
 * Standing-tape shape multipliers (research/39, geometry audit defects 1–3):
 * one modest, size-consistent factor replacing the old two-branch shape math
 * (which inverted ordering vs standing physics, opened a 35% gap, and made
 * gravity_defying non-monotonic). σ=0.10 around firm; natural is the pinned
 * backbone (Norma is natural), so firm/gd scale up from it.
 */
export const SHAPE_TAPE_MULT: Readonly<Record<BodyShape, number>> = {
  natural: 1.0,
  firm: 1.111,
  gravity_defying: 1.222,
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

// research/38 C1 anchors. The 19,000 ml volume coordinate is a scaling gauge,
// not a measured quantity (audit report A): the empirically real content is
// "projection 30 cm ↔ diff 68.6 cm", which Guinness's circumferences confirm.
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

/** Current mass per side (kg) at a fill level; density defaults to milk (Spec 1
 * Task 2 threads the story fluid's density through measurements()). */
export function nowKgPerSide(
  tier: number,
  fillPercent: number,
  fluidDensity: number = K.milkDensity,
): number {
  return dryKgPerSide(tier) + (fillMlPerSide(tier, fillPercent) * fluidDensity) / 1000
}

/**
 * Natural-backbone forward projection (cm) — research/38 C1, audit-hardened
 * (research/39). Classic validated dome for small volumes; real-anchored
 * V^(1/3) curve past the blend window. Effective volume includes the current
 * fluid load — fill acts through volume ONLY (the old dome-only engorgement
 * bump was branch-inconsistent; geometry audit defect 5).
 */
export function bustProjectionCm(tier: number, fillPercent = 0): number {
  const t = clampTier(tier)
  const vol = tissueVolMlPerSide(t) + fillMlPerSide(t, clampPercent(fillPercent))
  const baseR = Math.cbrt((3 * vol) / (2 * Math.PI))
  const flatten = Math.min(1, 0.7 + 0.015 * t)
  const shapeFactor = 1 + DOME_LAW_K * Math.log(1 + t / DOME_LAW_DIV)
  const dome = baseR * flatten * shapeFactor
  const anchored = ANCHOR_PROJ_CM * Math.cbrt(vol / ANCHOR_VOL_ML)
  if (vol <= BLEND_LO_ML) return dome
  if (vol >= BLEND_HI_ML) return anchored
  const w = (vol - BLEND_LO_ML) / (BLEND_HI_ML - BLEND_LO_ML)
  return dome * (1 - w) + anchored * w
}

/**
 * Bust − band (cm): the tape difference the cup letter rides. Band-independent.
 * Natural backbone × the standing-order shape multiplier (all shapes inherit
 * the backbone's monotonicity — geometry audit defects 1–2 closed).
 */
export function bustDiffCm(tier: number, shape: BodyShape, fillPercent = 0): number {
  const mult = SHAPE_TAPE_MULT[shape] ?? 1.0
  return 2 * bustProjectionCm(tier, fillPercent) * NATURAL_SPREAD * mult
}

// Anatomy input validation (adversarial finding 3): tier/fill were clamped but
// anatomy wasn't — an Infinity waist rendered an Infinity bust. Insane values
// are treated as absent (fall back to reference/estimate), matching the
// tier/fill discipline.
const saneOrUndef = (value: number | undefined, lo: number, hi: number): number | undefined =>
  Number.isFinite(value) && (value as number) >= lo && (value as number) <= hi
    ? (value as number)
    : undefined
export const saneWaistCm = (v?: number): number | undefined => saneOrUndef(v, 30, 300)
export const saneHipsCm = (v?: number): number | undefined => saneOrUndef(v, 30, 400)
export const saneHeightCm = (v?: number): number | undefined => saneOrUndef(v, 100, 250)
export const saneWeightKg = (v?: number): number | undefined => saneOrUndef(v, 20, 500)

/**
 * Smooth inferred-build curve (adversarial finding 2): when build is inferred,
 * band offset and frame-weight mod interpolate continuously over the
 * waist-to-height ratio instead of stepping at label thresholds — a 1 cm waist
 * edit can no longer jump bust ±4 cm and weight ±4 kg. Wide hips shift the
 * effective ratio smoothly instead of bumping a whole step. Anchor centers:
 */
const BUILD_CURVE: ReadonlyArray<{ whtr: number; offset: number; mod: number }> = [
  { whtr: 0.34, offset: 3, mod: -8 }, // petite
  { whtr: 0.38, offset: 4, mod: -4 }, // slim
  { whtr: 0.42, offset: 5, mod: 0 }, // average
  { whtr: 0.465, offset: 8, mod: 4 }, // curvy
  { whtr: 0.51, offset: 10, mod: 8 }, // full
]

function effectiveWhtr(baseline?: BodyBaseline): number | null {
  const waist = saneWaistCm(baseline?.waistCm)
  if (waist === undefined) return null
  const height = saneHeightCm(baseline?.heightCm) ?? K.refHeightCm
  const hips = saneHipsCm(baseline?.hipsCm)
  const hipFactor =
    hips !== undefined && hips > waist ? Math.min(1, Math.max(0, (hips - waist - 20) / 12)) : 0
  return waist / height + 0.02 * hipFactor
}

/** Interpolated {bandOffsetCm, weightModKg} for an inferred build; null when no sane waist. */
export function inferredBuildNumbers(
  baseline?: BodyBaseline,
): { offset: number; mod: number } | null {
  const whtr = effectiveWhtr(baseline)
  if (whtr === null) return null
  const first = BUILD_CURVE[0]
  const last = BUILD_CURVE[BUILD_CURVE.length - 1]
  if (whtr <= first.whtr) return { offset: first.offset, mod: first.mod }
  if (whtr >= last.whtr) return { offset: last.offset, mod: last.mod }
  for (let i = 1; i < BUILD_CURVE.length; i++) {
    const hi = BUILD_CURVE[i]
    if (whtr <= hi.whtr) {
      const lo = BUILD_CURVE[i - 1]
      const w = (whtr - lo.whtr) / (hi.whtr - lo.whtr)
      return {
        offset: lo.offset + (hi.offset - lo.offset) * w,
        mod: lo.mod + (hi.mod - lo.mod) * w,
      }
    }
  }
  return { offset: last.offset, mod: last.mod }
}

/**
 * Resolve the build LABEL: explicit baseline build wins; else the nearest
 * BUILD_CURVE anchor to the effective ratio (labels snap — they're categorical
 * display; the NUMBERS interpolate smoothly via inferredBuildNumbers).
 */
const BUILD_LABELS = ['petite', 'slim', 'average', 'curvy', 'full'] as const
export function resolveBuild(baseline?: BodyBaseline): string {
  const explicit = baseline?.build
  if (explicit && Object.hasOwn(BUILD_BAND_OFFSET, explicit)) return explicit
  const whtr = effectiveWhtr(baseline)
  if (whtr === null) return 'average'
  let best = 0
  for (let i = 1; i < BUILD_CURVE.length; i++) {
    if (Math.abs(BUILD_CURVE[i].whtr - whtr) < Math.abs(BUILD_CURVE[best].whtr - whtr)) best = i
  }
  return BUILD_LABELS[best]
}

/** Underbust band (cm): waist + build offset (explicit → table; inferred → smooth curve). */
export function bandCm(baseline?: BodyBaseline): number {
  const waist = saneWaistCm(baseline?.waistCm) ?? REF_WAIST_CM
  const explicit = baseline?.build
  if (explicit && Object.hasOwn(BUILD_BAND_OFFSET, explicit))
    return waist + BUILD_BAND_OFFSET[explicit]
  const inferred = inferredBuildNumbers(baseline)
  return waist + (inferred ? inferred.offset : (BUILD_BAND_OFFSET[resolveBuild(baseline)] ?? 5))
}

/** Frame-weight estimate (kg) honoring explicit build or the smooth inferred mod. */
export function frameEstimateKg(baseline?: BodyBaseline): number {
  const h = saneHeightCm(baseline?.heightCm) ?? K.refHeightCm
  const explicit = baseline?.build
  const mods = K.buildWeightMods as Record<string, number>
  let mod = 0
  if (explicit && Object.hasOwn(mods, explicit)) mod = mods[explicit]
  else {
    const inferred = inferredBuildNumbers(baseline)
    if (inferred) mod = inferred.mod
  }
  return Math.max(20, h * K.bodyWeightHeightFactor - K.bodyWeightHeightOffset + mod)
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
