const FRAME_REF=165, FRAME_EXP=1.5;
const BW_C=0.18, BW_L=0.055, BW_Q=0.002;
const BC_C=50, BC_L=25, BC_Q=1.5;
const DEFAULT_FLUID_DENSITY=1.03;
const TISSUE_DENS=0.00095;
const frame=h=>Math.pow((h<100?100:h)/FRAME_REF,FRAME_EXP);
const bw=t=>BW_C+BW_L*t+BW_Q*t*t;
const wkg=(t,h)=>bw(t)*frame(h);
const bcap=t=>BC_C+BC_L*t+BC_Q*t*t;
const cap=(t,h)=>bcap(t)*frame(h);
const wfull=(t,h,d)=>wkg(t,h)+cap(t,h)*(d||DEFAULT_FLUID_DENSITY)/1000;
const wfill=(t,h,d,f)=>{f=Math.max(0,Math.min(100,f));const e=wkg(t,h);return e+(wfull(t,h,d)-e)*f/100;};
const letter=t=>{let i=Math.floor(t);if(i<50){const li=Math.floor(i/2),dbl=i%2===1,ch=String.fromCharCode(65+li);return dbl?ch+ch:ch;}if(i===50)return'Z';if(i===51)return'ZZ';const a=i-52,zc=Math.floor(a/50)+1,p=a%50,zp='Z'.repeat(zc),li=Math.floor(p/2),dbl=p%2===1,ch=String.fromCharCode(65+li);return zp+(dbl?ch+ch:ch);};
const H=165;
console.log("tier letter cap/side(ml) cap_tot(ml) tissue_vol/side(ml) milk%of_tissue@full wt_empty/side(kg) wt_full/side(kg) milk_wt/side(kg)");
for(const t of [0,2,4,6,8,10,13,16,20,27,40,50]){
  const c=cap(t,H), tv=wkg(t,H)/TISSUE_DENS, mw=c*DEFAULT_FLUID_DENSITY/1000;
  console.log(t, letter(t).padEnd(4), c.toFixed(0).padStart(6), (c*2).toFixed(0).padStart(7), tv.toFixed(0).padStart(7), (100*c/tv).toFixed(1).padStart(6)+'%', wkg(t,H).toFixed(3).padStart(7), wfull(t,H,DEFAULT_FLUID_DENSITY).toFixed(3).padStart(7), mw.toFixed(3).padStart(7));
}
console.log("\n--- AUTO-FILL +8%/turn: turns from empty to full = 12.5 turns (0->100). Fill weight ramp at tier6 (D):");
for(const f of [0,8,30,50,60,70,90,100]){
  console.log("fill%",String(f).padStart(3), "wt/side", wfill(6,H,DEFAULT_FLUID_DENSITY,f).toFixed(3),"kg  milk/side", (cap(6,H)*DEFAULT_FLUID_DENSITY/1000*f/100).toFixed(3),"kg  milk_ml/side",(cap(6,H)*f/100).toFixed(0));
}
