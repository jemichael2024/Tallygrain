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

  function labelComponents(mask, w, hEff) {
    const n = w * hEff, labels = new Int32Array(mask.length), stack = new Int32Array(n);
    let id = 0;
    for (let i = 0; i < n; i++) {
      if (!mask[i] || labels[i]) continue;
      id++; let sp = 0; stack[sp++] = i; labels[i] = id;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= hEff) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (mask[q] && !labels[q]) { labels[q] = id; stack[sp++] = q; }
          }
        }
      }
    }
    return { labels, n: id };
  }

  // Exact Euclidean distance transform (Felzenszwalb & Huttenlocher): distance from each
  // foreground pixel to the nearest background pixel. Returns distances in px.
  function distanceTransform(mask, w, hEff) {
    const BIG = 1e12, n = w * hEff, f = new Float64Array(n);
    for (let i = 0; i < n; i++) f[i] = mask[i] ? BIG : 0;
    const len = Math.max(w, hEff), g = new Float64Array(len), d = new Float64Array(len);
    const v = new Int32Array(len), z = new Float64Array(len + 1);
    function pass(m) {
      const sep = (q, r) => ((g[q] + q * q) - (g[r] + r * r)) / (2 * q - 2 * r);
      let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (let q = 1; q < m; q++) {
        let s = sep(q, v[k]);
        while (s <= z[k]) { k--; s = sep(q, v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < m; q++) { while (z[k + 1] < q) k++; const t = q - v[k]; d[q] = t * t + g[v[k]]; }
    }
    for (let x = 0; x < w; x++) { for (let y = 0; y < hEff; y++) g[y] = f[y * w + x]; pass(hEff); for (let y = 0; y < hEff; y++) f[y * w + x] = d[y]; }
    for (let y = 0; y < hEff; y++) { for (let x = 0; x < w; x++) g[x] = f[y * w + x]; pass(w); for (let x = 0; x < w; x++) f[y * w + x] = Math.sqrt(d[x]); }
    return f;
  }

  /* Marker-controlled watershed on the distance transform.
     Markers are distance-transform peaks (roughly particle centres). A weaker peak is dropped when it
     lies within strength x (radius of a stronger peak) of that peak, so one particle keeps one marker
     while two touching particles (centres about 2 radii apart) keep two. Pixels are then flooded from
     the markers in order of decreasing distance, which places the cut at the neck between particles. */
  function watershedSplit(mask, ccLabels, nCC, w, h, hEff, strength) {
    const n = w * hEff, dt = distanceTransform(mask, w, hEff);
    const peaks = [];
    for (let y = 0; y < hEff; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, v = dt[i];
        if (!mask[i] || v < 1.4) continue;
        let isMax = true;
        for (let dy = -1; dy <= 1 && isMax; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= hEff) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w || (!dx && !dy)) continue;
            if (dt[yy * w + xx] > v) { isMax = false; break; }
          }
        }
        if (isMax) peaks.push(i);
      }
    }
    peaks.sort((a, b) => dt[b] - dt[a]);
    const kept = new Map(); // cc label -> accepted peaks
    const markers = new Int32Array(mask.length);
    let id = 0;
    for (const p of peaks) {
      const c = ccLabels[p], px = p % w, py = (p - px) / w;
      const list = kept.get(c) || [];
      let ok = true;
      for (const q of list) {
        const qx = q % w, qy = (q - qx) / w;
        if (Math.hypot(px - qx, py - qy) < strength * dt[q]) { ok = false; break; }
      }
      if (!ok) continue;
      list.push(p); kept.set(c, list); markers[p] = ++id;
    }
    // Regions with no peak (thin or tiny) keep one marker at their deepest pixel.
    const best = new Int32Array(nCC + 1).fill(-1);
    for (let i = 0; i < n; i++) { const c = ccLabels[i]; if (c && !kept.has(c) && (best[c] < 0 || dt[i] > dt[best[c]])) best[c] = i; }
    for (let c = 1; c <= nCC; c++) if (best[c] >= 0) markers[best[c]] = ++id;

    // Priority flood (max-heap on distance).
    const out = new Int32Array(mask.length), heapI = new Int32Array(n), heapP = new Float64Array(n);
    let hs = 0;
    const push = (i, pr) => { let k = hs++; while (k > 0) { const pa = (k - 1) >> 1; if (heapP[pa] >= pr) break; heapI[k] = heapI[pa]; heapP[k] = heapP[pa]; k = pa; } heapI[k] = i; heapP[k] = pr; };
    const pop = () => {
      const top = heapI[0], li = heapI[--hs], lp = heapP[hs]; let k = 0;
      for (;;) { let c = 2 * k + 1; if (c >= hs) break; if (c + 1 < hs && heapP[c + 1] > heapP[c]) c++; if (heapP[c] <= lp) break; heapI[k] = heapI[c]; heapP[k] = heapP[c]; k = c; }
      heapI[k] = li; heapP[k] = lp; return top;
    };
    const queued = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (markers[i]) { out[i] = markers[i]; queued[i] = 1; push(i, dt[i]); }
    while (hs) {
      const p = pop(), x = p % w, y = (p - x) / w, L = out[p];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= hEff) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (mask[q] && !queued[q] && ccLabels[q] === ccLabels[p]) { out[q] = L; queued[q] = 1; push(q, dt[q]); }
        }
      }
    }
    return { labels: out, n: id };
  }

  function measure(labels, nLab, w, hEff) {
    const A = new Float64Array(nLab + 1), SX = new Float64Array(nLab + 1), SY = new Float64Array(nLab + 1);
    const SXX = new Float64Array(nLab + 1), SYY = new Float64Array(nLab + 1), SXY = new Float64Array(nLab + 1);
    const X0 = new Int32Array(nLab + 1).fill(w), Y0 = new Int32Array(nLab + 1).fill(hEff), X1 = new Int32Array(nLab + 1), Y1 = new Int32Array(nLab + 1);
    const E = new Uint8Array(nLab + 1);
    for (let y = 0; y < hEff; y++) {
      for (let x = 0; x < w; x++) {
        const l = labels[y * w + x]; if (!l) continue;
        A[l]++; SX[l] += x; SY[l] += y; SXX[l] += x * x; SYY[l] += y * y; SXY[l] += x * y;
        if (x < X0[l]) X0[l] = x; if (x > X1[l]) X1[l] = x; if (y < Y0[l]) Y0[l] = y; if (y > Y1[l]) Y1[l] = y;
        if (x === 0 || y === 0 || x === w - 1 || y === hEff - 1) E[l] = 1;
      }
    }
    const comps = [];
    for (let l = 1; l <= nLab; l++) {
      const a = A[l] || 1, mx = SX[l] / a, my = SY[l] / a;
      const cxx = SXX[l] / a - mx * mx, cyy = SYY[l] / a - my * my, cxy = SXY[l] / a - mx * my;
      const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
      comps.push({ id: l, area: A[l], cx: mx, cy: my, ar: Math.sqrt(l1 / l2), edge: !!E[l], bbox: [X0[l], Y0[l], X1[l], Y1[l]], cls: A[l] ? 'ok' : 'small' });
    }
    return comps;
  }

  /**
   * rgba: Uint8ClampedArray (w*h*4). Options:
   *  nmPerPx, bright (bool), minArea (px), elongMax, solidityMin, cropPct (bottom strip ignored),
   *  threshold (0-255, or null for Otsu), split (bool), splitStrength (~0.5-1.5, higher splits less),
   *  excluded: [{x,y}] points the user clicked to exclude.
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
    let fg = 0;
    for (let i = 0; i < nEff; i++) { mask[i] = bright ? (bl[i] > thr) : (bl[i] < thr); fg += mask[i]; }

    // 1) Connected components of the mask, 8-connectivity.
    const cc = labelComponents(mask, w, hEff);
    let labels = cc.labels, nLab = cc.n;
    // 2) Optionally split touching particles with a distance-transform watershed.
    let splitCount = 0;
    if (o.split) {
      const ws = watershedSplit(mask, cc.labels, cc.n, w, h, hEff, o.splitStrength || 1);
      labels = ws.labels; nLab = ws.n; splitCount = ws.n - cc.n;
    }
    // 3) Measure each region: area, centroid, bounding box, edge contact, ellipse aspect ratio.
    const comps = measure(labels, nLab, w, hEff);

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
    return { labels, comps, threshold: thr, autoThreshold: autoThr, hEff, splitCount, foreground: fg / nEff, ms: t1 - t0 };
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
