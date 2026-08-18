// Map engine hang_drop to Regnault grades. Real anchors: N:IMF normal 7.5±1.6cm;
// Grade I = nipple <=1cm below IMF, II = 1-3cm, III = >3cm below.
// The engine "hang_drop" = projection*hangFactor. It's a "nipple drop below attachment"
// proxy. In A-G, hang should land roughly within the lower-pole height (~7-12cm) and
// the grade thresholds are about NIPPLE descent past the fold, not total pole height.
const TISS=0.00095;
function fm(h){return Math.pow(h/165,1.5);}
function wps(t,h){return (0.18+0.055*t+0.002*t*t)*fm(h);}
function proj(t,shape){const v=wps(t,165)/TISS;const r=Math.pow(3*v/(2*Math.PI),1/3);let sf;if(shape==='natural')sf=1+0.3*Math.log(1+t/10);else sf=1+0.4*Math.log(1+t/6);return r*Math.min(1,0.7+0.015*t)*sf;}
function hang(t,shape){const f=(shape==='natural'?0.6+0.003*t:0.25+0.001*t);return proj(t,shape)*f;}
console.log('=== Engine hang_drop (cm) by tier & shape, realistic range ===');
console.log('tier\tvolCup\thang_nat\thang_firm\tproj_nat');
const volCupPts=[[150,'A'],[250,'B'],[350,'C'],[450,'D'],[570,'DD/E'],[640,'F'],[750,'G'],[900,'H'],[1050,'I'],[1200,'J']];
function volCup(v){let best='?',bd=1e9;for(const[vv,c]of volCupPts){const d=Math.abs(vv-v);if(d<bd){bd=d;best=c;}}return best;}
for(const t of [0,2,4,6,8,10,13]){const v=wps(t,165)/TISS;console.log([t,volCup(v),hang(t,'natural').toFixed(1),hang(t,'firm').toFixed(1),proj(t,'natural').toFixed(1)].join('\t'));}
console.log('\nNote: engine hang_nat at A-cup tier0 = '+hang(0,'natural').toFixed(1)+'cm. Real lower-pole height (nipple-to-IMF) normal = 7.5cm.');
console.log('Engine hang is a DROP-BELOW-ATTACHMENT measure; not directly the N:IMF, but at D-cup(t4) nat='+hang(4,'natural').toFixed(1)+' / firm='+hang(4,'firm').toFixed(1));
console.log('\n=== Hang as a fraction of projection across full range (natural) — crossover to >proj ===');
for(const t of [0,50,100,120,133,150,200]){const f=0.6+0.003*t;console.log(`tier ${t}: hangFactor=${f.toFixed(2)} hang=${hang(t,'natural').toFixed(1)} proj=${proj(t,'natural').toFixed(1)} hang>proj? ${hang(t,'natural')>proj(t,'natural')}`);}
