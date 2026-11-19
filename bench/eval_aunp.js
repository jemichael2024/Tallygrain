// Score Tallygrain against nominal sizes of commercial Au nanoparticles (TEM, dark particles).
const A=require('../js/analysis.js'),fs=require('fs'),S=process.argv[2],flatten=process.argv.includes('--flatten');
const arg=k=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:null};
const probDir=arg('--prob'),only=arg('--only')?arg('--only').split(','):null;
const probFor=(n,m)=>{if(!probDir)return null;const p=new Float32Array(fs.readFileSync(probDir+'/'+n+'.prob').buffer.slice(0)),N=m.w*m.h;return {fg:p.subarray(0,N),core:p.subarray(N,2*N)}};

const meta=JSON.parse(fs.readFileSync(S+'/meta.json'));const groups={};
for(const split of [false,true]){console.log(split?'\n### with splitting':'### threshold only');
for(const [n,m] of Object.entries(meta)){const d=new Uint8ClampedArray(fs.readFileSync(S+'/'+n+'.raw'));
 const nm=m.barNm/m.barPx/m.sf;
 const r=A.analyze(d,m.w,m.h,{nmPerPx:nm,bright:false,minArea:20,elongMax:1.5,solidityMin:0.85,cropPct:4,flatten,split,splitStrength:1,prob:probFor(n,m)});
 const s=A.summarize(r.comps);(groups[m.nominal+(split?'s':'')]=groups[m.nominal+(split?'s':'')]||[]).push(s);
 console.log(n.padEnd(24),'nominal',String(m.nominal).padStart(3),'nm/px',nm.toFixed(3),'n',String(s.n).padStart(4),'mean',s.mean.toFixed(1).padStart(6),'D50',s.d50.toFixed(1).padStart(6),'CV',(100*s.cv).toFixed(0)+'%','clusters',s.clusters);}}
console.log('\nSummary (median of per-image D50, total particles):');
for(const [k,arr] of Object.entries(groups)){const d=arr.map(s=>s.d50).filter(isFinite).sort((a,b)=>a-b);console.log(k.padEnd(5),'median D50',d[Math.floor(d.length/2)].toFixed(1),'images',arr.length,'particles',arr.reduce((a,s)=>a+s.n,0));}
