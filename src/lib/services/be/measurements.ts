/**
 * BE engine — measurement channels (D4 depth-(b), research/35 §3; corrected per
 * research/38).
 *
 * Mass/capacity ride the validated NAI quadratic (curves.ts). Bust is the
 * corrected runtime closed-form on the character's OWN band (research/38 C1) —
 * all measurements are metric (Ben's ruling). Labels are lookups into tables
 * baked from the v0.4.7 spine; droop is the baked hang channel (C2). Body
 * weight is displayed as an honest total: frame (minus the baseline-breast
 * double-count) + tissue + fluid (C3).
 */

import {
  BODY_ROWS_BY_SHAPE,
  DROOP_CM_CURVES,
  PROPORTION_THRESHOLDS,
  SKIN_TENSION_THRESHOLDS,
  WEIGHT_FEEL_THRESHOLDS,
} from './ladder-data'
import {
  BASELINE_BREAST_KG,
  bandCm,
  bustCmFor,
  capacityMlPerSide,
  dryKgPerSide,
  frameEstimateKg,
  nowKgPerSide,
  resolveBuild,
  saneHipsCm,
  saneWaistCm,
  saneWeightKg,
} from './curves'
import { SHAPE_SUPPORT, SUPPORT_FROM_CONDITIONS, fluidProfile } from './constants'
import { cupLetter } from './ladder'
import type { BodyShape, BodyState } from './types'

/**
 * Effective support/buoyancy (Spec 1 Task 7): shape base plus active condition
 * labels, clamped to [0,1]. Derived, never stored.
 */
export function effectiveSupport(state: BodyState): number {
  let support = SHAPE_SUPPORT[state.shape] ?? 0
  for (const condition of state.conditions) {
    const key = condition.label.toLowerCase()
    if (Object.hasOwn(SUPPORT_FROM_CONDITIONS, key)) support += SUPPORT_FROM_CONDITIONS[key]
  }
  return Math.min(1, Math.max(0, support))
}

export {
  bandCm,
  bustProjectionCm,
  bustDiffCm,
  capacityMlPerSide,
  dryKgPerSide,
  nowKgPerSide,
  resolveBuild,
} from './curves'

const clampTier = (tier: number): number =>
  Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

/** Weight-feel label (NAI weightRef rungs), keyed on current kg per side. */
export function weightFeel(kgPerSide: number): string {
  let text = ''
  for (const row of WEIGHT_FEEL_THRESHOLDS) {
    if (kgPerSide >= row.minKgPerSide) text = row.text
    else break
  }
  return text
}

/** Proportion label (NAI bodyPctNote rungs), keyed on breast-mass % of body weight. */
export function proportionNote(pct: number): string {
  let text = ''
  for (const row of PROPORTION_THRESHOLDS) {
    if (pct >= row.minPct) text = row.text
    else break
  }
  return text
}

/** Fluid-pressure label (NAI skin-tension rungs), keyed on fill percent. */
export function fluidPressureLabel(fillPercent: number): string {
  const f = clampPercent(fillPercent)
  let text = ''
  for (const row of SKIN_TENSION_THRESHOLDS) {
    if (f >= row.minFillPercent) text = row.text
    else break
  }
  return text
}

export interface BodyRow {
  posture: string
  mobility: string
  clothing: string
  shape: string
  hang: string
}

/** The baked (tier, shape) body row: posture/mobility/clothing + shape descriptor + hang. */
export function bodyRow(tier: number, shape: BodyShape): BodyRow {
  const rows = BODY_ROWS_BY_SHAPE[shape] ?? BODY_ROWS_BY_SHAPE.natural
  const t = clampTier(tier)
  let row = rows[0]
  for (const candidate of rows) {
    if (t >= candidate.minTier) row = candidate
    else break
  }
  return {
    posture: row.posture,
    mobility: row.mobility,
    clothing: row.clothing,
    shape: row.shape,
    hang: row.hang,
  }
}

/** Cup sizing label — derived, letter-only ("T-cup"). */
export function sizingString(tier: number): string {
  return `${cupLetter(tier)}-cup`
}

/**
 * Bust circumference (cm) — AUTOMATIC (research/38 C1): the corrected closed-form
 * on the character's own band (waist + build offset; reference band when no
 * baseline). Recomputes as tier grows and widens with fill.
 */
export function bustCm(
  tier: number,
  shape: BodyShape,
  fillPercent = 0,
  baseline?: BodyState['baseline'],
): number {
  return bustCmFor(tier, shape, fillPercent, baseline)
}

/** Droop / hang depth (cm) — the baked spine hang channel, fill-interpolated (C2). */
export function droopCm(tier: number, shape: BodyShape, fillPercent = 0): number {
  const curves = DROOP_CM_CURVES[shape] ?? DROOP_CM_CURVES.natural
  const t = Math.min(clampTier(tier), curves.empty.length - 1)
  const fill = clampPercent(fillPercent) / 100
  return curves.empty[t] + (curves.full[t] - curves.empty[t]) * fill
}

/**
 * Metric BWH string: bust is always auto-derived on her own band; waist/hips
 * appear when the baseline carries them ("140-81-94 cm"), otherwise bust alone.
 */
export function bwhCmString(state: BodyState): string {
  const bust = Math.round(bustCm(state.tier, state.shape, state.fluids.fillPercent, state.baseline))
  const waist = saneWaistCm(state.baseline?.waistCm)
  const hips = saneHipsCm(state.baseline?.hipsCm)
  if (waist && hips) return `${bust}-${Math.round(waist)}-${Math.round(hips)} cm`
  return `bust ~${bust} cm`
}

export interface BodyMeasurements {
  bustCm: number
  bandCm: number
  droopCm: number
  dryTotalKg: number
  nowTotalKg: number
  capacityTotalMl: number
  fillMlTotal: number
  /** Frame weight (explicit baseline or estimate), minus the baseline-breast double-count. */
  frameKg: number
  /** Honest total: frame + current breast mass incl. fluid (research/38 C3). */
  totalBodyWeightKg: number
  buildResolved: string
  breastMassPct: number
  weightFeel: string
  proportionNote: string
}

/** The full measurement bundle for a body state (current mass includes fluid load). */
export function measurements(state: BodyState): BodyMeasurements {
  const fill = clampPercent(state.fluids.fillPercent)
  const dryTotal = 2 * dryKgPerSide(state.tier)
  const nowPerSide = nowKgPerSide(state.tier, fill, fluidProfile(state.fluids.fluidType).density)
  const nowTotal = 2 * nowPerSide
  const capacityTotal = 2 * capacityMlPerSide(state.tier)
  const build = resolveBuild(state.baseline)
  const frameRaw = saneWeightKg(state.baseline?.bodyWeightKg) ?? frameEstimateKg(state.baseline)
  // C3: the frame estimate already contains a typical bust — subtract it so the
  // real tissue isn't double-counted into the total/proportion.
  const frameKg = Math.max(20, frameRaw - BASELINE_BREAST_KG)
  const totalBodyWeightKg = frameKg + nowTotal
  const pct = frameKg > 0 ? (nowTotal / totalBodyWeightKg) * 100 : 0
  return {
    bustCm: bustCm(state.tier, state.shape, fill, state.baseline),
    bandCm: bandCm(state.baseline),
    droopCm: droopCm(state.tier, state.shape, fill),
    dryTotalKg: dryTotal,
    nowTotalKg: nowTotal,
    capacityTotalMl: capacityTotal,
    fillMlTotal: capacityTotal * (fill / 100),
    frameKg,
    totalBodyWeightKg,
    buildResolved: build,
    breastMassPct: pct,
    weightFeel: weightFeel(nowPerSide),
    proportionNote: proportionNote(pct),
  }
}

/**
 * Visual state cues for image prompts (appended after size grounding). Kept to
 * the two strongest visually-legible signals to avoid prompt bloat.
 */
export function imageStateCues(state: BodyState): string[] {
  const cues: string[] = []
  const fill = state.fluids.fillPercent
  // Graduated fill rungs — one cue, strongest wins (avoid prompt bloat).
  if (fill >= 90) {
    cues.push(
      `breasts hugely engorged with ${state.fluids.fluidType}, skin stretched shiny-taut, visibly leaking`,
    )
  } else if (fill >= 75) {
    cues.push(`breasts visibly engorged, taut and heavy with ${state.fluids.fluidType}`)
  } else if (fill >= 40) {
    cues.push(`breasts subtly swollen with ${state.fluids.fluidType}, skin gently taut`)
  }
  if ((state.arousal ?? 0) >= 70) {
    cues.push('flushed, visibly aroused expression')
  }
  return cues
}
