// Score Feret against the ArdaGen labelled boxes: detection precision/recall and size error of matched particles.
const A=require('../js/analysis.js'),fs=require('fs'),S=process.argv[2],split=process.argv[3]!=='nosplit';
const meta=JSON.parse(fs.readFileSync(S+'/meta.json'));let T={gt:0,fe:0,m:0},errs=[],rows=[];
for(const [n,m] of Object.entries(meta)){
 const d=new Uint8ClampedArray(fs.readFileSync(S+'/'+n+'.raw'));
 const r=A.analyze(d,m.w,m.h,{nmPerPx:1,bright:m.bright,minArea:4,elongMax:1.5,solidityMin:0.85,cropPct:0,split,splitStrength:1});
 const gt=m.boxes.filter(([x,y,w,h])=>x-w/2>1&&y-h/2>1&&x+w/2<m.w-1&&y+h/2<m.h-1).map(([x,y,w,h])=>({x,y,w,h,d:Math.sqrt(w*h),used:false}));
 const fe=r.comps.filter(c=>c.cls==='ok');let mt=0;
 for(const c of fe){let best=null,bd=1e9;for(const g of gt){if(g.used)continue;if(Math.abs(c.cx-g.x)<=g.w/2&&Math.abs(c.cy-g.y)<=g.h/2){const dd=Math.hypot(c.cx-g.x,c.cy-g.y);if(dd<bd){bd=dd;best=g}}}
  if(best){best.used=true;mt++;errs.push((c.dNm-best.d)/best.d);}}
 T.gt+=gt.length;T.fe+=fe.length;T.m+=mt;
 const gm=gt.reduce((a,g)=>a+g.d,0)/gt.length, fm=fe.reduce((a,c)=>a+c.dNm,0)/(fe.length||1);
 rows.push([n,gt.length,fe.length,mt,(mt/(fe.length||1)).toFixed(2),(mt/gt.length).toFixed(2),gm.toFixed(1),fm.toFixed(1)].join('\t'));}
console.log('image\tgt\tferet\tmatched\tprec\trecall\tgt_mean_px\tferet_mean_px');rows.forEach(r=>console.log(r));
errs.sort((a,b)=>a-b);const med=errs[Math.floor(errs.length/2)],mae=errs.map(Math.abs).sort((a,b)=>a-b)[Math.floor(errs.length/2)];
console.log('TOTAL gt',T.gt,'feret',T.fe,'matched',T.m,'precision',(T.m/T.fe).toFixed(3),'recall',(T.m/T.gt).toFixed(3),'median size err',(100*med).toFixed(1)+'%','median |err|',(100*mae).toFixed(1)+'%');
