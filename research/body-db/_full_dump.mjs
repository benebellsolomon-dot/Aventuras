// Full-spectrum dump of EVERY engine body dimension across ALL tiers (0..260+),
// verbatim-extracted from ambrosia.naiscript / alpha52. Read-only audit tool.
// Purpose: cross-check internal consistency (prose ladder vs mass, milestones vs
// mass, shape descriptors, posture, the fantasy range). No logic edits.

// ── constants (verbatim) ──
const BASELINE_WAIST_CM = 61;
const FRAME_MODIFIER_REF_HEIGHT_CM = 165;
const FRAME_MODIFIER_EXPONENT = 1.5;
const BASE_WEIGHT_CONST = 0.18, BASE_WEIGHT_LINEAR = 0.055, BASE_WEIGHT_QUAD = 0.002;
const SHAPE_CIRC_FACTOR = { natural: 1.30, firm: 1.0, gravity_defying: 0.80 };
const SHAPE_POSTURE_FACTOR = { natural: 1.25, firm: 1.0, gravity_defying: 0.65 };
const BUILD_WEIGHT_MODS = { petite: -8, slim: -4, average: 0, curvy: 4, athletic: 3, full: 8 };
const BUILD_BAND_OFFSET = { petite: 3, slim: 4, average: 5, curvy: 8, athletic: 5, full: 10 };
const SHAPE_CLEAVAGE_FACTOR = { natural: 0.3, firm: 0.5, gravity_defying: 0.7 };
const SHAPE_HANG_BASE = { natural: 0.6, firm: 0.25, gravity_defying: 0 };
const SHAPE_HANG_TIER_SCALE = { natural: 0.003, firm: 0.001, gravity_defying: 0 };
const SHAPE_BOUNCE = {
  natural: { proj_mult: 0.4, cap: 15, tier_scale: 0.3 },
  firm: { proj_mult: 0.2, cap: 8, tier_scale: 0.15 },
  gravity_defying: { proj_mult: 0.08, cap: 3, tier_scale: 0.05 },
};
const BASE_CAPACITY_CONST = 50, BASE_CAPACITY_LINEAR = 25, BASE_CAPACITY_QUAD = 1.5;
const DEFAULT_FLUID_DENSITY = 1.03;
const BODY_WEIGHT_HEIGHT_FACTOR = 0.4, BODY_WEIGHT_HEIGHT_OFFSET = 8;
const TISSUE_DENSITY_KG_PER_CM3 = 0.00095;

const INTERACTION_MILESTONES = [
  { weight_kg: 1.5, description: 'can no longer go braless comfortably' },
  { weight_kg: 2.7, description: 'cleavage visible in any neckline' },
  { weight_kg: 4.0, description: 'cannot see her own feet when standing' },
  { weight_kg: 6.0, description: 'cannot reach past them to touch her toes' },
  { weight_kg: 7.5, description: 'her lap disappears beneath them when seated' },
  { weight_kg: 10.0, description: 'breasts press warmly between them whenever she embraces someone' },
  { weight_kg: 14.0, description: 'must turn sideways to fit through standard doorways' },
  { weight_kg: 20.0, description: 'cannot reach the ground past them when standing' },
  { weight_kg: 30.0, description: 'cannot stand unaided for extended periods' },
  { weight_kg: 45.0, description: 'cannot fit in a standard chair' },
  { weight_kg: 70.0, description: 'requires custom-built furniture to sit' },
  { weight_kg: 130.0, description: 'requires structural modifications to any room she occupies' },
  { weight_kg: 180.0, description: 'requires architectural accommodation — standard buildings cannot contain her' },
];
const POSTURE_THRESHOLDS = [
  { ratio_max: 0.024, posture: 'unaffected' }, { ratio_max: 0.043, posture: 'minor forward tilt' },
  { ratio_max: 0.074, posture: 'noticeable forward lean' }, { ratio_max: 0.123, posture: 'pronounced forward arch' },
  { ratio_max: 0.20, posture: 'profound permanent arch' }, { ratio_max: 0.286, posture: 'spine bowed under weight' },
  { ratio_max: 0.40, posture: 'structurally dominated' }, { ratio_max: 0.55, posture: 'body secondary to breasts' },
  { ratio_max: 0.70, posture: 'vestigial beneath their mass' }, { ratio_max: Infinity, posture: 'body exists only as origin' },
];
const COMPARATIVE_DESCRIPTIONS_TIERMAX = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,29,31,33,35,37,39,41,43,45,47,49,51,58,66,74,82,92,105,120,140,165,200,Infinity];
const SHAPE_DESC_NATURAL_TIERMAX = [7,21,42,82,155,Infinity];

function frame_modifier(h){h=Number(h);if(!Number.isFinite(h)||h<100)h=100;return Math.pow(h/FRAME_MODIFIER_REF_HEIGHT_CM,FRAME_MODIFIER_EXPONENT);}
function base_weight_per_side_kg(i){i=Math.max(0,Math.floor(Number(i))||0);return BASE_WEIGHT_CONST+BASE_WEIGHT_LINEAR*i+BASE_WEIGHT_QUAD*i*i;}
function weight_per_side_kg(i,h){return base_weight_per_side_kg(i)*frame_modifier(h);}
function base_capacity_per_side_ml(i){i=Math.max(0,Math.floor(Number(i))||0);return BASE_CAPACITY_CONST+BASE_CAPACITY_LINEAR*i+BASE_CAPACITY_QUAD*i*i;}
function capacity_per_side_ml(i,h){return base_capacity_per_side_ml(i)*frame_modifier(h);}
function estimated_body_weight_kg(h,build){h=Number(h);if(!Number.isFinite(h)||h<100)h=100;const m=BUILD_WEIGHT_MODS[build]||0;return Math.max(20,h*BODY_WEIGHT_HEIGHT_FACTOR-BODY_WEIGHT_HEIGHT_OFFSET+m);}
function tier_index_to_letter(i){i=Math.floor(Number(i));if(!Number.isFinite(i)||i<0)i=0;if(i<50){const li=Math.floor(i/2),dbl=(i%2===1),ch=String.fromCharCode(65+li);return dbl?ch+ch:ch;}if(i===50)return'Z';if(i===51)return'ZZ';const adj=i-52,zc=Math.floor(adj/50)+1,pos=adj%50,zp='Z'.repeat(zc),li=Math.floor(pos/2),dbl=(pos%2===1),ch=String.fromCharCode(65+li);return zp+(dbl?ch+ch:ch);}
function bust_projection_cm(i,h,shape,lact,fill){const tw=weight_per_side_kg(i,h);if(tw<=0)return 0;const tv=tw/TISSUE_DENSITY_KG_PER_CM3;let mv=0;if(lact&&fill>0)mv=capacity_per_side_ml(i,h)*(Math.min(100,fill)/100);const total=tv+mv;const base_r=Math.pow((3*total)/(2*Math.PI),1/3);const t=Math.max(0,Math.floor(Number(i))||0);shape=shape||'firm';let sf;if(shape==='natural')sf=1+0.3*Math.log(1+t/10);else if(shape==='gravity_defying')sf=1+0.5*Math.log(1+t/4);else sf=1+0.4*Math.log(1+t/6);if(lact&&fill>0)sf+=0.15*Math.pow(Math.min(100,fill)/100,1.5);const ff=Math.min(1,0.7+0.015*t);return Math.round(base_r*ff*sf*10)/10;}
function bust_cm(i,w,h,shape,lact,fill,build){i=Math.max(0,Math.floor(Number(i))||0);w=Number(w);if(!Number.isFinite(w)||w<=0)w=BASELINE_WAIST_CM;const proj=bust_projection_cm(i,h||FRAME_MODIFIER_REF_HEIGHT_CM,shape,lact,fill);const bo=BUILD_BAND_OFFSET[build||'average']||5;const band=w+bo;const cov=Math.min(0.95,0.5+0.002*i);const cf=SHAPE_CIRC_FACTOR[shape||'firm']||1;return band+2*Math.PI*proj*cov*cf;}
function posture_ratio(i,h,build,shape){const tb=weight_per_side_kg(i,h)*2;const body=estimated_body_weight_kg(h,build);const br=tb/(body+tb);const sf=SHAPE_POSTURE_FACTOR[shape||'firm']||1;return Math.min(0.95,br*sf);}
function posture_label(r){for(const b of POSTURE_THRESHOLDS)if(r<b.ratio_max)return b.posture;return POSTURE_THRESHOLDS[POSTURE_THRESHOLDS.length-1].posture;}
function bandIndexFor(i,arr){for(let k=0;k<arr.length;k++)if(i<=arr[k])return k;return arr.length-1;}
function hang_drop_cm(proj,i,shape){shape=shape||'firm';if(shape==='gravity_defying')return 0;const t=Math.max(0,Math.floor(Number(i))||0);const bf=(SHAPE_HANG_BASE[shape]||0.25)+(SHAPE_HANG_TIER_SCALE[shape]||0.001)*t;return Math.round(proj*Math.max(0.1,bf)*10)/10;}
function bounce_amplitude_cm(proj,i,shape){shape=shape||'firm';const t=Math.max(0,Math.floor(Number(i))||0);const p=SHAPE_BOUNCE[shape]||SHAPE_BOUNCE.firm;const b=Math.min(proj*p.proj_mult,p.cap+t*p.tier_scale);return Math.round(b*10)/10;}
function cleavage_depth_cm(proj,shape){const sf=SHAPE_CLEAVAGE_FACTOR[shape||'firm']||0.5;return Math.round(proj*sf*10)/10;}

// ── frame: the engine default "average" + baseline waist + ref height ──
const H=165, W=61, build='average', shape='natural';
const band = W + BUILD_BAND_OFFSET[build];
const bodyW = estimated_body_weight_kg(H,build);

function realCupVolume(volSide){
  // HauteFlair 34-band table extrapolated, 1ml=1cc. AA180 A230 B290 C340 D400 DD460 E510 +~70/cup after.
  const pts=[['AA',180],['A',230],['B',290],['C',340],['D',400],['DD',460],['E',510],['F',580],['G',650],['H',720],['I',790],['J',860],['K',930],['L',1000],['M',1070],['N',1140],['O',1210]];
  let best=pts[0][0],bd=1e9;for(const[c,v]of pts){const d=Math.abs(v-volSide);if(d<bd){bd=d;best=c;}}
  if(volSide>pts[pts.length-1][1]+40)return '>'+pts[pts.length-1][0];
  return best;
}
function usCupFromDiff(diff){const inch=diff/2.54;const n=Math.round(inch);const us=['AA','A','B','C','D','DD','DDD','G','H','I','J','K','L','M','N','O','P','Q','R','S','T'];if(n<=0)return'<AA';if(n<us.length)return us[n];return'>'+us[us.length-1];}

console.log('FRAME: H='+H+' W='+W+' build='+build+' shape='+shape+' band='+band+'cm bodyWeight='+bodyW.toFixed(1)+'kg\n');
console.log(['tier','let','wt/sd','wtTot','vol/sd','proj','b-b','bust','realVol','realBB','postRatio','posture','prose#','shape#','bounce','hang','cleav'].join('\t'));
const tiers=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,15,18,20,24,27,30,35,40,45,50,51,60,75,90,105,140,165,200,260];
for(const t of tiers){
  const wps=weight_per_side_kg(t,H), wtot=wps*2, vol=wps/TISSUE_DENSITY_KG_PER_CM3;
  const proj=bust_projection_cm(t,H,shape,false,0), bust=bust_cm(t,W,H,shape,false,0,build), bb=bust-band;
  const pr=posture_ratio(t,H,build,shape);
  const prose=bandIndexFor(t,COMPARATIVE_DESCRIPTIONS_TIERMAX);
  const sh=bandIndexFor(t,SHAPE_DESC_NATURAL_TIERMAX);
  const bnc=bounce_amplitude_cm(proj,t,shape), hng=hang_drop_cm(proj,t,shape), clv=cleavage_depth_cm(proj,shape);
  console.log([t,tier_index_to_letter(t),wps.toFixed(2),wtot.toFixed(1),Math.round(vol),proj.toFixed(1),bb.toFixed(1),bust.toFixed(0),realCupVolume(vol),usCupFromDiff(bb),pr.toFixed(3),posture_label(pr),prose,sh,bnc.toFixed(1),hng.toFixed(1),clv.toFixed(1)].join('\t'));
}

// ── Milestone crossing tiers (when total empty weight crosses each milestone) ──
console.log('\n=== INTERACTION MILESTONES: tier at which TOTAL empty weight crosses ===');
for(const m of INTERACTION_MILESTONES){
  let crossT=null;
  for(let t=0;t<=300;t++){ if(weight_per_side_kg(t,H)*2>=m.weight_kg){crossT=t;break;} }
  console.log('  '+String(m.weight_kg).padStart(6)+'kg @ tier '+String(crossT).padStart(3)+' ('+(crossT!=null?tier_index_to_letter(crossT):'never')+'): '+m.description);
}

// ── Where does posture saturate (ratio hits last band) ──
console.log('\n=== POSTURE band transitions (natural shape) ===');
let lastP=null;
for(let t=0;t<=300;t++){const p=posture_label(posture_ratio(t,H,build,shape));if(p!==lastP){console.log('  tier '+String(t).padStart(3)+' ('+tier_index_to_letter(t)+'): '+p+'  [ratio='+posture_ratio(t,H,build,shape).toFixed(3)+']');lastP=p;}}

// ── Bounce/hang cap saturation: when does projection-driven value hit the cap ──
console.log('\n=== BOUNCE saturation (natural cap=15+0.3t) ===');
for(const t of [10,20,30,50,75,100,150,200]){const proj=bust_projection_cm(t,H,'natural',false,0);const raw=proj*0.4;const cap=15+t*0.3;console.log('  tier '+String(t).padStart(3)+': proj*0.4='+raw.toFixed(1)+'  cap='+cap.toFixed(1)+'  -> '+(raw<cap?'proj-bound':'CAP-bound')+' = '+Math.min(raw,cap).toFixed(1));}

// ── tier_index_to_letter sanity at boundaries ──
console.log('\n=== LETTER LADDER boundary check ===');
for(const t of [48,49,50,51,52,53,54,100,101,102,150,200,260]) console.log('  tier '+String(t).padStart(3)+' -> '+tier_index_to_letter(t));
