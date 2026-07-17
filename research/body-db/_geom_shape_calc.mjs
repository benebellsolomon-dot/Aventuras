// Geometry/shape dimension dump: projection, cleavage, hang, bounce across tiers & shapes.
// Verbatim-extracted from ambrosia.naiscript (read-only). For the geometry-shape audit.

const FRAME_MODIFIER_REF_HEIGHT_CM = 165;
const FRAME_MODIFIER_EXPONENT = 1.5;
const BASE_WEIGHT_CONST = 0.18, BASE_WEIGHT_LINEAR = 0.055, BASE_WEIGHT_QUAD = 0.002;
const BASE_CAPACITY_CONST = 50, BASE_CAPACITY_LINEAR = 25, BASE_CAPACITY_QUAD = 1.5;
const TISSUE_DENSITY_KG_PER_CM3 = 0.00095;
const SHAPE_CIRC_FACTOR = { natural: 1.30, firm: 1.0, gravity_defying: 0.80 };
const SHAPE_CLEAVAGE_FACTOR = { natural: 0.3, firm: 0.5, gravity_defying: 0.7 };
const SHAPE_HANG_BASE = { natural: 0.6, firm: 0.25, gravity_defying: 0 };
const SHAPE_HANG_TIER_SCALE = { natural: 0.003, firm: 0.001, gravity_defying: 0 };
const SHAPE_BOUNCE = {
  natural:         { proj_mult: 0.4, cap: 15, tier_scale: 0.3 },
  firm:            { proj_mult: 0.2, cap: 8,  tier_scale: 0.15 },
  gravity_defying: { proj_mult: 0.08, cap: 3, tier_scale: 0.05 },
};
const BUILD_BAND_OFFSET = { petite: 3, slim: 4, average: 5, curvy: 8, athletic: 5, full: 10 };

function frame_modifier(h){ h=Number(h); if(!isFinite(h)||h<100)h=100; return Math.pow(h/FRAME_MODIFIER_REF_HEIGHT_CM, FRAME_MODIFIER_EXPONENT); }
function weight_per_side_kg(t,h){ let i=Math.max(0,Math.floor(t)||0); return (BASE_WEIGHT_CONST+BASE_WEIGHT_LINEAR*i+BASE_WEIGHT_QUAD*i*i)*frame_modifier(h); }
function capacity_per_side_ml(t,h){ let i=Math.max(0,Math.floor(t)||0); return (BASE_CAPACITY_CONST+BASE_CAPACITY_LINEAR*i+BASE_CAPACITY_QUAD*i*i)*frame_modifier(h); }

function bust_projection_cm(tier_index, height_cm, breast_shape, lactation_active, fill_percent) {
  const tissue_wt = weight_per_side_kg(tier_index, height_cm);
  if (tissue_wt <= 0) return 0;
  const tissue_vol = tissue_wt / TISSUE_DENSITY_KG_PER_CM3;
  let milk_vol = 0;
  if (lactation_active && fill_percent > 0) milk_vol = capacity_per_side_ml(tier_index, height_cm) * (Math.min(100, fill_percent) / 100);
  const total_vol = tissue_vol + milk_vol;
  const base_r = Math.pow((3 * total_vol) / (2 * Math.PI), 1 / 3);
  const t = Math.max(0, Math.floor(Number(tier_index)) || 0);
  const shape = breast_shape || 'firm';
  let shape_factor;
  if (shape === 'natural') shape_factor = 1.0 + 0.3 * Math.log(1 + t / 10);
  else if (shape === 'gravity_defying') shape_factor = 1.0 + 0.5 * Math.log(1 + t / 4);
  else shape_factor = 1.0 + 0.4 * Math.log(1 + t / 6);
  if (lactation_active && fill_percent > 0) shape_factor += 0.15 * Math.pow(Math.min(100, fill_percent) / 100, 1.5);
  const flattenFactor = Math.min(1.0, 0.7 + 0.015 * t);
  return Math.round(base_r * flattenFactor * shape_factor * 10) / 10;
}
function cleavage_depth_cm(projection_cm, breast_shape, lactation_active, fill_percent) {
  const shapeFactor = SHAPE_CLEAVAGE_FACTOR[breast_shape || 'firm'] || 0.5;
  const lactBoost = (lactation_active && fill_percent > 0) ? 0.15 * Math.pow(Math.min(100, fill_percent) / 100, 0.5) : 0;
  return Math.round(projection_cm * shapeFactor * (1 + lactBoost) * 10) / 10;
}
function hang_drop_cm(projection_cm, tier_index, breast_shape, lactation_active, fill_percent) {
  const shape = breast_shape || 'firm';
  if (shape === 'gravity_defying') return 0;
  const t = Math.max(0, Math.floor(Number(tier_index)) || 0);
  const baseFactor = (SHAPE_HANG_BASE[shape] || 0.25) + (SHAPE_HANG_TIER_SCALE[shape] || 0.001) * t;
  let firmReduction = 0;
  if (lactation_active && fill_percent > 50) firmReduction = 0.08 * (Math.min(100, fill_percent) - 50) / 50;
  return Math.round(projection_cm * Math.max(0.1, baseFactor - firmReduction) * 10) / 10;
}
function bounce_amplitude_cm(projection_cm, tier_index, breast_shape, lactation_active, fill_percent) {
  const shape = breast_shape || 'firm';
  const t = Math.max(0, Math.floor(Number(tier_index)) || 0);
  const params = SHAPE_BOUNCE[shape] || SHAPE_BOUNCE.firm;
  const baseBounce = Math.min(projection_cm * params.proj_mult, params.cap + t * params.tier_scale);
  const dampening = (lactation_active && fill_percent > 0) ? 0.85 : 1.0;
  return Math.round(baseBounce * dampening * 10) / 10;
}

// Helper: sphere radius & hemisphere radius of the engine's own tissue volume
function sphereR(vol){ return Math.pow(3*vol/(4*Math.PI),1/3); }
function hemiR(vol){ return Math.pow(3*vol/(2*Math.PI),1/3); }

const H = 165;
const tiers = [0,1,2,3,4,5,6,8,10,12,13,16,20,24,27,30,40,50,60,82,120,200];

console.log('=== PROJECTION by shape (height 165, no lactation) ===');
console.log('tier\tletter?\tvol/side\tsphereR\themiR\tproj_nat\tproj_firm\tproj_GD\tflatten\tshFac_firm');
for (const t of tiers) {
  const vol = weight_per_side_kg(t,H)/TISSUE_DENSITY_KG_PER_CM3;
  const sf_firm = 1.0+0.4*Math.log(1+t/6);
  const flat = Math.min(1.0,0.7+0.015*t);
  console.log([t,
    Math.round(vol),
    sphereR(vol).toFixed(1),
    hemiR(vol).toFixed(1),
    bust_projection_cm(t,H,'natural',false,0).toFixed(1),
    bust_projection_cm(t,H,'firm',false,0).toFixed(1),
    bust_projection_cm(t,H,'gravity_defying',false,0).toFixed(1),
    flat.toFixed(3),
    sf_firm.toFixed(2),
  ].join('\t'));
}

console.log('\n=== CLEAVAGE / HANG / BOUNCE (firm shape, no lactation) ===');
console.log('tier\tproj_firm\tcleav\thang\tbounce\tbounce/proj');
for (const t of tiers) {
  const p = bust_projection_cm(t,H,'firm',false,0);
  const c = cleavage_depth_cm(p,'firm',false,0);
  const h = hang_drop_cm(p,t,'firm',false,0);
  const b = bounce_amplitude_cm(p,t,'firm',false,0);
  console.log([t,p.toFixed(1),c.toFixed(1),h.toFixed(1),b.toFixed(1),(b/p).toFixed(2)].join('\t'));
}

console.log('\n=== CLEAVAGE / HANG / BOUNCE (natural shape, no lactation) ===');
console.log('tier\tproj_nat\tcleav\thang\tbounce\thang/proj');
for (const t of tiers) {
  const p = bust_projection_cm(t,H,'natural',false,0);
  const c = cleavage_depth_cm(p,'natural',false,0);
  const h = hang_drop_cm(p,t,'natural',false,0);
  const b = bounce_amplitude_cm(p,t,'natural',false,0);
  console.log([t,p.toFixed(1),c.toFixed(1),h.toFixed(1),b.toFixed(1),(h/p).toFixed(2)].join('\t'));
}

console.log('\n=== Realistic-range focus: projection vs literature cup (natural & firm) ===');
// Map engine tier to its volume-implied real cup (32-band anchored, per prior audit's table)
const realVolByCup = [[150,'A'],[250,'B'],[350,'C'],[450,'D'],[570,'DD/E'],[640,'F'],[750,'G'],[900,'H'],[1050,'I'],[1200,'J']];
function volCup(v){ let best='?',bd=1e9; for(const[vol,c] of realVolByCup){const d=Math.abs(vol-v);if(d<bd){bd=d;best=c;}} return best; }
console.log('tier\tvol/side\tvolCup\tproj_nat\tproj_firm');
for (const t of [0,1,2,3,4,5,6,8,10,12,13]) {
  const vol = weight_per_side_kg(t,H)/TISSUE_DENSITY_KG_PER_CM3;
  console.log([t,Math.round(vol),volCup(vol),bust_projection_cm(t,H,'natural',false,0).toFixed(1),bust_projection_cm(t,H,'firm',false,0).toFixed(1)].join('\t'));
}

console.log('\n=== Lactation effect on projection (tier 6 & 13, natural) ===');
for (const t of [6,13]) {
  for (const f of [0,50,100]) {
    console.log(`tier ${t} fill ${f}%: proj=${bust_projection_cm(t,H,'natural',true,f).toFixed(1)} cleav=${cleavage_depth_cm(bust_projection_cm(t,H,'natural',true,f),'natural',true,f).toFixed(1)} hang=${hang_drop_cm(bust_projection_cm(t,H,'natural',true,f),t,'natural',true,f).toFixed(1)} bounce=${bounce_amplitude_cm(bust_projection_cm(t,H,'natural',true,f),t,'natural',true,f).toFixed(1)}`);
  }
}

console.log('\n=== Bounce cap saturation check (does the cap ever bind? natural) ===');
console.log('tier\tproj*0.4\tcap(15+0.3t)\tbinds?');
for (const t of [0,10,20,27,30,40,50,60,82,120,200]) {
  const p = bust_projection_cm(t,H,'natural',false,0);
  const raw = p*0.4, cap = 15+t*0.3;
  console.log([t,raw.toFixed(1),cap.toFixed(1),(raw>cap?'CAP':'proj')].join('\t'));
}

console.log('\n=== Hang vs projection: does hang exceed projection at high tier? (natural) ===');
console.log('tier\tproj\thangFactor(0.6+0.003t)\thang_cm');
for (const t of [0,20,50,82,120,133,200]) {
  const p = bust_projection_cm(t,H,'natural',false,0);
  const hf = 0.6+0.003*t;
  console.log([t,p.toFixed(1),hf.toFixed(3),(p*hf).toFixed(1)].join('\t'));
}
