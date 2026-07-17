// Cup-sizing dimension audit — engine ladder & bust_cm vs real cross-system data.
// Verbatim-extracted Ambrosia/alpha52 functions (no logic edits) + a candidate
// repaired bust_cm, plus the real-world cup<->(bust-band)<->volume reference.
// Run: node research/body-db/_cup_check.mjs

// ─────────────────────────── ENGINE (verbatim) ───────────────────────────
const FRAME_MODIFIER_REF_HEIGHT_CM = 165;
const SHAPE_CIRC_FACTOR = { natural: 1.30, firm: 1.0, gravity_defying: 0.80 };
const BUILD_BAND_OFFSET = { petite: 3, slim: 4, average: 5, curvy: 8, athletic: 5, full: 10 };
const BASE_WEIGHT_CONST = 0.18, BASE_WEIGHT_LINEAR = 0.055, BASE_WEIGHT_QUAD = 0.002;
const TISSUE_DENSITY_KG_PER_CM3 = 0.00095;
const BASELINE_WAIST_CM = 61;

function frame_modifier(h){ h = Number(h); if(!Number.isFinite(h)||h<100)h=100; return Math.pow(h/FRAME_MODIFIER_REF_HEIGHT_CM,1.5); }
function base_weight_per_side_kg(t){ let i=Math.max(0,Math.floor(Number(t))||0); return BASE_WEIGHT_CONST+BASE_WEIGHT_LINEAR*i+BASE_WEIGHT_QUAD*i*i; }
function weight_per_side_kg(t,h){ return base_weight_per_side_kg(t)*frame_modifier(h); }

function bust_projection_cm(t,h,shape){
  const tissue_wt = weight_per_side_kg(t,h); if(tissue_wt<=0)return 0;
  const tissue_vol = tissue_wt/TISSUE_DENSITY_KG_PER_CM3;
  const base_r = Math.pow((3*tissue_vol)/(2*Math.PI),1/3);
  t = Math.max(0,Math.floor(Number(t))||0);
  shape = shape||'firm';
  let sf;
  if(shape==='natural') sf = 1.0+0.3*Math.log(1+t/10);
  else if(shape==='gravity_defying') sf = 1.0+0.5*Math.log(1+t/4);
  else sf = 1.0+0.4*Math.log(1+t/6);
  const flatten = Math.min(1.0,0.7+0.015*t);
  return Math.round(base_r*flatten*sf*10)/10;
}

// CURRENT engine bust_cm (the suspect formula)
function bust_cm_current(t,waist,h,shape,build){
  let i=Math.max(0,Math.floor(Number(t))||0);
  let w=Number(waist); if(!Number.isFinite(w)||w<=0)w=BASELINE_WAIST_CM;
  const proj = bust_projection_cm(i,h||FRAME_MODIFIER_REF_HEIGHT_CM,shape);
  const band = w+(BUILD_BAND_OFFSET[build||'average']||5);
  const coverage = Math.min(0.95,0.5+0.002*i);
  const circ = SHAPE_CIRC_FACTOR[shape||'firm']||1.0;
  return band + 2*Math.PI*proj*coverage*circ;
}
// CANDIDATE repaired bust_cm: bust-band = 2 * projection * shapeSpread (small)
const SHAPE_CIRC_SPREAD = { natural: 1.15, firm: 1.0, gravity_defying: 0.85 };
function bust_cm_repaired(t,waist,h,shape,build){
  let i=Math.max(0,Math.floor(Number(t))||0);
  let w=Number(waist); if(!Number.isFinite(w)||w<=0)w=BASELINE_WAIST_CM;
  const proj = bust_projection_cm(i,h||FRAME_MODIFIER_REF_HEIGHT_CM,shape);
  const band = w+(BUILD_BAND_OFFSET[build||'average']||5);
  const spread = SHAPE_CIRC_SPREAD[shape||'firm']||1.0;
  return band + 2*proj*spread;
}

function tier_index_to_letter(t){
  let i=Math.floor(Number(t)); if(!Number.isFinite(i)||i<0)i=0;
  if(i<50){ const li=Math.floor(i/2); const dbl=(i%2===1); const ch=String.fromCharCode(65+li); return dbl?ch+ch:ch; }
  if(i===50)return 'Z'; if(i===51)return 'ZZ';
  const adj=i-52; const zc=Math.floor(adj/50)+1; const pos=adj%50;
  const zp='Z'.repeat(zc); const li=Math.floor(pos/2); const dbl=(pos%2===1); const ch=String.fromCharCode(65+li);
  return zp+(dbl?ch+ch:ch);
}

// ──────────────────── REAL-WORLD CROSS-SYSTEM REFERENCE ────────────────────
// bust-band difference in inches -> US / UK / EU letters (Breakout Bras + calc.net).
// index = inches of (bust - band). [0]=AA(<1"), then 1"..16".
const US_BY_INCH = ['AA','A','B','C','D','DD','DDD','G','H','I','J','K','L','M','N','O','P'];
const UK_BY_INCH = ['AA','A','B','C','D','DD','E','F','FF','G','GG','H','HH','J','JJ','K','KK'];
const EU_BY_INCH = ['AA','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];

function inchesOf(diff_cm){ return diff_cm/2.54; }
function cupUS(diff_cm){ const n=Math.round(inchesOf(diff_cm)); if(n<=0)return 'AA-'; return n<US_BY_INCH.length?US_BY_INCH[n]:'>'+US_BY_INCH[US_BY_INCH.length-1]; }
function cupUK(diff_cm){ const n=Math.round(inchesOf(diff_cm)); if(n<=0)return 'AA-'; return n<UK_BY_INCH.length?UK_BY_INCH[n]:'>'+UK_BY_INCH[UK_BY_INCH.length-1]; }

// Real per-breast VOLUME by cup at a fixed band. HauteFlair 34-band table (cc),
// extended by +175cc/cup (34-band implant cadence). 1 mL = 1 cc.
// AA180 A230 B290 C340 D400 DD460 E510(=DDD) then +~70-90 trailing the table slope.
const VOL34 = {AA:180,A:230,B:290,C:340,D:400,DD:460,E:510,F:580,G:650,H:720,I:800,J:880,K:960};
// At a 32 band: ~160cc/cup; subtract ~one band-step (~30-40cc) per smaller band.
// Real "cup index" -> cc on a 34 band (interp), and inverse.
const VOL34_PTS = [[0.5,150],[1,230],[2,290],[3,340],[4,400],[5,460],[6,510],[7,580],[8,650],[9,720],[10,800],[11,880],[12,960]];
function ccToFracCupIndex(cc){ // returns inches-of-bust-band-equivalent on a 34 band
  if(cc<=VOL34_PTS[0][1]) return VOL34_PTS[0][0];
  for(let k=1;k<VOL34_PTS.length;k++){ if(cc<=VOL34_PTS[k][1]){ const [c0,v0]=VOL34_PTS[k-1],[c1,v1]=VOL34_PTS[k]; return c0+(c1-c0)*(cc-v0)/(v1-v0);} }
  const [c0,v0]=VOL34_PTS[VOL34_PTS.length-2],[c1,v1]=VOL34_PTS[VOL34_PTS.length-1];
  return c1+(c1-c0)*(cc-v1)/(v1-v0);
}
function fracCupLetterUK(idx){ // map fractional inch-index to nearest UK letter label
  const n=Math.round(idx); if(n<=0)return 'AA-'; return n<UK_BY_INCH.length?UK_BY_INCH[n]:'>'+UK_BY_INCH[UK_BY_INCH.length-1];
}

// ───────────────────────────── REPORT ─────────────────────────────
const FRAME = { waist:61, height:165, build:'curvy', shape:'natural' };
const band = FRAME.waist + BUILD_BAND_OFFSET[FRAME.build];
console.log('FRAME: waist='+FRAME.waist+' height='+FRAME.height+' build='+FRAME.build+' shape='+FRAME.shape);
console.log('band = '+band+' cm ('+(band/2.54).toFixed(1)+'") | volume column anchored to a 34" band reference\n');

console.log('=== TABLE 1 — three-way size signal divergence (current vs repaired bust_cm) ===');
const hdr=['tier','letter','vol/side cc','cupFromVol(34band,UK)','== CURRENT ==','b-b cm','cupFrom_b-b(UK)','== REPAIRED ==','b-b cm','cupFrom_b-b(UK)'];
console.log(hdr.join('\t'));
const tiers=[0,1,2,3,4,5,6,8,10,12,13,16,20,24,27,30,40,50];
for(const t of tiers){
  const wps=weight_per_side_kg(t,FRAME.height);
  const vol=wps/TISSUE_DENSITY_KG_PER_CM3;
  const cupVol=fracCupLetterUK(ccToFracCupIndex(vol));
  const bc=bust_cm_current(t,FRAME.waist,FRAME.height,FRAME.shape,FRAME.build);
  const bbC=bc-band;
  const br=bust_cm_repaired(t,FRAME.waist,FRAME.height,FRAME.shape,FRAME.build);
  const bbR=br-band;
  console.log([t,tier_index_to_letter(t),Math.round(vol),cupVol,'',bbC.toFixed(1),cupUK(bbC),'',bbR.toFixed(1),cupUK(bbR)].join('\t'));
}

console.log('\n=== TABLE 2 — bra-calculator ACCEPTANCE TEST (does engine bust_cm + band reproduce the label?) ===');
console.log('A real calculator: cup = round((bust-band)/2.54)" -> letter. Feed engine bust_cm back in.');
console.log(['tier','engine letter','CURRENT bust->cupUS','CURRENT bust->cupUK','match?','REPAIRED bust->cupUK','match(vs vol)?','volCup(UK)'].join('\t'));
for(const t of tiers){
  const wps=weight_per_side_kg(t,FRAME.height); const vol=wps/TISSUE_DENSITY_KG_PER_CM3;
  const cupVol=fracCupLetterUK(ccToFracCupIndex(vol));
  const bc=bust_cm_current(t,FRAME.waist,FRAME.height,FRAME.shape,FRAME.build); const bbC=bc-band;
  const br=bust_cm_repaired(t,FRAME.waist,FRAME.height,FRAME.shape,FRAME.build); const bbR=br-band;
  const eng=tier_index_to_letter(t);
  console.log([t,eng,cupUS(bbC),cupUK(bbC),(cupUK(bbC)===eng?'Y':'n'),cupUK(bbR),(cupUK(bbR)===cupVol?'Y':'n'),cupVol].join('\t'));
}

console.log('\n=== TABLE 3 — cm-per-cup CADENCE of the current ladder label vs physical axes ===');
console.log('Per +1 tier (=half a labeled cup step): how much do bust-band(cm) and volume(cc) actually grow?');
console.log(['tier->tier+1','letterStep','d(b-b) current cm','d(b-b) repaired cm','d(vol) cc'].join('\t'));
for(const t of [0,2,4,6,10,13,20,30,40]){
  const v0=weight_per_side_kg(t,165)/TISSUE_DENSITY_KG_PER_CM3, v1=weight_per_side_kg(t+1,165)/TISSUE_DENSITY_KG_PER_CM3;
  const c0=bust_cm_current(t,61,165,'natural','curvy'), c1=bust_cm_current(t+1,61,165,'natural','curvy');
  const r0=bust_cm_repaired(t,61,165,'natural','curvy'), r1=bust_cm_repaired(t+1,61,165,'natural','curvy');
  console.log([t+'->'+(t+1),tier_index_to_letter(t)+'->'+tier_index_to_letter(t+1),(c1-c0).toFixed(2),(r1-r0).toFixed(2),Math.round(v1-v0)].join('\t'));
}

console.log('\n=== TABLE 4 — the ladder letters themselves (engine vs what AA/half-steps mean) ===');
console.log(['idx','engine letter','UK-real cup at this # of half-cup-inch steps from A'].join('\t'));
for(const t of [0,1,2,3,4,5,6,7,8,10,12]){
  console.log([t,tier_index_to_letter(t),'(idx/2)="'+(t/2).toFixed(1)+'" cups over base'].join('\t'));
}
