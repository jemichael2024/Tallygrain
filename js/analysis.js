/* Feret analysis core: threshold segmentation + per-particle measurements.
   Pure functions, no DOM. Works in the browser (window.FeretAnalysis) and in Node (module.exports). */
(function (root) {
  'use strict';

  // Below this many pixels, pixelation makes solidity too noisy to judge shape.
  const SOLIDITY_MIN_AREA = 100;

  function toGray(rgba, n) {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2];
    return g;
  }

  // 3x3 box blur to suppress pixel noise before thresholding.
  function blur3(src, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            s += src[yy * w + xx]; c++;
          }
        }
        out[y * w + x] = s / c;
      }
    }
    return out;
  }

  // Otsu's method: threshold that maximises between-class variance.
  function otsu(img, count) {
    const hist = new Float64Array(256);
    for (let i = 0; i < count; i++) hist[Math.max(0, Math.min(255, Math.round(img[i])))]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = -1, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = count - wB; if (!wF) break;
      sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    return thr;
  }

  /**
   * rgba: Uint8ClampedArray (w*h*4). Options:
   *  nmPerPx, bright (bool), minArea (px), elongMax, solidityMin, cropPct (bottom strip ignored),
   *  threshold (0-255, or null for Otsu), excluded: [{x,y}] points the user clicked to exclude.
   */
  function analyze(rgba, w, h, o) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const n = w * h;
    const crop = Math.max(0, Math.min(40, o.cropPct || 0));
    const hEff = Math.max(1, Math.floor(h * (1 - crop / 100)));
    const nEff = w * hEff;
    const bl = blur3(toGray(rgba, n), w, h);
    const autoThr = otsu(bl, nEff);
    const thr = (o.threshold == null) ? autoThr : o.threshold;
    const bright = o.bright !== false;

    const mask = new Uint8Array(n);
    for (let i = 0; i < nEff; i++) mask[i] = bright ? (bl[i] > thr) : (bl[i] < thr);

    // Connected components, 8-connectivity, iterative flood fill.
    const labels = new Int32Array(n), stack = new Int32Array(n), comps = [];
    for (let i = 0; i < nEff; i++) {
      if (!mask[i] || labels[i]) continue;
      const id = comps.length + 1;
      let sp = 0; stack[sp++] = i; labels[i] = id;
      let a = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, edge = false;
      let x0 = w, y0 = hEff, x1 = 0, y1 = 0;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        a++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x === 0 || y === 0 || x === w - 1 || y === hEff - 1) edge = true;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= hEff) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (mask[q] && !labels[q]) { labels[q] = id; stack[sp++] = q; }
          }
        }
      }
      // Second moments -> aspect ratio of the best-fit ellipse.
      const mx = sx / a, my = sy / a;
      const cxx = sxx / a - mx * mx, cyy = syy / a - my * my, cxy = sxy / a - mx * my;
      const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
      comps.push({ id, area: a, cx: mx, cy: my, ar: Math.sqrt(l1 / l2), edge, bbox: [x0, y0, x1, y1], cls: 'ok' });
    }

    // Solidity = pixel area / convex hull area (hull over the corners of boundary pixels).
    // A lone particle is close to 1; a clump of touching particles has notches and scores lower.
    const corners = comps.map(() => []);
    for (let y = 0; y < hEff; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, l = labels[i]; if (!l) continue;
        if (x === 0 || labels[i - 1] !== l || x === w - 1 || labels[i + 1] !== l || y === 0 || labels[i - w] !== l || y === hEff - 1 || labels[i + w] !== l) {
          corners[l - 1].push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
        }
      }
    }
    comps.forEach((c, k) => { const ha = hullArea(corners[k]); c.solidity = ha > 0 ? Math.min(1, c.area / ha) : 1; });

    const excluded = o.excluded || [];
    const s = o.nmPerPx > 0 ? o.nmPerPx : 1;
    for (const c of comps) {
      c.dNm = 2 * Math.sqrt(c.area / Math.PI) * s;
      c.areaNm2 = c.area * s * s;
      if (c.area < (o.minArea || 1)) c.cls = 'small';
      else if (c.edge) c.cls = 'edge';
      else if (c.ar > (o.elongMax || 1.5) || (c.area >= SOLIDITY_MIN_AREA && c.solidity < (o.solidityMin || 0))) c.cls = 'cluster';
    }
    for (const p of excluded) {
      const xi = Math.round(p.x), yi = Math.round(p.y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= hEff) continue;
      const L = labels[yi * w + xi];
      if (L && comps[L - 1].cls !== 'small') comps[L - 1].cls = 'manual';
    }

    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    return { labels, comps, threshold: thr, autoThreshold: autoThr, hEff, ms: t1 - t0 };
  }

  // Convex hull area (Andrew's monotone chain + shoelace).
  function hullArea(pts) {
    if (pts.length < 3) return 0;
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    const h = lower.slice(0, -1).concat(upper.slice(0, -1));
    let s = 0; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(s) / 2;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return NaN;
    const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  function summarize(comps) {
    const ok = comps.filter(c => c.cls === 'ok');
    const d = ok.map(c => c.dNm).sort((a, b) => a - b), n = d.length;
    const mean = n ? d.reduce((a, b) => a + b, 0) / n : NaN;
    const sd = n > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : NaN;
    const count = k => comps.filter(c => c.cls === k).length;
    return {
      n, mean, sd, cv: sd / mean, d10: percentile(d, 0.1), d50: percentile(d, 0.5), d90: percentile(d, 0.9),
      min: d[0], max: d[n - 1], sorted: d, clusters: count('cluster'), edge: count('edge'), manual: count('manual')
    };
  }

  const api = { analyze, summarize, percentile, otsu };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FeretAnalysis = api;
})(typeof window !== 'undefined' ? window : this);
