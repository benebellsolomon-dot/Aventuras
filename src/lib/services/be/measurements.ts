/**
 * BE engine — measurement channels (D4 depth-(b), research/35 §3).
 *
 * Two 1-D curves implemented from the exact NAI constants; every label is a
 * lookup into tables baked by driving the validated v0.4.7 spine at build time
 * (ladder-data.ts). Per the corpus's own sizing rule, prose never sees bust
 * circumference in cm — sizes surface as the US sizing string ("38X") plus
 * banded mass/capacity numbers.
 */

import {
  BODY_ROWS_BY_SHAPE,
  BUST_CM_CURVES,
  MEASUREMENT_CONSTANTS,
  PROPORTION_THRESHOLDS,
  SKIN_TENSION_THRESHOLDS,
  WEIGHT_FEEL_THRESHOLDS,
} from './ladder-data'
import { cupLetter } from './ladder'
import type { BodyShape, BodyState } from './types'

const K = MEASUREMENT_CONSTANTS

const clampTier = (tier: number): number =>
  Number.isFinite(tier) ? Math.max(0, Math.floor(tier)) : 0

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0

/** Dry tissue mass per side (kg) — the NAI base-weight quadratic at reference frame. */
export function dryKgPerSide(tier: number): number {
  const t = clampTier(tier)
  return K.baseWeightConst + K.baseWeightLinear * t + K.baseWeightQuad * t * t
}

/** Fluid capacity per side (ml) — tissue volume × the NAI milk fraction. */
export function capacityMlPerSide(tier: number): number {
  return (dryKgPerSide(tier) / K.tissueDensityKgPerCm3) * K.milkFraction
}

/** Current mass per side (kg) at a fill level (fluid at milk density). */
export function nowKgPerSide(tier: number, fillPercent: number): number {
  const fillMl = capacityMlPerSide(tier) * (clampPercent(fillPercent) / 100)
  return dryKgPerSide(tier) + (fillMl * K.milkDensity) / 1000
}

/** The NAI body-weight estimate from height + build (reference default when unset). */
export function estimatedBodyWeightKg(heightCm?: number, build?: string): number {
  const h =
    Number.isFinite(heightCm) && (heightCm as number) >= 100 ? (heightCm as number) : K.refHeightCm
  const mods = K.buildWeightMods as Record<string, number>
  const mod = (build && mods[build]) || 0
  return Math.max(20, h * K.bodyWeightHeightFactor - K.bodyWeightHeightOffset + mod)
}

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

/** Cup sizing label — derived, letter-only ("X-cup"). */
export function sizingString(tier: number): string {
  return `${cupLetter(tier)}-cup`
}

/**
 * Bust circumference (cm) — AUTOMATIC: interpolated on fill between the baked
 * empty/full spine curves for (tier, shape); recomputes as tier grows. Reference
 * frame; saturates at the curve's last tier.
 */
export function bustCm(tier: number, shape: BodyShape, fillPercent = 0): number {
  const curves = BUST_CM_CURVES[shape] ?? BUST_CM_CURVES.natural
  const t = Math.min(clampTier(tier), curves.empty.length - 1)
  const fill = clampPercent(fillPercent) / 100
  return curves.empty[t] + (curves.full[t] - curves.empty[t]) * fill
}

/**
 * Metric BWH string: bust is always auto-derived; waist/hips appear when the
 * baseline carries them ("102-81-94 cm"), otherwise bust alone ("bust ~102 cm").
 */
export function bwhCmString(state: BodyState): string {
  const bust = Math.round(bustCm(state.tier, state.shape, state.fluids.fillPercent))
  const waist = state.baseline?.waistCm
  const hips = state.baseline?.hipsCm
  if (waist && hips) return `${bust}-${Math.round(waist)}-${Math.round(hips)} cm`
  return `bust ~${bust} cm`
}

export interface BodyMeasurements {
  bustCm: number
  dryTotalKg: number
  nowTotalKg: number
  capacityTotalMl: number
  fillMlTotal: number
  bodyWeightKg: number
  breastMassPct: number
  weightFeel: string
  proportionNote: string
}

/** The full measurement bundle for a body state (current mass includes fluid load). */
export function measurements(state: BodyState): BodyMeasurements {
  const fill = clampPercent(state.fluids.fillPercent)
  const dryTotal = 2 * dryKgPerSide(state.tier)
  const nowPerSide = nowKgPerSide(state.tier, fill)
  const nowTotal = 2 * nowPerSide
  const capacityTotal = 2 * capacityMlPerSide(state.tier)
  const bodyWeightKg =
    state.baseline?.bodyWeightKg && state.baseline.bodyWeightKg > 0
      ? state.baseline.bodyWeightKg
      : estimatedBodyWeightKg(state.baseline?.heightCm, state.baseline?.build)
  // NAI convention (golden-pinned): breast mass as a share of TOTAL weight
  // including the breasts themselves.
  const pct = bodyWeightKg > 0 ? (nowTotal / (bodyWeightKg + nowTotal)) * 100 : 0
  return {
    bustCm: bustCm(state.tier, state.shape, fill),
    dryTotalKg: dryTotal,
    nowTotalKg: nowTotal,
    capacityTotalMl: capacityTotal,
    fillMlTotal: capacityTotal * (fill / 100),
    bodyWeightKg,
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
  if (state.fluids.fillPercent >= 75) {
    cues.push(`breasts visibly engorged, taut and heavy with ${state.fluids.fluidType}`)
  }
  if ((state.arousal ?? 0) >= 70) {
    cues.push('flushed, visibly aroused expression')
  }
  return cues
}
