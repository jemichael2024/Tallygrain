// Score the scale-bar reader on a folder of PNGs. Needs: npm install tesseract.js@7.0.0 pngjs@7.0.0
// Usage: node bench/eval_scalebar.js IMAGE_DIR OUT_DIR   (writes OUT_DIR/results.json; score with bench/score_scalebar.py)
const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const { createWorker, PSM } = require('tesseract.js');
const SB = require('../js/scalebar.js');
const dir = process.argv[2], out = process.argv[3];
fs.mkdirSync(out, { recursive: true });
(async () => {
  const worker = await createWorker('eng', 1, { langPath: require('path').join(__dirname, '../vendor/tesseract/lang'), cacheMethod: 'none', gzip: true });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const res = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    const t0 = Date.now(), n = f.slice(0, -4);
    const bar = SB.findBar(png.data, png.width, png.height);
    let label = null, texts = {};
    if (bar) {
      const results = [];
      for (const c of SB.labelCrops(png.data, png.width, png.height, bar)) {
        const o = new PNG({ width: c.width, height: c.height }); o.data = Buffer.from(c.data);
        const r = (await worker.recognize(PNG.sync.write(o), {}, { text: true, blocks: true })).data;
        texts[c.name] = r.text.replace(/\s+/g, ' ').trim();
        const lines = []; for (const bl of r.blocks || []) for (const pa of bl.paragraphs) for (const ln of pa.lines) lines.push({ text: ln.text, bbox: ln.bbox, confidence: ln.confidence });
        results.push({ crop: c, text: r.text, confidence: r.confidence, lines });
        const sofar = SB.pickLabel(bar, results); if (sofar && sofar.score >= 80) break;  // good enough: stop early (same as the app)
      }
      const best = SB.pickLabel(bar, results);
      label = best;
    }
    res[n] = { bar: bar && { x0: bar.x0, x1: bar.x1, y0: bar.y0, y1: bar.y1, len: bar.len, bright: bar.bright, runnerUp: +bar.runnerUp.toFixed(2) }, label, texts, ms: Date.now() - t0 };
    console.log(f.padEnd(38), bar ? 'bar ' + bar.len + 'px' : 'no bar', '|', label ? label.value + ' ' + label.unit + ' (' + label.where + ', ' + label.score.toFixed(0) + ')' : '-', '|', res[n].ms + ' ms');
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(res, null, 1));
  await worker.terminate();
})();
