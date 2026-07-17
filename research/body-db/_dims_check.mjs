// Sensitivity + skin-tension state-machine probe, and all-shape / lactation
// cross-check for bounce/hang/cleavage/projection. Verbatim-extracted. Read-only.

const FRAME_MODIFIER_REF_HEIGHT_CM=165, FRAME_MODIFIER_EXPONENT=1.5;
const BASE_WEIGHT_CONST=0.18,BASE_WEIGHT_LINEAR=0.055,BASE_WEIGHT_QUAD=0.002;
const BASE_CAPACITY_CONST=50,BASE_CAPACITY_LINEAR=25,BASE_CAPACITY_QUAD=1.5;
const TISSUE_DENSITY_KG_PER_CM3=0.00095;
const SHAPE_BOUNCE={natural:{proj_mult:0.4,cap:15,tier_scale:0.3},firm:{proj_mult:0.2,cap:8,tier_scale:0.15},gravity_defying:{proj_mult:0.08,cap:3,tier_scale:0.05}};
const SHAPE_HANG_BASE={natural:0.6,firm:0.25,gravity_defying:0};
const SHAPE_HANG_TIER_SCALE={natural:0.003,firm:0.001,gravity_defying:0};
const SHAPE_CLEAVAGE_FACTOR={natural:0.3,firm:0.5,gravity_defying:0.7};
const SENSITIVITY_LABELS=[{max:0.8,label:'dulled'},{max:1.1,label:'normal'},{max:1.4,label:'heightened'},{max:1.8,label:'sensitive'},{max:2.3,label:'hypersensitive'},{max:Infinity,label:'overwhelmed'}];
function frame_modifier(h){h=Number(h);if(!Number.isFinite(h)||h<100)h=100;return Math.pow(h/FRAME_MODIFIER_REF_HEIGHT_CM,FRAME_MODIFIER_EXPONENT);}
function weight_per_side_kg(i,h){i=Math.max(0,Math.floor(i)||0);return (BASE_WEIGHT_CONST+BASE_WEIGHT_LINEAR*i+BASE_WEIGHT_QUAD*i*i)*frame_modifier(h);}
function capacity_per_side_ml(i,h){i=Math.max(0,Math.floor(i)||0);return (BASE_CAPACITY_CONST+BASE_CAPACITY_LINEAR*i+BASE_CAPACITY_QUAD*i*i)*frame_modifier(h);}
function bust_projection_cm(i,h,shape,lact,fill){const tw=weight_per_side_kg(i,h);if(tw<=0)return 0;const tv=tw/TISSUE_DENSITY_KG_PER_CM3;let mv=0;if(lact&&fill>0)mv=capacity_per_side_ml(i,h)*(Math.min(100,fill)/100);const total=tv+mv;const base_r=Math.pow((3*total)/(2*Math.PI),1/3);const t=Math.max(0,Math.floor(i)||0);shape=shape||'firm';let sf;if(shape==='natural')sf=1+0.3*Math.log(1+t/10);else if(shape==='gravity_defying')sf=1+0.5*Math.log(1+t/4);else sf=1+0.4*Math.log(1+t/6);if(lact&&fill>0)sf+=0.15*Math.pow(Math.min(100,fill)/100,1.5);const ff=Math.min(1,0.7+0.015*t);return Math.round(base_r*ff*sf*10)/10;}
function bounce_amplitude_cm(proj,i,shape,lact,fill){shape=shape||'firm';const t=Math.max(0,Math.floor(i)||0);const p=SHAPE_BOUNCE[shape]||SHAPE_BOUNCE.firm;const b=Math.min(proj*p.proj_mult,p.cap+t*p.tier_scale);const damp=(lact&&fill>0)?0.85:1;return Math.round(b*damp*10)/10;}
function hang_drop_cm(proj,i,shape){shape=shape||'firm';if(shape==='gravity_defying')return 0;const t=Math.max(0,Math.floor(i)||0);const bf=(SHAPE_HANG_BASE[shape]||0.25)+(SHAPE_HANG_TIER_SCALE[shape]||0.001)*t;return Math.round(proj*Math.max(0.1,bf)*10)/10;}
function compute_sensitivity(i,lact,fill,gsince){const t=Math.max(0,Math.floor(i)||0);let base=1;const g=(gsince>=0)?gsince:999;if(g<=3)base*=1.5;else if(g<=6)base*=1.2;if(lact){const f=Math.max(0,Math.min(100,fill||0));if(f>=80)base*=1.8;else if(f>=50)base*=1.5;else base*=1.3;}base*=Math.max(0.7,1-t*0.001);let lab='overwhelmed';for(const b of SENSITIVITY_LABELS){if(base<=b.max){lab=b.label;break;}}return{value:Math.round(base*100)/100,label:lab};}

const H=165;
console.log('=== BOUNCE: does cap EVER bind? (all shapes, dry) ===');
for(const shape of ['natural','firm','gravity_defying']){
  let firstCap=null;
  for(let t=0;t<=300;t++){const proj=bust_projection_cm(t,H,shape,false,0);const p=SHAPE_BOUNCE[shape];if(proj*p.proj_mult>=p.cap+t*p.tier_scale){firstCap=t;break;}}
  console.log('  '+shape.padEnd(16)+': cap binds first at tier '+(firstCap===null?'NEVER (≤300) — cap+tier_scale are inert':firstCap));
}
console.log('\n=== HANG vs PROJECTION (natural) — hang exceeds projection above tier? ===');
for(const t of [10,20,30,40,50,75,100,133,150,200]){const proj=bust_projection_cm(t,H,'natural',false,0);const h=hang_drop_cm(proj,t,'natural');console.log('  tier '+String(t).padStart(3)+': proj='+proj.toFixed(1)+' hang='+h.toFixed(1)+'  ratio='+(h/proj).toFixed(2)+(h>proj?'  <-- hang>proj':''));}

console.log('\n=== SENSITIVITY state-space (tier vs gens-since-growth vs lactation) ===');
console.log('Note: tier influence is tiny (max -30% at t=300). Drivers are gens-since-growth & lactation.');
const cases=[
  ['t6 settled (g=99,dry)',6,false,0,99],['t6 just-grew (g=0,dry)',6,false,0,0],['t6 g=5 dry',6,false,0,5],
  ['t6 lact f=40 g=99',6,true,40,99],['t6 lact f=90 g=0',6,true,90,0],
  ['t50 settled dry',50,false,0,99],['t200 settled dry',200,false,0,99],['t300 settled dry',300,false,0,99],
];
for(const[name,t,l,f,g]of cases){const s=compute_sensitivity(t,l,f,g);console.log('  '+name.padEnd(24)+' -> value='+s.value+' label='+s.label);}
console.log('\n  OBSERVATION: sensitivity is tier-quasi-independent. At t=300, multiplier=max(0.7,1-0.3)=0.7.');
console.log('  Max possible value: just-grew(1.5)*lact80(1.8)*t0(1.0)=2.70 -> overwhelmed. Min: t300(0.7)=0.70 dulled (only via size).');
console.log('  -> A dry, long-settled woman is ALWAYS exactly "normal" (1.0) until tier ~150 where 1*0.85=0.85 normal, tier 300 0.7 dulled.');
let dullT=null;for(let t=0;t<=400;t++){if(Math.max(0.7,1-t*0.001)<=0.8){dullT=t;break;}}
console.log('  Dry/settled crosses into "dulled" (≤0.8) at tier '+dullT+'.');
