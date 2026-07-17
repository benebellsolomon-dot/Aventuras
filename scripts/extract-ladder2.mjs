// Extract v2: bake the NAI v0.4.7 measurement/label channels for D4 depth-(b)
// (research/35 §3) by driving compute_body_snapshot at reference frame.
// Appends generated exports to the fork's ladder-data.ts (which must already
// contain the v1 tables).
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const SRC = '/Users/benjaminsolomon/Projects/code/be-story-engine/dist/ambrosia-v0.4.7.naiscript'
const OUT = '/Users/benjaminsolomon/Projects/gaming/Aventuras/src/lib/services/be/ladder-data.ts'
const src = readFileSync(SRC, 'utf8')

const noop = new Proxy(function () {}, {
  get: (t, p) => (p === Symbol.toPrimitive ? () => '' : noop),
  apply: () => noop,
  construct: () => noop,
})
const base = { console: { log: () => {}, warn: () => {}, error: () => {} }, Math, JSON, Number, String, Object, Array, Boolean, RegExp, Date, Symbol, parseInt, parseFloat, isFinite, isNaN, Infinity, NaN, undefined }
const sandbox = new Proxy(base, {
  has: () => true,
  get: (t, p) => (p in t ? t[p] : p === Symbol.unscopables ? undefined : noop),
  set: (t, p, v) => ((t[p] = v), true),
})
const epilogue = `\n;var __C__={compute_body_snapshot,weightRef,bodyPctNote,droopRef,estimated_body_weight_kg,BASE_WEIGHT_CONST,BASE_WEIGHT_LINEAR,BASE_WEIGHT_QUAD,TISSUE_DENSITY_KG_PER_CM3,MILK_FRACTION,FRAME_MODIFIER_REF_HEIGHT_CM,BODY_WEIGHT_HEIGHT_FACTOR,BODY_WEIGHT_HEIGHT_OFFSET,BUILD_WEIGHT_MODS,fluid_density_for};`
vm.runInContext(src + epilogue, vm.createContext(sandbox), { timeout: 60_000 })
const C = base.__C__
if (!C || C.compute_body_snapshot === noop) throw new Error('capture failed')

const REF_H = Number(C.FRAME_MODIFIER_REF_HEIGHT_CM)
const SHAPES = ['natural', 'firm', 'gravity_defying']
const MAX_TIER = 300

const snapAt = (tier, shape, fill = 0, lactating = false) =>
  C.compute_body_snapshot({
    tier_index: tier,
    breast_shape: shape,
    height_cm: REF_H,
    build: 'average',
    fill_percent: fill,
    lactation_active: lactating,
    fluid_type: 'milk',
  })

// Sanity: gravity_defying must actually change the geometry (guard against a
// silently unrecognized shape value falling back to the default).
{
  const g = snapAt(47, 'gravity_defying')
  const n = snapAt(47, 'natural')
  if (C.droopRef(g.droop_cm, g.ptosis_factor) !== '' || g.posture_label === n.posture_label) {
    throw new Error('gravity_defying not recognized by the spine — shape names diverge')
  }
}

// 1) Per-shape body rows: posture/mobility/clothing/shape/hang, compressed on change.
const bodyRowsByShape = {}
for (const shape of SHAPES) {
  const rows = []
  let prevKey = null
  for (let t = 0; t <= MAX_TIER; t++) {
    const s = snapAt(t, shape)
    const row = {
      minTier: t,
      posture: String(s.posture_label ?? ''),
      mobility: String(s.mobility_label ?? ''),
      clothing: String(s.clothing_label ?? ''),
      shape: String(s.shape_descriptor ?? ''),
      hang: String(C.droopRef(s.droop_cm, s.ptosis_factor) ?? ''),
    }
    const key = [row.posture, row.mobility, row.clothing, row.shape, row.hang].join('|')
    if (key !== prevKey) {
      rows.push(row)
      prevKey = key
    }
  }
  bodyRowsByShape[shape] = rows
}

// 2) Weight-feel thresholds (kg per side sweep, 0.05 steps to 200).
const weightRows = []
{
  let prev = null
  for (let kg = 0; kg <= 200; kg += 0.05) {
    const k = Math.round(kg * 100) / 100
    const text = String(C.weightRef(k) ?? '')
    if (text !== prev) {
      weightRows.push({ minKgPerSide: k, text })
      prev = text
    }
  }
}

// 3) Proportion thresholds (percent sweep).
const proportionRows = []
{
  let prev = null
  for (let pct = 0; pct <= 120; pct += 0.05) {
    const p = Math.round(pct * 100) / 100
    const text = String(C.bodyPctNote(p) ?? '')
    if (text !== prev) {
      proportionRows.push({ minPct: p, text })
      prev = text
    }
  }
}

// 4) Skin-tension (fluid pressure) thresholds from a fill sweep; verify the
//    rung boundaries are tier-independent before trusting them.
const tensionAt = (tier) => {
  const rows = []
  let prev = null
  for (let f = 0; f <= 100; f++) {
    const s = snapAt(tier, 'natural', f, true)
    const raw = s.skin_tension
    const text = String((raw && typeof raw === 'object' ? raw.description : raw) ?? '')
    if (text !== prev) {
      rows.push({ minFillPercent: f, text })
      prev = text
    }
  }
  return rows
}
const tensionRows = tensionAt(21)
if (JSON.stringify(tensionRows) !== JSON.stringify(tensionAt(47))) {
  throw new Error('skin_tension rungs are tier-dependent — needs a 2-D bake')
}

// 4b) Bust circumference curves per shape, empty and full (cm, 0.1 precision).
//     Runtime interpolates on fill between the two.
const bustCurves = {}
for (const shape of SHAPES) {
  const empty = []
  const full = []
  for (let t = 0; t <= MAX_TIER; t++) {
    empty.push(Math.round(Number(snapAt(t, shape).bust_cm) * 10) / 10)
    full.push(Math.round(Number(snapAt(t, shape, 100, true).bust_cm) * 10) / 10)
  }
  bustCurves[shape] = { empty, full }
}

// 5) Golden fixtures for the canary tests (natural, fill 0, reference frame).
const golden = [13, 31, 47].map((t) => {
  const s = snapAt(t, 'natural')
  return {
    tier: t,
    letter: String(s.tier_letter),
    dryTotalKg: Number(s.weight_empty_total_kg),
    capacityTotalMl: Number(s.capacity_total_ml),
    bodyPct: Number(s.breast_mass_body_pct),
    bustCm: Number(s.bust_cm),
  }
})

const constants = {
  baseWeightConst: Number(C.BASE_WEIGHT_CONST),
  baseWeightLinear: Number(C.BASE_WEIGHT_LINEAR),
  baseWeightQuad: Number(C.BASE_WEIGHT_QUAD),
  tissueDensityKgPerCm3: Number(C.TISSUE_DENSITY_KG_PER_CM3),
  milkFraction: Number(C.MILK_FRACTION),
  milkDensity: Number(C.fluid_density_for('milk')),
  refHeightCm: REF_H,
  bodyWeightHeightFactor: Number(C.BODY_WEIGHT_HEIGHT_FACTOR),
  bodyWeightHeightOffset: Number(C.BODY_WEIGHT_HEIGHT_OFFSET),
  buildWeightMods: C.BUILD_WEIGHT_MODS,
}

const gen = `
// ── D4 depth-(b) measurement channels (research/35 §3) — generated by extract-ladder2.mjs ──
// Baked by driving the v0.4.7 compute_body_snapshot at the reference frame
// (H=${REF_H}, build 'average'); label text is verbatim NAI. Runtime code implements
// only the two 1-D curves from MEASUREMENT_CONSTANTS; everything else is lookup.

/** The exact NAI curve constants (weight quadratic, capacity, body-weight estimate). */
export const MEASUREMENT_CONSTANTS = ${JSON.stringify(constants, null, 2)} as const

/** Per-shape body rows: posture/mobility/clothing + shape descriptor + hang phrase (minTier thresholds). */
export const BODY_ROWS_BY_SHAPE: Readonly<
  Record<
    'natural' | 'firm' | 'gravity_defying',
    ReadonlyArray<{
      readonly minTier: number
      readonly posture: string
      readonly mobility: string
      readonly clothing: string
      readonly shape: string
      readonly hang: string
    }>
  >
> = ${JSON.stringify(bodyRowsByShape, null, 2)}

/** Weight-feel label ladder (NAI weightRef), keyed on kg per side. */
export const WEIGHT_FEEL_THRESHOLDS: ReadonlyArray<{ readonly minKgPerSide: number; readonly text: string }> = ${JSON.stringify(weightRows, null, 2)}

/** Proportion label ladder (NAI bodyPctNote), keyed on breast-mass % of body weight. */
export const PROPORTION_THRESHOLDS: ReadonlyArray<{ readonly minPct: number; readonly text: string }> = ${JSON.stringify(proportionRows, null, 2)}

/** Fluid-pressure (skin tension) ladder keyed on fill percent — verified tier-independent. */
export const SKIN_TENSION_THRESHOLDS: ReadonlyArray<{ readonly minFillPercent: number; readonly text: string }> = ${JSON.stringify(tensionRows, null, 2)}

/** Bust circumference (cm) per tier, per shape, at empty and 100% fill — index = tier, saturating at the last entry. */
export const BUST_CM_CURVES: Readonly<
  Record<'natural' | 'firm' | 'gravity_defying', { readonly empty: ReadonlyArray<number>; readonly full: ReadonlyArray<number> }>
> = ${JSON.stringify(bustCurves)}

/** Golden snapshot fixtures at anchor tiers (natural, empty, reference frame) for canaries. */
export const GOLDEN_MEASUREMENTS = ${JSON.stringify(golden, null, 2)} as const
`

const existing = readFileSync(OUT, 'utf8')
if (existing.includes('MEASUREMENT_CONSTANTS')) throw new Error('v2 tables already present — remove before regenerating')
writeFileSync(OUT, existing + gen)
console.log('rows:', SHAPES.map((s) => `${s}=${bodyRowsByShape[s].length}`).join(' '), '| weight:', weightRows.length, '| proportion:', proportionRows.length, '| tension:', tensionRows.length)
console.log('golden:', JSON.stringify(golden))
console.log('t47 natural:', JSON.stringify(bodyRowsByShape.natural.filter((r) => r.minTier <= 47).slice(-1)[0]))
