/* Tallygrain scale-bar finder. DOM-free so it runs in the browser and in Node (bench/eval_scalebar.js).
 * findBar: looks for a solid, thin, horizontal rectangle that is much darker or brighter than its surroundings
 * (the usual microscope scale bar) and returns its pixel extent. parseLabel: reads "100 nm", "1 µm", "0.5um" etc.
 * from OCR text. labelRegion: the area around the bar where its label usually sits.
 * Outline/ruler style bars (e.g. TESCAN tick rulers) are not detected; the user enters those by hand. */
(function (root) {
  'use strict';

  function gray(rgba, n) {
    const g = new Uint8Array(n);
    for (let i = 0; i < n; i++) g[i] = (0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]) | 0;
    return g;
  }

  // One polarity: B = pixels that belong to a candidate bar (very dark or very bright).
  function candidates(g, w, h, bright, thr) {
    const B = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) B[i] = bright ? (g[i] >= thr ? 1 : 0) : (g[i] <= thr ? 1 : 0);
    const minLen = Math.max(20, Math.round(0.05 * w)), maxLen = Math.round(0.7 * w);
    const maxT = Math.max(4, Math.round(0.05 * h));
    const open = new Map(); // key x0:x1 -> rect being grown
    const rects = [];
    const close = r => { if (r.y1 - r.y0 + 1 >= 2) rects.push(r); };
    for (let y = 0; y < h; y++) {
      const seen = new Set();
      let x = 0;
      while (x < w) {
        if (!B[y * w + x]) { x++; continue; }
        const s = x; while (x < w && B[y * w + x]) x++;
        const e = x - 1, L = e - s + 1;
        if (L < minLen || L > maxLen) continue;
        // continue a rectangle whose ends match within 2 px
        let hit = null;
        for (const [k, r] of open) if (Math.abs(r.x0 - s) <= 2 && Math.abs(r.x1 - e) <= 2 && r.y1 === y - 1) { hit = k; break; }
        if (hit) { const r = open.get(hit); r.y1 = y; seen.add(hit); }
        else { const k = s + ':' + e + ':' + y; open.set(k, { x0: s, x1: e, y0: y, y1: y }); seen.add(k); }
      }
      for (const [k, r] of open) if (!seen.has(k)) { close(r); open.delete(k); }
    }
    for (const r of open.values()) close(r);
    const out = [];
    for (const r of rects) {
      const t = r.y1 - r.y0 + 1, L = r.x1 - r.x0 + 1;
      if (t > maxT || L / t < 4) continue;
      // edges: the rows just above and below, and the columns just past the ends, must differ clearly from the bar
      let bs = 0; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) bs += g[y * w + x];
      const bm = bs / (t * L);
      const rowMean = y => { let a = 0; for (let x = r.x0; x <= r.x1; x++) a += g[y * w + x]; return a / L; };
      // look 1-3 rows out so an anti-aliased edge row does not hide the step
      const away = (y, dir) => { let d = 0; for (let k = 1; k <= 3; k++) { const yy = y + dir * k; if (yy < 0 || yy >= h) return 255; d = Math.max(d, Math.abs(rowMean(yy) - bm)); } return d; };
      const dA = away(r.y0, -1), dB = away(r.y1, 1);
      if (dA < 15 || dB < 15) continue;
      let eL = 0, eR = 0;
      for (let y = r.y0; y <= r.y1; y++) {
        eL += r.x0 >= 2 ? Math.abs(g[y * w + r.x0 - 2] - bm) : 255;
        eR += r.x1 + 2 < w ? Math.abs(g[y * w + r.x1 + 2] - bm) : 255;
      }
      if (eL / t < 15 || eR / t < 15) continue;
      // contrast of the bar against a frame around it
      let inS = 0, inN = 0, outS = 0, outN = 0;
      const pad = Math.max(3, t);
      for (let y = Math.max(0, r.y0 - pad); y <= Math.min(h - 1, r.y1 + pad); y++) {
        for (let x = Math.max(0, r.x0 - pad); x <= Math.min(w - 1, r.x1 + pad); x++) {
          const inside = y >= r.y0 && y <= r.y1 && x >= r.x0 && x <= r.x1;
          if (inside) { inS += g[y * w + x]; inN++; } else { outS += g[y * w + x]; outN++; }
        }
      }
      const contrast = Math.abs(inS / inN - outS / outN);
      if (contrast < 20) continue;
      const cy = (r.y0 + r.y1) / 2;
      const low = cy > 0.6 * h ? 1.5 : cy < 0.15 * h ? 0.6 : 0.4; // bars are usually in the bottom part
      out.push({ x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, len: L, thick: t, bright, contrast, mean: bm, score: L * low * (contrast / 255) });
    }
    return out;
  }

  function findBar(rgba, w, h) {
    const g = gray(rgba, w * h);
    let all = [];
    for (const t of [55, 25, 8]) all = all.concat(candidates(g, w, h, false, t));
    for (const t of [200, 235, 250]) all = all.concat(candidates(g, w, h, true, t));
    // the same bar is found at several thresholds: keep one per location (the longest)
    if (!all.length) return null;
    all.sort((a, b) => b.score - a.score);
    all = all.filter((c, i) => !all.slice(0, i).some(d => Math.abs(d.y0 - c.y0) < 6 && c.x0 < d.x1 && d.x0 < c.x1));
    const best = all[0];
    best.runnerUp = all[1] ? all[1].score / best.score : 0;
    return best;
  }

  // Candidate label regions around the bar (right, below, above, left). Each region is binarised three ways,
  // because label text can match the bar's colour (most overlays), be the opposite extreme (light text next to
  // a black bar), or need a plain Otsu split. Text is made black on white, padded and scaled up for OCR.
  function labelCrops(rgba, w, h, bar) {
    const g = gray(rgba, w * h);
    // Label text height is unknown (2 to 8 times the bar thickness in our test images), so try a tight and a tall band.
    const tA = Math.round(Math.max(14, Math.min(0.1 * h, 2.2 * bar.thick + 0.05 * bar.len)));
    const tB = Math.round(Math.max(14, Math.min(0.15 * h, 0.3 * bar.len)));
    const cy = (bar.y0 + bar.y1) / 2, L = bar.len;
    const boxes = {};
    for (const [sfx, tH] of (tB > 1.4 * tA ? [['', tA], ['+', tB]] : [['', tA]])) {
      boxes['right' + sfx] = [bar.x1 + 2, cy - tH, bar.x1 + 1.2 * L, cy + tH];
      boxes['below' + sfx] = [bar.x0 - 0.2 * L, bar.y1 + 1, bar.x1 + 0.2 * L, bar.y1 + 1.6 * tH];
      boxes['above' + sfx] = [bar.x0 - 0.2 * L, bar.y0 - 1.6 * tH, bar.x1 + 0.2 * L, bar.y0 - 1];
      boxes['left' + sfx] = [bar.x0 - 1.2 * L, cy - tH, bar.x0 - 2, cy + tH];
    }
    const out = [];
    for (const [name, bx] of Object.entries(boxes)) {
      const x0 = Math.max(0, Math.round(bx[0])), y0 = Math.max(0, Math.round(bx[1]));
      const x1 = Math.min(w - 1, Math.round(bx[2])), y1 = Math.min(h - 1, Math.round(bx[3]));
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
      if (cw < 12 || ch < 8) continue;
      const hist = new Float64Array(256);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) hist[g[y * w + x]]++;
      const N = cw * ch, pct = q => { let c = 0; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= q * N) return i; } return 255; };
      let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
      let sB = 0, wB = 0, best = 0, thr = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t]; if (!wB) continue; const wF = N - wB; if (!wF) break;
        sB += t * hist[t]; const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d;
        if (v > best) { best = v; thr = t; }
      }
      let hi = 0; for (let i = thr + 1; i < 256; i++) hi += hist[i];
      const lo2 = pct(0.02), hi98 = pct(0.98);
      const keys = {
        same: v => Math.abs(v - bar.mean) < 22,
        opposite: bar.bright ? v => v <= lo2 + 25 : v => v >= hi98 - 25,
        otsu: hi < N / 2 ? v => v > thr : v => v <= thr
      };
      const sc = Math.max(1, Math.min(4, 220 / ch)), pad = 16;
      const at = (x, y) => {  // bilinear sample of the crop at (x, y) in crop pixels
        const xa = Math.min(cw - 1, Math.max(0, x)), ya = Math.min(ch - 1, Math.max(0, y)), xi = Math.min(cw - 2, xa | 0), yi = Math.min(ch - 2, ya | 0), fx = xa - xi, fy = ya - yi;
        const p = (yy, xx) => g[(y0 + Math.max(0, yy)) * w + x0 + Math.max(0, xx)];
        return (p(yi, xi) * (1 - fx) + p(yi, xi + 1) * fx) * (1 - fy) + (p(yi + 1, xi) * (1 - fx) + p(yi + 1, xi + 1) * fx) * fy;
      };
      for (const [kname, ink] of Object.entries(keys)) {
        const W = Math.round(cw * sc) + 2 * pad, H = Math.round(ch * sc) + 2 * pad, data = new Uint8ClampedArray(W * H * 4).fill(255);
        let inkN = 0;
        for (let y = 0; y < H - 2 * pad; y++) for (let x = 0; x < W - 2 * pad; x++) {
          const v = at((x + 0.5) / sc - 0.5, (y + 0.5) / sc - 0.5);
          if (ink(v)) { const di = ((y + pad) * W + x + pad) * 4; data[di] = data[di + 1] = data[di + 2] = 0; inkN++; }
        }
        const f = inkN / ((W - 2 * pad) * (H - 2 * pad));
        if (f < 0.005 || f > 0.5) continue;  // nothing there, or mostly ink (not text)
        out.push({ name: name + '/' + kname, width: W, height: H, data, box: { x0, y0, x1, y1 }, sc, pad });
      }
    }
    return out;
  }

  // Scale-bar values are almost always 1, 2, 2.5, 3 or 5 times a power of ten.
  function roundValue(v) {
    const m = v / Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 2.5, 3, 5, 10].some(r => Math.abs(m - r) < 1e-6);
  }

  const UNIT_NM = { pm: 1e-3, 'å': 0.1, a: 0.1, nm: 1, 'µm': 1e3, 'μm': 1e3, um: 1e3, mm: 1e6 };
  // Returns { value, unit, nm, text, guessed } for the first "<number> <unit>" in OCR text, or null.
  // OCR often confuses digits with letters (S/5, O/0, l/1) and "nm" with "rn", "riin", "mm"; those are corrected
  // and flagged as guessed so the app can say so. Microscope scale bars are never in millimetres.
  function parseLabel(text) {
    if (!text) return null;
    let t = text.replace(/(\d)\.\s+(\d)/g, '$1.$2').replace(/(\d)[.,](?=\s*nm)/gi, '$1');
    // Some microscope fonts come out as "500.0111)" or "200,071111)": a .0 decimal followed by a run of 1/l/7/)
    // where "nm" should be. Read those as nm (flagged as guessed).
    t = t.replace(/(\d{1,4})[.,]{1,2}0[1Il7)\]|]{2,}/g, '$1 nm?');
    t = t.replace(/[|]/g, ' ');
    const re = /(?:^|[^0-9A-Za-z])([0-9SOoIlZU]{1,4}(?:[.,][0-9Oo]{1,2})?)\s*(nm\?|nm|n\s?m|rn|rm|nrn|riin|run|nn|mm|m|µm|μm|um|pm|å)(?![a-z])/i;
    const m = t.match(re);
    if (!m) return null;
    const rawNum = m[1];
    const num = rawNum.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/Z/g, '2').replace(/U/g, '0');
    let unit = m[2].toLowerCase().replace(/\s/g, ''), guessed = num !== rawNum;
    if (unit === 'μm') unit = 'µm';
    const fontFix = unit === 'nm?';
    if (['nm?', 'rn', 'rm', 'nrn', 'riin', 'run', 'nn', 'mm', 'm'].includes(unit)) { unit = 'nm'; guessed = true; }
    const value = parseFloat(num.replace(',', '.'));
    if (!(value > 0)) return null;
    if (!/\d/.test(rawNum) && !roundValue(value)) return null;  // all-letter guesses only if they give a round number
    return { value, unit, nm: value * UNIT_NM[unit], text: m[0].trim(), guessed, fontFix };
  }

  // Is an OCR text line (bbox in crop pixels) where a scale-bar label would sit? Labels are next to the bar:
  // above/below it and overlapping it horizontally, or beside it within ~40% of its length, and vertically close.
  function plausibleLine(bar, crop, lb) {
    const X = v => crop.box.x0 + (v - crop.pad) / crop.sc, Y = v => crop.box.y0 + (v - crop.pad) / crop.sc;
    const x0 = X(lb.x0), x1 = X(lb.x1), y0 = Y(lb.y0), y1 = Y(lb.y1), th = y1 - y0;
    const L = bar.len, cy = (bar.y0 + bar.y1) / 2;
    if (th < 4 || th > 0.6 * L + 4 * bar.thick) return false;
    const overlapX = Math.min(x1, bar.x1) - Math.max(x0, bar.x0) > 0;
    const vGap = y0 > bar.y1 ? y0 - bar.y1 : bar.y0 > y1 ? bar.y0 - y1 : 0;
    const hGap = x0 > bar.x1 ? x0 - bar.x1 : bar.x0 > x1 ? bar.x0 - x1 : 0;
    if (overlapX) return vGap <= 1.5 * th + 2 * bar.thick;
    return hGap <= 0.4 * L && cy >= y0 - th && cy <= y1 + th;
  }

  // Choose the label from OCR results of all crops: [{ crop, text, confidence, lines: [{ text, bbox, confidence }] }].
  // Only round values (1, 2, 2.5, 3, 5 x 10^n) count. A reading is dropped when the OCR line holding it sits
  // somewhere a label would not. Returns the best { value, unit, nm, text, guessed, conf, where } or null.
  function pickLabel(bar, results) {
    let best = null;
    for (const r of results) {
      const cands = [];
      const whole = parseLabel(r.text);
      if (whole) {
        const line = (r.lines || []).find(ln => { const l = parseLabel(ln.text); return l && l.value === whole.value; });
        if (!line || plausibleLine(bar, r.crop, line.bbox)) cands.push({ ...whole, conf: r.confidence });
      }
      for (const ln of r.lines || []) {
        const l = parseLabel(ln.text);
        if (l && plausibleLine(bar, r.crop, ln.bbox)) cands.push({ ...l, conf: ln.confidence });
      }
      for (const c of cands) {
        if (!roundValue(c.value)) continue;
        const score = c.conf - (c.guessed ? 10 : 0);
        if (score < 20 && !c.fontFix) continue;  // low OCR confidence: below this, wrong readings outnumbered right ones in testing
        if (!best || score > best.score) best = { ...c, score, where: r.crop.name };
      }
    }
    return best;
  }

  const api = { findBar, labelCrops, parseLabel, roundValue, plausibleLine, pickLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TallygrainScalebar = api;
})(typeof self !== 'undefined' ? self : this);
