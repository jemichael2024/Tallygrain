// Score Tallygrain against the ArdaGen labelled boxes: detection precision/recall and size error of matched particles.
// Options: --flatten, nosplit, --only NAME1,NAME2, --prob DIR (model output from model/predict.py).
const A=require('../js/analysis.js'),fs=require('fs'),S=process.argv[2],flatten=process.argv.includes('--flatten'),split=!process.argv.includes('nosplit');
const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:null};
const probDir=arg('--prob'),only=arg('--only')?arg('--only').split(','):null;
const probFor=(n,m)=>{if(!probDir)return null;const p=new Float32Array(fs.readFileSync(probDir+'/'+n+'.prob').buffer.slice(0)),N=m.w*m.h;return {fg:p.subarray(0,N),core:p.subarray(N,2*N)}};

// A detection matches a labelled particle when their bounding boxes overlap with IoU >= 0.5.
const boxIoU=(b,g)=>{const ax0=b[0],ay0=b[1],ax1=b[2]+1,ay1=b[3]+1,bx0=g.x-g.w/2,by0=g.y-g.h/2,bx1=g.x+g.w/2,by1=g.y+g.h/2;const iw=Math.max(0,Math.min(ax1,bx1)-Math.max(ax0,bx0)),ih=Math.max(0,Math.min(ay1,by1)-Math.max(ay0,by0)),I=iw*ih;return I/((ax1-ax0)*(ay1-ay0)+g.w*g.h-I)};
const meta=JSON.parse(fs.readFileSync(S+'/meta.json'));let T={gt:0,fe:0,m:0},errs=[],rows=[];
for(const [n,m] of Object.entries(meta)){
 if(only&&!only.includes(n))continue;
 const d=new Uint8ClampedArray(fs.readFileSync(S+'/'+n+'.raw'));
 const r=A.analyze(d,m.w,m.h,{nmPerPx:1,bright:m.bright,minArea:4,elongMax:1.5,solidityMin:0.85,cropPct:0,flatten,split,splitStrength:1,prob:probFor(n,m)});
 const gt=m.boxes.filter(([x,y,w,h])=>x-w/2>1&&y-h/2>1&&x+w/2<m.w-1&&y+h/2<m.h-1).map(([x,y,w,h])=>({x,y,w,h,d:Math.sqrt(w*h),used:false}));
 const fe=r.comps.filter(c=>c.cls==='ok');let mt=0;
 for(const c of fe){let best=null,bd=1e9;for(const g of gt){if(g.used)continue;const iou=boxIoU(c.bbox,g);if(iou>=0.5&&-iou<bd){bd=-iou;best=g}}
  if(best){best.used=true;mt++;errs.push((c.dNm-best.d)/best.d);}}
 T.gt+=gt.length;T.fe+=fe.length;T.m+=mt;
 const gm=gt.reduce((a,g)=>a+g.d,0)/gt.length, fm=fe.reduce((a,c)=>a+c.dNm,0)/(fe.length||1);
 rows.push([n,gt.length,fe.length,mt,(mt/(fe.length||1)).toFixed(2),(mt/gt.length).toFixed(2),gm.toFixed(1),fm.toFixed(1)].join('\t'));}
console.log('image\tgt\ttallygrain\tmatched\tprec\trecall\tgt_mean_px\ttallygrain_mean_px');rows.forEach(r=>console.log(r));
errs.sort((a,b)=>a-b);const med=errs[Math.floor(errs.length/2)],mae=errs.map(Math.abs).sort((a,b)=>a-b)[Math.floor(errs.length/2)];
console.log('TOTAL gt',T.gt,'tallygrain',T.fe,'matched',T.m,'precision',(T.m/T.fe).toFixed(3),'recall',(T.m/T.gt).toFixed(3),'median size err',(100*med).toFixed(1)+'%','median |err|',(100*mae).toFixed(1)+'%','F1',(2*T.m/(T.fe+T.gt)).toFixed(3));
