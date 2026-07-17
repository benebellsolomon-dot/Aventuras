// Body-math audit (research/38): dump ALL spine channels per tier + an independent
// geometric bust-circumference model, to quantify the suspected bust_cm undershoot.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SRC = '/Users/benjaminsolomon/Projects/code/be-story-engine/dist/ambrosia-v0.4.7.naiscript'
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
const epilogue = `\n;var __C__={compute_body_snapshot,estimated_body_weight_kg,TISSUE_DENSITY_KG_PER_CM3,BASE_WEIGHT_CONST,BASE_WEIGHT_LINEAR,BASE_WEIGHT_QUAD,FRAME_MODIFIER_REF_HEIGHT_CM};`
vm.runInContext(src + epilogue, vm.createContext(sandbox), { timeout: 60_000 })
const C = base.__C__
if (!C || C.compute_body_snapshot === noop) throw new Error('capture failed')

const REF_H = Number(C.FRAME_MODIFIER_REF_HEIGHT_CM)
const snapAt = (tier, fill = 0) =>
  C.compute_body_snapshot({
    tier_index: tier, breast_shape: 'natural', height_cm: REF_H, build: 'average',
    fill_percent: fill, lactation_active: fill > 0, fluid_type: 'milk',
  })

// ── Full channel dump at two anchor tiers: what does the spine actually compute? ──
for (const t of [13, 47]) {
  const s = snapAt(t)
  console.log(`\n===== FULL SNAPSHOT tier ${t} (natural, empty, H=${REF_H}, average) =====`)
  for (const [k, v] of Object.entries(s)) {
    const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v
    console.log(`  ${k}: ${val}`)
  }
}

// ── Independent geometric model: bust tape ≈ perimeter of convex hull of
//    (torso ellipse) ∪ (two breast circles), via support functions. ──
// Torso at reference frame: underbust ≈ 70 cm → ellipse a=14 (half-width) b=8 (half-depth).
const TORSO_A = 14, TORSO_B = 8
const perimeter = (shapes) => {
  // perimeter of convex hull = ∫ max support over θ (support-function property)
  const N = 20000
  let sum = 0
  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N
    let h = -Infinity
    for (const s of shapes) h = Math.max(h, s(th))
    sum += h
  }
  return (sum * 2 * Math.PI) / N
}
const ellipse = (a, b) => (th) => Math.sqrt(a * a * Math.cos(th) ** 2 + b * b * Math.sin(th) ** 2)
const circle = (cx, cy, r) => (th) => cx * Math.cos(th) + cy * Math.sin(th) + r
const underbustCm = perimeter([ellipse(TORSO_A, TORSO_B)])

const hullBust = (volMlPerSide) => {
  // hemisphere mound on the chest wall: radius from volume, center on the wall (y=+TORSO_B)
  const r = Math.cbrt((3 * volMlPerSide) / (2 * Math.PI))
  const sep = Math.min(TORSO_A, Math.max(9, 0.85 * r)) // lateral center offset
  return {
    r,
    bust: perimeter([ellipse(TORSO_A, TORSO_B), circle(-sep, TORSO_B, r), circle(sep, TORSO_B, r)]),
  }
}

// ── Comparison table across the ladder ──
const dryKgSide = (t) => 0.18 + 0.055 * t + 0.002 * t * t
const DENSITY = Number(C.TISSUE_DENSITY_KG_PER_CM3)
console.log(`\n===== COMPARISON (underbust model ≈ ${underbustCm.toFixed(1)} cm; torso ${2 * TORSO_A}×${2 * TORSO_B} cm) =====`)
console.log('tier | letter | dry/side kg | vol/side ml | r_hemi cm | spine bust | hull bust | Δ(hull−spine)')
for (const t of [0, 2, 4, 6, 9, 13, 17, 21, 26, 31, 35, 39, 43, 47, 55, 60, 70, 82, 100, 120]) {
  const s = snapAt(t)
  const kg = dryKgSide(t)
  const vol = kg / DENSITY
  const { r, bust } = hullBust(vol)
  const spine = Number(s.bust_cm)
  console.log(
    `${String(t).padStart(4)} | ${String(s.tier_letter).padStart(4)} | ${kg.toFixed(2).padStart(9)} | ${vol.toFixed(0).padStart(9)} | ${r.toFixed(1).padStart(7)} | ${spine.toFixed(1).padStart(8)} | ${bust.toFixed(1).padStart(7)} | ${(bust - spine).toFixed(1).padStart(7)}`,
  )
}

// ── Engorged check at 47 + body-weight framing ──
const s47f = snapAt(47, 100)
console.log(`\ntier 47 @100% fill: spine bust ${Number(s47f.bust_cm).toFixed(1)} cm, now/side kg ${Number(s47f.weight_current_per_side_kg ?? s47f.weight_current_total_kg / 2 ?? NaN)}`)
console.log(`frame estimate (H=${REF_H}, average): ${C.estimated_body_weight_kg(REF_H, 'average')} kg`)
const t47kg = 2 * dryKgSide(47)
console.log(`tier 47 dry tissue total: ${t47kg.toFixed(1)} kg → true total ≈ ${(Number(C.estimated_body_weight_kg(REF_H, 'average')) + t47kg).toFixed(1)} kg (frame + tissue, before fluid)`)

// ── Real-world sanity anchors for the hull model itself ──
console.log('\n===== hull-model sanity vs real-world sizing =====')
for (const [label, ml] of [['~C cup (300ml)', 300], ['~F/G (800ml)', 800], ['~K (2000ml)', 2000]]) {
  const { bust } = hullBust(ml)
  console.log(`  ${label}: hull bust ${bust.toFixed(1)} cm (diff ${(bust - underbustCm).toFixed(1)} cm over underbust)`)
}
