// Verbatim extraction of the Ambrosia/alpha52 BIOMECHANICS functions (posture,
// body-pct, sensitivity, interaction milestones) + the weight chain they consume.
// Used ONLY to compute engine output for the biomechanics audit. No edits to logic.

const FRAME_MODIFIER_REF_HEIGHT_CM = 165;
const FRAME_MODIFIER_EXPONENT = 1.5;
const BASE_WEIGHT_CONST = 0.18;
const BASE_WEIGHT_LINEAR = 0.055;
const BASE_WEIGHT_QUAD = 0.002;
const BASE_CAPACITY_CONST = 50;
const BASE_CAPACITY_LINEAR = 25;
const BASE_CAPACITY_QUAD = 1.5;
const DEFAULT_FLUID_DENSITY = 1.03;
const TISSUE_DENSITY_KG_PER_CM3 = 0.00095;
const BUILD_WEIGHT_MODS = { petite: -8, slim: -4, average: 0, curvy: 4, athletic: 3, full: 8 };
const BODY_WEIGHT_HEIGHT_FACTOR = 0.4;
const BODY_WEIGHT_HEIGHT_OFFSET = 8;
const SHAPE_POSTURE_FACTOR = { natural: 1.25, firm: 1.0, gravity_defying: 0.65 };

const POSTURE_THRESHOLDS = [
  { ratio_max: 0.024,     posture: 'unaffected',                  mobility: 'unaffected' },
  { ratio_max: 0.043,     posture: 'minor forward tilt',          mobility: 'unaffected' },
  { ratio_max: 0.074,     posture: 'noticeable forward lean',     mobility: 'mild encumbrance' },
  { ratio_max: 0.123,     posture: 'pronounced forward arch',     mobility: 'encumbered, support recommended' },
  { ratio_max: 0.20,      posture: 'profound permanent arch',     mobility: 'significantly encumbered' },
  { ratio_max: 0.286,     posture: 'spine bowed under weight',    mobility: 'requires support for sustained activity' },
  { ratio_max: 0.40,      posture: 'structurally dominated',      mobility: 'mobility severely limited' },
  { ratio_max: 0.55,      posture: 'body secondary to breasts',   mobility: 'essentially immobile without aid' },
  { ratio_max: 0.70,      posture: 'vestigial beneath their mass',mobility: 'stationary' },
  { ratio_max: Infinity,  posture: 'body exists only as origin',  mobility: 'immobile — she IS her breasts' },
];

const INTERACTION_MILESTONES = [
  { weight_kg: 1.5,  description: 'can no longer go braless comfortably' },
  { weight_kg: 2.7,  description: 'cleavage visible in any neckline' },
  { weight_kg: 4.0,  description: 'cannot see her own feet when standing' },
  { weight_kg: 6.0,  description: 'cannot reach past them to touch her toes' },
  { weight_kg: 7.5,  description: 'her lap disappears beneath them when seated' },
  { weight_kg: 10.0, description: 'breasts press warmly between them whenever she embraces someone' },
  { weight_kg: 14.0, description: 'must turn sideways to fit through standard doorways' },
  { weight_kg: 20.0, description: 'cannot reach the ground past them when standing' },
  { weight_kg: 30.0, description: 'cannot stand unaided for extended periods' },
  { weight_kg: 45.0, description: 'cannot fit in a standard chair' },
  { weight_kg: 70.0, description: 'requires custom-built furniture to sit' },
  { weight_kg: 130.0,description: 'requires structural modifications to any room she occupies' },
  { weight_kg: 180.0,description: 'requires architectural accommodation' },
];

const SENSITIVITY_LABELS = [
  { max: 0.8, label: 'dulled' }, { max: 1.1, label: 'normal' }, { max: 1.4, label: 'heightened' },
  { max: 1.8, label: 'sensitive' }, { max: 2.3, label: 'hypersensitive' }, { max: Infinity, label: 'overwhelmed' },
];

function tier_index_to_letter(tier_index) {
  let i = Math.floor(Number(tier_index));
  if (!Number.isFinite(i) || i < 0) i = 0;
  if (i < 50) { const li = Math.floor(i / 2); const dbl = (i % 2 === 1); const ch = String.fromCharCode(65 + li); return dbl ? ch + ch : ch; }
  if (i === 50) return 'Z'; if (i === 51) return 'ZZ';
  const adjusted = i - 52; const z_count = Math.floor(adjusted / 50) + 1; const position = adjusted % 50;
  const z_prefix = 'Z'.repeat(z_count); const li = Math.floor(position / 2); const dbl = (position % 2 === 1); const ch = String.fromCharCode(65 + li);
  return z_prefix + (dbl ? ch + ch : ch);
}
function frame_modifier(h) { h = Number(h); if (!Number.isFinite(h) || h < 100) h = 100; return Math.pow(h / FRAME_MODIFIER_REF_HEIGHT_CM, FRAME_MODIFIER_EXPONENT); }
function base_weight_per_side_kg(t) { let i = Math.max(0, Math.floor(Number(t)) || 0); return BASE_WEIGHT_CONST + BASE_WEIGHT_LINEAR * i + BASE_WEIGHT_QUAD * i * i; }
function weight_per_side_kg(t, h) { return base_weight_per_side_kg(t) * frame_modifier(h); }
function base_capacity_per_side_ml(t) { let i = Math.max(0, Math.floor(Number(t)) || 0); return BASE_CAPACITY_CONST + BASE_CAPACITY_LINEAR * i + BASE_CAPACITY_QUAD * i * i; }
function capacity_per_side_ml(t, h) { return base_capacity_per_side_ml(t) * frame_modifier(h); }
function weight_per_side_full_kg(t, h, d) { d = Number(d); if (!Number.isFinite(d) || d <= 0) d = DEFAULT_FLUID_DENSITY; return weight_per_side_kg(t, h) + (capacity_per_side_ml(t, h) * d) / 1000; }
function weight_per_side_at_fill_kg(t, h, d, f) { f = Math.max(0, Math.min(100, Number(f) || 0)); const e = weight_per_side_kg(t, h); const fu = weight_per_side_full_kg(t, h, d); return e + (fu - e) * (f / 100); }
function estimated_body_weight_kg(h, build) { h = Number(h); if (!Number.isFinite(h) || h < 100) h = 100; const mod = BUILD_WEIGHT_MODS[build] || 0; return Math.max(20, h * BODY_WEIGHT_HEIGHT_FACTOR - BODY_WEIGHT_HEIGHT_OFFSET + mod); }

function posture_ratio(t, h, d, lact, fill, build, shape) {
  const empty_ps = weight_per_side_kg(t, h);
  let current_ps = lact ? weight_per_side_at_fill_kg(t, h, d, Math.max(0, Math.min(100, Number(fill) || 0))) : empty_ps;
  const total_breast = current_ps * 2; const body = estimated_body_weight_kg(h, build);
  const base_ratio = total_breast / (body + total_breast);
  const shapeFactor = SHAPE_POSTURE_FACTOR[shape || 'firm'] || 1.0;
  return Math.min(0.95, base_ratio * shapeFactor);
}
function posture_label(r) { r = Number(r); if (!Number.isFinite(r) || r < 0) r = 0; for (const b of POSTURE_THRESHOLDS) if (r < b.ratio_max) return b; return POSTURE_THRESHOLDS[POSTURE_THRESHOLDS.length - 1]; }
function breast_mass_body_pct(t, h, d, lact, fill, build) {
  const empty_ps = weight_per_side_kg(t, h);
  let current_ps = lact ? weight_per_side_at_fill_kg(t, h, d, Math.max(0, Math.min(100, Number(fill) || 0))) : empty_ps;
  const total_breast = current_ps * 2; const body = estimated_body_weight_kg(h, build);
  return (total_breast / (body + total_breast)) * 100;
}
function compute_sensitivity(t, lact, fill, gsince) {
  t = Math.max(0, Math.floor(Number(t)) || 0); let base = 1.0;
  const g = (Number(gsince) >= 0) ? Number(gsince) : 999;
  if (g <= 3) base *= 1.5; else if (g <= 6) base *= 1.2;
  if (lact) { const f = Math.max(0, Math.min(100, Number(fill) || 0)); if (f >= 80) base *= 1.8; else if (f >= 50) base *= 1.5; else base *= 1.3; }
  base *= Math.max(0.7, 1.0 - t * 0.001);
  for (const b of SENSITIVITY_LABELS) if (base <= b.max) return { value: Math.round(base * 100) / 100, label: b.label };
  return { value: Math.round(base * 100) / 100, label: SENSITIVITY_LABELS[SENSITIVITY_LABELS.length - 1].label };
}
function activeMilestone(wt) { let last = null; for (const m of INTERACTION_MILESTONES) { if (wt >= m.weight_kg) last = m; } return last; }

// ── Report: full tier sweep, baseline frame (curvy, natural, 165cm, no lactation) ──
const FRAME = { h: 165, build: 'curvy', shape: 'natural', d: DEFAULT_FLUID_DENSITY };
const body = estimated_body_weight_kg(FRAME.h, FRAME.build);
console.log(`=== BIOMECHANICS SWEEP — frame: height=${FRAME.h} build=${FRAME.build} shape=${FRAME.shape} ; body=${body.toFixed(1)}kg (NO lactation) ===`);
console.log(['tier','letter','wt_tot_kg','breast/body_pct','posture_ratio','posture_label','mobility','active_milestone'].join('\t'));
const sweep = [0,2,4,6,8,10,13,16,20,24,30,40,50,60,80,100,150,200,260];
for (const t of sweep) {
  const wps = weight_per_side_kg(t, FRAME.h); const wtot = wps * 2;
  const pct = breast_mass_body_pct(t, FRAME.h, FRAME.d, false, 0, FRAME.build);
  const ratio = posture_ratio(t, FRAME.h, FRAME.d, false, 0, FRAME.build, FRAME.shape);
  const lbl = posture_label(ratio);
  const ms = activeMilestone(wtot);
  console.log([t, tier_index_to_letter(t), wtot.toFixed(2), pct.toFixed(1), ratio.toFixed(3), lbl.posture, lbl.mobility, ms ? ms.description : '(none)'].join('\t'));
}

// Raw (unbounded, unshaped) breast/body ratio vs bounded posture_ratio — show the cap & shape inflation
console.log('\n=== posture_ratio internals: raw breast/body vs bounded·shape (curvy, natural shapeFactor=1.25) ===');
console.log(['tier','wt_tot_kg','raw_breast/total','×1.25(natural)','min(0.95)','mapped_band'].join('\t'));
for (const t of [6,13,20,30,40,50,80,120,200,260]) {
  const wtot = weight_per_side_kg(t, FRAME.h) * 2;
  const raw = wtot / (body + wtot);
  const shaped = raw * 1.25;
  const bounded = Math.min(0.95, shaped);
  console.log([t, wtot.toFixed(1), raw.toFixed(3), shaped.toFixed(3), bounded.toFixed(3), posture_label(bounded).posture].join('\t'));
}

// Tier at which each posture band & each milestone first triggers (baseline frame, no lact)
console.log('\n=== First tier to enter each POSTURE band (curvy/natural, no lact) ===');
{
  let seen = new Set();
  for (let t = 0; t <= 300; t++) {
    const ratio = posture_ratio(t, FRAME.h, FRAME.d, false, 0, FRAME.build, FRAME.shape);
    const lbl = posture_label(ratio).posture;
    if (!seen.has(lbl)) { seen.add(lbl); console.log(`  tier ${t} (${tier_index_to_letter(t)}): ratio=${ratio.toFixed(3)} -> ${lbl}`); }
  }
}
console.log('\n=== First tier to CROSS each interaction milestone (curvy/natural, no lact) ===');
{
  let idx = 0;
  for (let t = 0; t <= 300 && idx < INTERACTION_MILESTONES.length; t++) {
    const wtot = weight_per_side_kg(t, FRAME.h) * 2;
    while (idx < INTERACTION_MILESTONES.length && wtot >= INTERACTION_MILESTONES[idx].weight_kg) {
      console.log(`  tier ${t} (${tier_index_to_letter(t)}): ${wtot.toFixed(1)}kg >= ${INTERACTION_MILESTONES[idx].weight_kg}kg -> "${INTERACTION_MILESTONES[idx].description}"`);
      idx++;
    }
  }
}

// Sensitivity sweep: extreme-size reduction term across the whole ladder (no growth surge, no lact)
console.log('\n=== Sensitivity base multiplier vs tier (resting: no growth surge, no lactation) ===');
console.log('  formula: base = 1.0 * max(0.7, 1 - t*0.001)  -> floors at tier 300');
for (const t of [0,50,100,150,200,260,300,400]) {
  const s = compute_sensitivity(t, false, 0, 999);
  console.log(`  tier ${t}: factor=${(Math.max(0.7,1-t*0.001)).toFixed(3)} -> value=${s.value} label=${s.label}`);
}

// Cross-frame: how body weight (frame) shifts the posture_ratio for a fixed tier
console.log('\n=== posture_ratio at tier 13 (GG) across builds/heights — frame sensitivity ===');
for (const [h,b] of [[150,'petite'],[165,'average'],[165,'curvy'],[180,'full'],[150,'curvy']]) {
  const r = posture_ratio(13, h, DEFAULT_FLUID_DENSITY, false, 0, b, 'natural');
  const bw = estimated_body_weight_kg(h, b);
  console.log(`  h=${h} build=${b}: body=${bw.toFixed(1)}kg breast=${(weight_per_side_kg(13,h)*2).toFixed(1)}kg ratio=${r.toFixed(3)} -> ${posture_label(r).posture}`);
}
