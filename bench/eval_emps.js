// Score Tallygrain on EMPS instance masks: a prediction matches a ground-truth particle at IoU >= 0.5.
// Usage: node bench/eval_emps.js DIR [--flatten] [--prob PROBDIR]   (PROBDIR holds <name>.prob from model/predict.py)
const A = require('../js/analysis.js'), fs = require('fs');
const S = process.argv[2], flatten = process.argv.includes('--flatten');
const pi = process.argv.indexOf('--prob'), probDir = pi > 0 ? process.argv[pi + 1] : null;
const meta = JSON.parse(fs.readFileSync(S + '/meta.json'));
let TP = 0, NP = 0, NG = 0; const errs = [];
for (const [n, m] of Object.entries(meta)) {
  const d = new Uint8ClampedArray(fs.readFileSync(S + '/' + n + '.raw'));
  const gt = new Int32Array(fs.readFileSync(S + '/' + n + '.gt').buffer.slice(0));
  const o = { nmPerPx: 1, bright: m.bright, minArea: 10, elongMax: 99, solidityMin: 0, cropPct: 0, flatten, split: true, splitStrength: 1 };
  if (probDir) {
    const p = new Float32Array(fs.readFileSync(probDir + '/' + n + '.prob').buffer.slice(0)), N = m.w * m.h;
    o.prob = { fg: p.subarray(0, N), core: p.subarray(N, 2 * N) };
  }
  const r = A.analyze(d, m.w, m.h, o);
  // Areas and pairwise overlaps. GT particles touching the border are kept: EMPS crops often cut particles.
  const ga = new Map(), pa = new Map(), ov = new Map();
  for (let i = 0; i < gt.length; i++) {
    const g = gt[i], p = r.labels[i];
    if (g) ga.set(g, (ga.get(g) || 0) + 1);
    if (p && r.comps[p - 1].cls !== 'small') { pa.set(p, (pa.get(p) || 0) + 1); if (g) { const k = g * 1e6 + p; ov.set(k, (ov.get(k) || 0) + 1); } }
  }
  let tp = 0;
  for (const [k, inter] of ov) {
    const g = Math.floor(k / 1e6), p = k - g * 1e6, iou = inter / (ga.get(g) + pa.get(p) - inter);
    if (iou >= 0.5) { tp++; errs.push((Math.sqrt(pa.get(p)) - Math.sqrt(ga.get(g))) / Math.sqrt(ga.get(g))); }
  }
  TP += tp; NP += pa.size; NG += ga.size;
}
const P = TP / NP, R = TP / NG, F = 2 * P * R / (P + R);
const ae = errs.map(Math.abs).sort((a, b) => a - b);
console.log(`images ${Object.keys(meta).length}  gt ${NG}  pred ${NP}  matched ${TP}  precision ${P.toFixed(3)}  recall ${R.toFixed(3)}  F1 ${F.toFixed(3)}  median |diameter err| of matches ${(100 * ae[ae.length >> 1]).toFixed(1)}%`);
