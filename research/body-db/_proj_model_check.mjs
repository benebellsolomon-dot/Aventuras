// Compare engine projection vs (a) industry cup-depth, (b) spherical-cap model
// for the engine's OWN tissue volume. Decide: does the engine under/over-project?

const TISS=0.00095;
function fm(h){return Math.pow(h/165,1.5);}
function wps(t,h){return (0.18+0.055*t+0.002*t*t)*fm(h);}
function vol(t,h){return wps(t,h)/TISS;} // ml/side tissue

// Engine projection (firm & natural)
function proj(t,shape){
  const v=vol(t,165);
  const base_r=Math.pow(3*v/(2*Math.PI),1/3); // hemisphere radius
  let sf; if(shape==='natural')sf=1+0.3*Math.log(1+t/10); else if(shape==='gravity_defying')sf=1+0.5*Math.log(1+t/4); else sf=1+0.4*Math.log(1+t/6);
  const flat=Math.min(1,0.7+0.015*t);
  return base_r*flat*sf;
}

// Spherical-cap projection: given volume V and a chosen base radius R (breast "root"),
// solve cap height h from V = pi*h^2*(3R - h)/3. We pick R from anthropometry:
// breast base/root diameter ~ 12-14cm in D-G range -> R ~ 6-7cm. For smaller, scale.
// We'll solve h numerically for a fixed R and for R = sphereR (self-consistent).
function capHeightForVol(V,R){
  // f(h)=pi*h^2*(3R-h)/3 - V =0, h in (0, ~1.5R]; bisection
  let lo=0.01, hi=2*R;
  const f=h=>Math.PI*h*h*(3*R-h)/3 - V;
  for(let k=0;k<80;k++){const mid=(lo+hi)/2; if(f(mid)>0)hi=mid; else lo=mid;}
  return (lo+hi)/2;
}
function sphereR(V){return Math.pow(3*V/(4*Math.PI),1/3);}

// Industry cup-depth (inches->cm): AA=1,B=2,C=3,D=4 in. Map to engine volCup tier.
// (approx; trade "sewn cup depth", tends to overstate true soft-tissue protrusion)
const industry={A:2.5,B:5.0,C:7.6,D:10.2,'DD/E':11.4,F:12.7,G:14.0}; // cm, extrapolated DD+ ~ +1.3/step

const volCupPts=[[150,'A'],[250,'B'],[350,'C'],[450,'D'],[570,'DD/E'],[640,'F'],[750,'G']];
function volCup(v){let best='?',bd=1e9;for(const[vv,c]of volCupPts){const d=Math.abs(vv-v);if(d<bd){bd=d;best=c;}}return best;}

console.log('=== Projection model comparison (realistic range, height 165) ===');
console.log('tier\tvol\tvolCup\teng_firm\teng_nat\tcap(R=6.5)\tcap(R=sphereR)\tindustry');
for(const t of [0,1,2,3,4,5,6,8,10,12,13]){
  const V=vol(t,165);
  const c=volCup(V);
  const capFixed=capHeightForVol(V,6.5);
  const capSelf=capHeightForVol(V,sphereR(V));
  console.log([t,Math.round(V),c,proj(t,'firm').toFixed(1),proj(t,'natural').toFixed(1),capFixed.toFixed(1),capSelf.toFixed(1),industry[c]||'-'].join('\t'));
}

console.log('\n=== Hemisphere radius vs cap height: is hemiR a reasonable projection proxy? ===');
// A hemisphere of volume V has radius rh=(3V/2pi)^1/3 and its "projection" (height) = rh.
// A spherical cap on a wider root (R>rh) of the same V is SHALLOWER (less projection);
// a cap on a narrower root is DEEPER. Real breasts sit on a root ~ their own width,
// somewhat flattened => projection typically LESS than hemiR for same V. So engine's
// base_r=hemiR, then *flatten(<=1)*shape. Let's see net vs cap@R=6.5.
for(const t of [4,6,8,13]){
  const V=vol(t,165);
  console.log(`tier ${t}: hemiR=${sphereR(V*2).toFixed(1)===''?'':Math.pow(3*V/(2*Math.PI),1/3).toFixed(1)} engFirm=${proj(t,'firm').toFixed(1)} cap@6.5=${capHeightForVol(V,6.5).toFixed(1)} industry=${industry[volCup(V)]||'-'}`);
}

console.log('\n=== Bounce calibration vs Portsmouth (D-cup ~ engine tier 4-6) ===');
// Portsmouth: D-cup bare vertical ~4cm walk, ~10cm run (up to 20 sprint); resultant ~15 run.
// Engine bounce (firm) at tier 4-6 = 1.1-1.3cm; (natural) = 2.0-2.4cm.
// Engine "bounce_amplitude" is shape*proj*0.4(nat)/0.2(firm). What activity does it model?
for(const t of [4,6,8,13,20]){
  console.log(`tier ${t}: bounce_firm=${(proj(t,'firm')*0.2).toFixed(1)} bounce_nat=${(proj(t,'natural')*0.4).toFixed(1)} | proj_firm=${proj(t,'firm').toFixed(1)}`);
}

console.log('\n=== Cleavage sanity (firm 0.5*proj, natural 0.3*proj) ===');
// "Cleavage depth" = vertical gap depth between breasts when pressed. Realistic cleavage
// "depth" is a few cm. Engine firm: 0.5*proj. tier6 firm=3.4cm. Plausible. natural tier6=1.8.
for(const t of [4,6,13,20]) console.log(`tier ${t}: cleav_firm=${(proj(t,'firm')*0.5).toFixed(1)} cleav_nat=${(proj(t,'natural')*0.3).toFixed(1)}`);
