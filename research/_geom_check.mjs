// Cross-check: for the engine's OWN tissue volume per side, what bust-band would
// real bra-fitting math predict? And what does the engine produce? Quantify the gap.
const TISSUE_DENSITY = 0.00095; // kg/cm^3 (engine; physically ~right, real tissue 0.9-0.95 g/cc)

function frame_modifier(h){return Math.pow(h/165,1.5);}
function wps(t,h){return (0.18+0.055*t+0.002*t*t)*frame_modifier(h);}

// Real-world: each US cup step ~2.54 cm of (bust-band). Build the inverse:
// bust-band(cm) for a given cup. Anchor: A=2.54, B=5.08, C=7.62, D=10.16, DD=12.7 ...
function diffForCup(n){return n*2.54;} // n = #inches = cup index (A=1)

// Real-world volume per cup at a ~30-32 band (from Greenberg / bra-calculator ranges):
// Approx midpoints per breast: A~150, B~250, C~350, D~450, DD/E~570, F~640, G~750, H~900
// (32-band anchored; these rise ~120-180cc/step in the realistic range).
const realVolByCup = {A:150,B:250,C:350,D:450,'DD/E':570,F:640,G:750,H:900,I:1050,J:1200};

console.log('=== Engine tissue volume/side vs real cup volume (32-band anchored) ===');
for (const t of [0,2,4,6,8,13,20]) {
  const v = wps(t,165)/TISSUE_DENSITY;
  // find nearest real cup by volume
  let best=null,bd=1e9;
  for (const [c,vol] of Object.entries(realVolByCup)){const d=Math.abs(vol-v);if(d<bd){bd=d;best=c;}}
  console.log(`tier ${t} (label ${['A','','B','','C','','D','','E'][t]||'?'}): vol=${Math.round(v)}ml/side -> nearest real cup by VOLUME = ${best}`);
}

console.log('\n=== Real bust-band a 6cm-projecting / 613ml breast would have ===');
// Spherical-cap model of a breast sitting on the chest wall.
// Engine projection P is the forward depth (cap height h_cap). Engine tier6 P=6.0cm.
// Treat breast as a spherical cap of height h and base radius a on a flat chest.
// Volume of cap = (pi*h/6)*(3a^2 + h^2). Engine vol/side=613ml at tier6, P=6.0.
// Solve for base radius a given V and h:
function capBaseRadius(V,h){ // (pi*h/6)(3a^2+h^2)=V -> a^2=(6V/(pi*h)-h^2)/3
  const a2=(6*V/(Math.PI*h)-h*h)/3; return a2>0?Math.sqrt(a2):NaN;
}
for (const t of [2,6,13,20]) {
  const V=wps(t,165)/TISSUE_DENSITY;
  // engine projection
  const proj = engineProj(t);
  const a = capBaseRadius(V,proj);
  // Added bust circumference over band ~ the extra arc the tape travels going OVER
  // two caps vs flat. A standard simple proxy used in fit math: bust-band tracks
  // ~ pi*h per breast pair is an OVERestimate; the realistic mapping is empirical
  // (2.54cm bust-band per ~1 cup, and 1 cup ~ a fixed volume). Report both the
  // cap base diameter and the engine's added-circ for contrast.
  const engineAdd = 2*Math.PI*proj*Math.min(0.95,0.5+0.002*t)*1.30;
  // Empirical real bust-band from the engine's own volume: invert real cup<->volume
  // and cup<->diff. Using realVolByCup + diffForCup(cupIndex).
  const cupIdx = volToCupIndex(V);
  const realDiff = diffForCup(cupIdx);
  console.log(`tier ${t}: vol=${Math.round(V)}ml proj=${proj.toFixed(1)} capBaseR=${isNaN(a)?'n/a':a.toFixed(1)} | engine bust-band=${engineAdd.toFixed(1)}cm | real bust-band(from vol)~${realDiff.toFixed(1)}cm -> ${(engineAdd/realDiff).toFixed(1)}x too big`);
}

function engineProj(t){
  const tissue_wt=wps(t,165); const vol=tissue_wt/TISSUE_DENSITY;
  const base_r=Math.pow(3*vol/(2*Math.PI),1/3);
  const shape_factor=1.0+0.3*Math.log(1+t/10); // natural
  const flatten=Math.min(1.0,0.7+0.015*t);
  return Math.round(base_r*flatten*shape_factor*10)/10;
}
// Map a per-breast volume (ml) to a fractional cup index (A=1,B=2,...) by interpolation
function volToCupIndex(V){
  const pts=[[150,1],[250,2],[350,3],[450,4],[570,5],[640,6],[750,7],[900,8],[1050,9],[1200,10]];
  if(V<=pts[0][0])return pts[0][1];
  for(let i=1;i<pts.length;i++){if(V<=pts[i][0]){const[v0,c0]=pts[i-1],[v1,c1]=pts[i];return c0+(c1-c0)*(V-v0)/(v1-v0);}}
  // extrapolate above
  const[v0,c0]=pts[pts.length-2],[v1,c1]=pts[pts.length-1];
  return c1+(c1-c0)*(V-v1)/(v1-v0);
}
