// Verbatim extraction of the Ambrosia/alpha52 body-measurement functions + constants,
// used ONLY to compute the engine's output for the audit. No edits to logic.

const BASELINE_WAIST_CM = 61;
const FRAME_MODIFIER_REF_HEIGHT_CM = 165;
const FRAME_MODIFIER_EXPONENT = 1.5;
const BASE_WEIGHT_CONST = 0.18;
const BASE_WEIGHT_LINEAR = 0.055;
const BASE_WEIGHT_QUAD = 0.002;
const SHAPE_CIRC_FACTOR = { natural: 1.30, firm: 1.0, gravity_defying: 0.80 };
const BUILD_BAND_OFFSET = { petite: 3, slim: 4, average: 5, curvy: 8, athletic: 5, full: 10 };
const BASE_CAPACITY_CONST = 50;
const BASE_CAPACITY_LINEAR = 25;
const BASE_CAPACITY_QUAD = 1.5;
const DEFAULT_FLUID_DENSITY = 1.03;
const TISSUE_DENSITY_KG_PER_CM3 = 0.00095;

function tier_index_to_letter(tier_index) {
  let i = Math.floor(Number(tier_index));
  if (!Number.isFinite(i) || i < 0) i = 0;
  if (i < 50) {
    const li = Math.floor(i / 2);
    const dbl = (i % 2 === 1);
    const ch = String.fromCharCode(65 + li);
    return dbl ? ch + ch : ch;
  }
  if (i === 50) return 'Z';
  if (i === 51) return 'ZZ';
  const adjusted = i - 52;
  const z_count = Math.floor(adjusted / 50) + 1;
  const position = adjusted % 50;
  const z_prefix = 'Z'.repeat(z_count);
  const li = Math.floor(position / 2);
  const dbl = (position % 2 === 1);
  const ch = String.fromCharCode(65 + li);
  return z_prefix + (dbl ? ch + ch : ch);
}

function frame_modifier(height_cm) {
  let h = Number(height_cm);
  if (!Number.isFinite(h) || h < 100) h = 100;
  return Math.pow(h / FRAME_MODIFIER_REF_HEIGHT_CM, FRAME_MODIFIER_EXPONENT);
}

function base_weight_per_side_kg(tier_index) {
  let i = Math.max(0, Math.floor(Number(tier_index)) || 0);
  return BASE_WEIGHT_CONST + BASE_WEIGHT_LINEAR * i + BASE_WEIGHT_QUAD * i * i;
}
function weight_per_side_kg(tier_index, height_cm) {
  return base_weight_per_side_kg(tier_index) * frame_modifier(height_cm);
}
function base_capacity_per_side_ml(tier_index) {
  let i = Math.max(0, Math.floor(Number(tier_index)) || 0);
  return BASE_CAPACITY_CONST + BASE_CAPACITY_LINEAR * i + BASE_CAPACITY_QUAD * i * i;
}
function capacity_per_side_ml(tier_index, height_cm) {
  return base_capacity_per_side_ml(tier_index) * frame_modifier(height_cm);
}

function bust_projection_cm(tier_index, height_cm, breast_shape, lactation_active, fill_percent) {
  const tissue_wt = weight_per_side_kg(tier_index, height_cm);
  if (tissue_wt <= 0) return 0;
  const tissue_vol = tissue_wt / TISSUE_DENSITY_KG_PER_CM3;
  let milk_vol = 0;
  if (lactation_active && fill_percent > 0) {
    milk_vol = capacity_per_side_ml(tier_index, height_cm) * (Math.min(100, fill_percent) / 100);
  }
  const total_vol = tissue_vol + milk_vol;
  const base_r = Math.pow((3 * total_vol) / (2 * Math.PI), 1 / 3);
  const t = Math.max(0, Math.floor(Number(tier_index)) || 0);
  const shape = breast_shape || 'firm';
  let shape_factor;
  if (shape === 'natural') shape_factor = 1.0 + 0.3 * Math.log(1 + t / 10);
  else if (shape === 'gravity_defying') shape_factor = 1.0 + 0.5 * Math.log(1 + t / 4);
  else shape_factor = 1.0 + 0.4 * Math.log(1 + t / 6);
  if (lactation_active && fill_percent > 0) {
    shape_factor += 0.15 * Math.pow(Math.min(100, fill_percent) / 100, 1.5);
  }
  const flattenFactor = Math.min(1.0, 0.7 + 0.015 * t);
  return Math.round(base_r * flattenFactor * shape_factor * 10) / 10;
}

function bust_cm(tier_index, waist_cm, height_cm, breast_shape, lactation_active, fill_percent, build) {
  let i = Math.max(0, Math.floor(Number(tier_index)) || 0);
  let w = Number(waist_cm);
  if (!Number.isFinite(w) || w <= 0) w = BASELINE_WAIST_CM;
  const proj = bust_projection_cm(i, height_cm || FRAME_MODIFIER_REF_HEIGHT_CM, breast_shape, lactation_active, fill_percent);
  const bandOffset = BUILD_BAND_OFFSET[build || 'average'] || 5;
  const band = w + bandOffset;
  const coverage = Math.min(0.95, 0.5 + 0.002 * i);
  const circFactor = SHAPE_CIRC_FACTOR[breast_shape || 'firm'] || 1.0;
  return band + 2 * Math.PI * proj * coverage * circFactor;
}

// ── Real-world reference: cup letter from (bust − band) cm, US system ──
// US: each cup step ≈ 1 inch (2.54 cm) of (bust − band). 1in=A,2in=B,3in=C,4in=D,
// 5in=DD/E,6in=DDD/F,7in=G,8in=H,9in=I,10in=J,11in=K ... (US convention, +1 letter
// per inch above DD; uses single-letter US progression A,B,C,D,DD,DDD,G,H,I,J,K,...).
function us_cup_from_diff_cm(diff_cm) {
  const inches = diff_cm / 2.54;
  const n = Math.round(inches); // nearest whole inch
  const us = ['AA','A','B','C','D','DD','DDD','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];
  if (n <= 0) return 'AA-';
  if (n < us.length) return us[n] + ` (~${n}")`;
  return `>${us[us.length-1]} (~${n}")`;
}

// ── Report ──
const FRAME = { waist: 61, height: 165, build: 'curvy', shape: 'natural', lact: false, fill: 0 };
const tiers = [0, 2, 4, 6, 8, 13, 20, 27, 40, 50];

console.log('Frame: waist=' + FRAME.waist + ' height=' + FRAME.height + ' build=' + FRAME.build + ' shape=' + FRAME.shape + ' lactation=' + FRAME.lact);
console.log('band = waist + BUILD_BAND_OFFSET[curvy=8] = ' + (FRAME.waist + BUILD_BAND_OFFSET[FRAME.build]) + ' cm');
console.log('');
const band = FRAME.waist + BUILD_BAND_OFFSET[FRAME.build];

const cols = ['tier','letter','bust_cm','band','bust-band','proj_cm','wt/side_kg','wt_total_kg','vol/side_ml','impliedCup(b-b)'];
console.log(cols.join('\t'));
for (const t of tiers) {
  const proj = bust_projection_cm(t, FRAME.height, FRAME.shape, FRAME.lact, FRAME.fill);
  const bust = bust_cm(t, FRAME.waist, FRAME.height, FRAME.shape, FRAME.lact, FRAME.fill, FRAME.build);
  const wps = weight_per_side_kg(t, FRAME.height);
  const vol = wps / TISSUE_DENSITY_KG_PER_CM3; // ml per side (tissue)
  const diff = bust - band;
  const row = [
    t,
    tier_index_to_letter(t),
    bust.toFixed(2),
    band.toFixed(0),
    diff.toFixed(1),
    proj.toFixed(1),
    wps.toFixed(3),
    (wps*2).toFixed(2),
    Math.round(vol),
    us_cup_from_diff_cm(diff),
  ];
  console.log(row.join('\t'));
}

console.log('\n=== Per-axis implied cup, tier 6 (curvy, natural) ===');
const t6_wps = weight_per_side_kg(6, 165);
const t6_vol = t6_wps / TISSUE_DENSITY_KG_PER_CM3;
const t6_proj = bust_projection_cm(6,165,'natural',false,0);
const t6_bust = bust_cm(6,61,165,'natural',false,0,'curvy');
console.log('weight/side = '+t6_wps.toFixed(3)+' kg ; total = '+(t6_wps*2).toFixed(2)+' kg');
console.log('tissue vol/side = '+Math.round(t6_vol)+' ml');
console.log('projection = '+t6_proj.toFixed(1)+' cm');
console.log('bust = '+t6_bust.toFixed(2)+' ; band=69 ; bust-band = '+(t6_bust-69).toFixed(1)+' cm');

// Sanity: what bust-band does the engine's OWN projection geometrically imply?
// If a breast of projection P sits on the chest as a spherical cap, the added
// circumference over band is roughly the extra path over two such caps. A cruder
// but defensible proxy: the diameter footprint. Show projection-implied diff.
console.log('\n=== What does the engine projection geometrically imply for added bust circ? ===');
for (const t of [2,6,13,20]) {
  const proj = bust_projection_cm(t,165,'natural',false,0);
  const wps = weight_per_side_kg(t,165);
  const vol = wps/TISSUE_DENSITY_KG_PER_CM3;
  // sphere radius of that volume
  const r = Math.pow(3*vol/(4*Math.PI),1/3);
  const engineAdd = 2*Math.PI*proj*Math.min(0.95,0.5+0.002*t)*1.30;
  console.log(`tier ${t}: proj=${proj.toFixed(1)} sphereR=${r.toFixed(1)} engineAddedCirc=${engineAdd.toFixed(1)}cm (=bust-band)`);
}
