/* Tallygrain app: UI wiring around TallygrainAnalysis. */
(function () {
  'use strict';
  const A = window.TallygrainAnalysis;
  const $ = id => document.getElementById(id);

  // Sample images shipped in samples/ (see samples/CREDITS.md). Scale values are per image.
  const SAMPLES = [
    { id: 'synthetic', label: 'Synthetic test pattern', gen: true },
    { id: 'gold', label: 'SEM: Au on carbon (×200k)', src: 'samples/sem/gold_on_carbon_jeol.jpg', barNm: 100, barPx: 82, crop: 7, bright: true, minArea: 20, elong: 1.5 },
    { id: 'sio2', label: 'STEM: SiO₂ spheres (HAADF)', src: 'samples/tem/sio2_haadf.png', barNm: 8.5524, barPx: 1, crop: 0, bright: true, minArea: 4, elong: 1.5 },
    { id: 'jeol', label: 'STEM: nanoparticles (HAADF)', src: 'samples/tem/jeol_haadf.png', barNm: 1.2490, barPx: 1, crop: 0, bright: true, minArea: 8, elong: 1.5 },
    { id: 'ru', label: 'STEM: Ru catalyst (AI model, size in px)', src: 'samples/tem/ru_catalyst_ardagen.jpg', barNm: 1, barPx: 1, crop: 0, bright: true, minArea: 4, elong: 1.5, method: 'ai' },
    { id: 'cathode', label: 'SEM: LiCoVO₄ cathode (dense)', src: 'samples/sem/cathode_licovo4_tescan.jpg', barNm: 1000, barPx: 387, crop: 9, bright: true, minArea: 200, elong: 1.5 }
  ];

  const MAX_W = 1600, MIN_W = 512;
  const src = document.createElement('canvas');
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const view = $('view'), vctx = view.getContext('2d');
  let srcData = null;          // ImageData of the working image
  let scaleFactor = 1;         // working px / original px
  let result = null, summary = null;
  let excluded = [];           // [{x,y}] in working-image px
  let selected = 0;            // component id
  let zoom = 1, fitMode = true;
  let name = '';
  let truth = null;
  let bright = true;
  let method = 'threshold';     // 'threshold' or 'ai'
  let prob = null, probFor = null, modelBusy = false, modelMs = 0;
  // Two models: 'supported' (catalyst supports) and 'dispersed' (clean film). aiModel is 'auto' or one of them.
  const MODELS = { supported: 'models/tallygrain-unet.onnx', dispersed: 'models/tallygrain-unet-dispersed.onnx' };
  const sessions = {}; let aiModel = 'auto', probs = {}, choice = null;
  let scaleBox = null, ocrWorker = null, scaleJob = 0;

  /* ---------- Synthetic sample ---------- */
  function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
  function makeSynthetic(seed) {
    const W = 640, H = 480, r = rng(seed);
    src.width = W; src.height = H;
    const g = sctx, bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#323232'); bg.addColorStop(1, '#262626');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const parts = []; let tries = 0;
    while (parts.length < 110 && tries < 8000) {
      tries++;
      const rad = Math.exp(Math.log(13) + 0.22 * gauss(r)), x = r() * W, y = r() * H, k = r() < 0.06 ? 0.85 : 1.08;
      if (parts.some(p => Math.hypot(p.x - x, p.y - y) < (p.r + rad) * k)) continue;
      parts.push({ x, y, r: rad });
    }
    for (const p of parts) {
      const gr = g.createRadialGradient(p.x - p.r * .25, p.y - p.r * .3, p.r * .1, p.x, p.y, p.r);
      gr.addColorStop(0, '#d2d2d2'); gr.addColorStop(.72, '#b0b0b0'); gr.addColorStop(.92, '#ececec'); gr.addColorStop(1, 'rgba(200,200,200,0.15)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    }
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, d[i] + gauss(r) * 16)); d[i] = d[i + 1] = d[i + 2] = v; }
    g.putImageData(im, 0, 0);
    const inside = parts.filter(p => p.x - p.r > 1 && p.y - p.r > 1 && p.x + p.r < W - 1 && p.y + p.r < H - 1).map(p => p.r * 2 * 2.5);
    truth = { mean: inside.reduce((a, b) => a + b, 0) / inside.length, n: inside.length };
  }

  /* ---------- Loading ---------- */
  function setSettings(s) {
    $('barNm').value = s.barNm; $('barPx').value = s.barPx; $('crop').value = s.crop;
    $('minArea').value = s.minArea; $('elong').value = s.elong; $('solid').value = s.solid != null ? s.solid : 0.85;
    setPolarity(s.bright !== false);
    setMethod(s.method || 'threshold');
    $('autoThr').checked = true; $('thr').disabled = true;
  }

  function afterLoad(label) {
    scaleBox = null; scaleJob++; scaleMsg(''); $('scaleBusy').textContent = '';
    srcData = sctx.getImageData(0, 0, src.width, src.height);
    view.width = src.width; view.height = src.height;
    excluded = []; selected = 0; name = label; fitMode = true;
    $('filename').textContent = label + '  ·  ' + Math.round(src.width / scaleFactor) + ' × ' + Math.round(src.height / scaleFactor) + ' px';
    applyZoom();
    run();
  }

  function loadSample(id) {
    const s = SAMPLES.find(x => x.id === id) || SAMPLES[0];
    $('sample').value = s.id;
    if (s.gen) {
      scaleFactor = 1;
      makeSynthetic(7 + Math.floor(Math.random() * 1000));
      setSettings({ barNm: 200, barPx: 80, crop: 0, bright: true, minArea: 40, elong: 1.5 });
      afterLoad('synthetic_pattern.png');
      return;
    }
    const img = new Image();
    img.onload = () => {
      truth = null;
      drawImage(img);
      setSettings(s);
      afterLoad(s.src.split('/').pop());
    };
    img.onerror = () => status('Could not load ' + s.src + '. Open the app through a web server (see README), not as a local file.');
    img.src = s.src;
  }

  function drawImage(img) {
    // Large images are downsampled for speed; small ones (e.g. 128 px STEM frames) are upsampled
    // up to 4x so the distance transform has enough pixels per particle to find the necks.
    scaleFactor = img.naturalWidth > MAX_W ? MAX_W / img.naturalWidth : Math.min(4, Math.max(1, MIN_W / img.naturalWidth));
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    src.width = Math.round(img.naturalWidth * scaleFactor);
    src.height = Math.round(img.naturalHeight * scaleFactor);
    sctx.drawImage(img, 0, 0, src.width, src.height);
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { status('That file is not an image. Use PNG, JPG, BMP or a browser-readable TIFF.'); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      truth = null; drawImage(img); URL.revokeObjectURL(url);
      $('sample').value = '';
      setSettings({ barNm: $('barNm').value, barPx: $('barPx').value, crop: 8, bright: bright, minArea: 20, elong: 1.5, method });  // keep the chosen method
      afterLoad(file.name);
      detectScale();
    };
    img.onerror = () => status('The browser could not read ' + file.name + '. 16-bit TIFFs often fail; export as PNG first.');
    img.src = url;
  }

  /* ---------- Analysis ---------- */
  function nmPerPx() {
    const nm = parseFloat($('barNm').value), px = parseFloat($('barPx').value);
    return (nm > 0 && px > 0) ? (nm / px) / scaleFactor : NaN;
  }

  /* ---------- Scale bar: find the bar, read its label with OCR (tesseract.js, loaded on first use) ---------- */
  async function ensureOcr() {
    if (ocrWorker) return ocrWorker;
    if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
    const base = new URL('vendor/tesseract/', location.href).href;
    ocrWorker = await Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base + 'lang', gzip: true, cacheMethod: 'none' });
    await ocrWorker.setParameters({ tessedit_pageseg_mode: '11' });  // sparse text
    return ocrWorker;
  }
  function cropCanvas(c) {
    const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height;
    cv.getContext('2d').putImageData(new ImageData(c.data, c.width, c.height), 0, 0); return cv;
  }
  function scaleMsg(t) { $('scaleAuto').hidden = !t; $('scaleAuto').textContent = t || ''; }
  async function detectScale() {
    if (!srcData) return;
    const job = ++scaleJob, img = srcData, w = src.width, h = src.height;
    const bar = TallygrainScalebar.findBar(img.data, w, h);
    scaleBox = bar ? { bar, img } : null; draw();
    if (!bar) { scaleMsg('No scale bar found. Enter the scale by hand.'); return; }
    const barPxOrig = bar.len / scaleFactor;
    $('scaleBusy').textContent = 'reading label…';
    let best = null;
    try {
      const worker = await ensureOcr(), results = [];
      for (const c of TallygrainScalebar.labelCrops(img.data, w, h, bar)) {
        const r = (await worker.recognize(cropCanvas(c), {}, { text: true, blocks: true })).data;
        if (job !== scaleJob) return;  // a newer image was opened
        const lines = []; for (const bl of r.blocks || []) for (const pa of bl.paragraphs) for (const ln of pa.lines) lines.push({ text: ln.text, bbox: ln.bbox, confidence: ln.confidence });
        results.push({ crop: c, text: r.text, confidence: r.confidence, lines });
        best = TallygrainScalebar.pickLabel(bar, results);
        if (best && best.score >= 80) break;
      }
    } catch (e) { best = null; console.warn('OCR failed', e); }
    if (job !== scaleJob) return;
    $('scaleBusy').textContent = '';
    $('barPx').value = +barPxOrig.toFixed(1);
    if (best) {
      $('barNm').value = +best.nm.toPrecision(6);
      scaleMsg('Read the scale bar as ' + best.value + ' ' + best.unit + ' = ' + barPxOrig.toFixed(1) + ' px' + (best.guessed ? ' (label partly guessed: "' + best.text + '")' : '') + '. Check the cyan outline and fix the fields if this is wrong.');
    } else {
      $('barNm').value = '';  // do not leave the previous image's value next to this bar
      scaleMsg('Found a bar of ' + barPxOrig.toFixed(1) + ' px (cyan outline) but could not read its label. Type its length in nm.');
    }
    run();
  }

  /* ---------- AI model (ONNX Runtime Web, loaded on first use) ---------- */
  function loadScript(url) {
    return new Promise((ok, fail) => { const t = document.createElement('script'); t.src = url; t.onload = ok; t.onerror = () => fail(new Error('could not load ' + url)); document.head.appendChild(t); });
  }
  async function ensureSession(name) {
    if (sessions[name]) return sessions[name];
    if (!window.ort) await loadScript('vendor/onnxruntime-web/ort.wasm.min.js');
    ort.env.wasm.wasmPaths = 'vendor/onnxruntime-web/';
    ort.env.wasm.numThreads = 1;
    sessions[name] = await ort.InferenceSession.create(MODELS[name], { executionProviders: ['wasm'] });
    return sessions[name];
  }
  // Same preprocessing as model/train.py: grayscale, per-image zero mean / unit variance, pad to a multiple of 16.
  async function computeProb(session) {
    const w = src.width, h = src.height, d = srcData.data, N = w * h;
    const W = Math.ceil(w / 16) * 16, H = Math.ceil(h / 16) * 16;
    const g = new Float32Array(N); let mean = 0;
    for (let i = 0; i < N; i++) { g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]; mean += g[i]; }
    mean /= N; let v = 0; for (let i = 0; i < N; i++) v += (g[i] - mean) * (g[i] - mean);
    const sd = Math.sqrt(v / N) + 1e-6, x = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const sy = Math.min(y, h - 1), sx = Math.min(xx, w - 1);  // edge padding
      x[y * W + xx] = (g[sy * w + sx] - mean) / sd;
    }
    const out = await session.run({ image: new ort.Tensor('float32', x, [1, 1, H, W]) });
    const p = out.prob.data, fg = new Float32Array(N), core = new Float32Array(N);
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { fg[y * w + xx] = p[y * W + xx]; core[y * w + xx] = p[W * H + y * W + xx]; }
    return { fg, core };
  }
  function setMethod(m) {
    method = m;
    $('method').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === m)));
    document.querySelector('.thr-only').hidden = m === 'ai';
    $('aiNote').hidden = m !== 'ai';
    $('aiModelField').hidden = m !== 'ai';
  }
  function setAiModel(m) {
    aiModel = m; probFor = null;
    $('aiModel').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === m)));
  }
  // Run the model(s) the current setting needs on the current image, then pick the probability maps to use.
  async function modelProb() {
    if (probs.img !== srcData) probs = { img: srcData };
    const need = aiModel === 'auto' ? ['supported', 'dispersed'] : [aiModel];
    for (const name of need) if (!probs[name]) probs[name] = await computeProb(await ensureSession(name));
    if (aiModel === 'auto') {
      choice = A.chooseModel(srcData.data, src.width, src.height, probs.supported, probs.dispersed);
      $('aiPick').textContent = 'Auto picked: ' + choice.pick + ' (centre ratio ' + choice.ratio.toFixed(2) + ', texture ' + choice.texture.toFixed(2) + ')';
      return probs[choice.pick];
    }
    choice = { pick: aiModel }; $('aiPick').textContent = '';
    return probs[aiModel];
  }

  function run() {
    if (!srcData) return;
    if (method === 'ai' && probFor !== srcData) {
      if (!modelBusy) {
        modelBusy = true;
        const t0 = performance.now();
        status('Running the AI model' + (aiModel === 'auto' ? 's' : '') + ' on ' + src.width + ' × ' + src.height + ' px… (first run downloads the model)');
        modelProb().then(p => {
          prob = p; probFor = srcData; modelBusy = false; modelMs = performance.now() - t0; run();
        }).catch(e => { modelBusy = false; setMethod('threshold'); status('The AI model could not run: ' + e.message + '. Switched back to threshold.'); run(); });
      }
      return;
    }
    const s = nmPerPx();
    $('nmpx').textContent = isFinite(s) ? (s * scaleFactor).toFixed(s * scaleFactor < 1 ? 4 : 3) + ' nm/px' : 'set the scale';
    result = A.analyze(srcData.data, src.width, src.height, {
      nmPerPx: isFinite(s) ? s : 1,
      bright,
      minArea: Math.max(1, +$('minArea').value || 1) * scaleFactor * scaleFactor,
      elongMax: Math.max(1.05, +$('elong').value || 1.5),
      solidityMin: Math.max(0, Math.min(1, +$('solid').value || 0)),
      cropPct: +$('crop').value || 0,
      threshold: $('autoThr').checked ? null : +$('thr').value,
      flatten: $('flatten').checked,
      bgCell: Math.max(0, +$('bgCell').value || 0) * scaleFactor,
      split: $('split').checked,
      splitStrength: Math.max(0.3, Math.min(2, +$('splitStrength').value || 1)),
      prob: method === 'ai' ? prob : null,
      excluded
    });
    if (result.threshold != null) {
      if ($('autoThr').checked) { $('thr').value = result.autoThreshold; }
      $('thrVal').textContent = result.threshold;
    }
    summary = A.summarize(result.comps);
    $('manualCount').textContent = summary.manual;
    draw(); renderStats(); renderTable(); drawHist();
    status();
  }

  /* ---------- Rendering ---------- */
  const COL = { ok: [242, 183, 56], cluster: [255, 106, 77], edge: [141, 151, 163], manual: [176, 92, 255], sel: [56, 209, 255] };
  function draw() {
    const w = src.width, h = src.height;
    const out = vctx.createImageData(w, h), o = out.data, d = srcData.data;
    o.set(d);
    if (result && $('showOverlay').checked) {
      const L = result.labels, comps = result.comps, hE = result.hEff;
      for (let y = 0; y < hE; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, l = L[i]; if (!l) continue;
          const c = comps[l - 1]; if (c.cls === 'small') continue;
          const isSel = l === selected;
          const b = x === 0 || L[i - 1] !== l || x === w - 1 || L[i + 1] !== l || y === 0 || L[i - w] !== l || y === hE - 1 || L[i + w] !== l;
          if (b) { const col = isSel ? COL.sel : COL[c.cls]; o[4 * i] = col[0]; o[4 * i + 1] = col[1]; o[4 * i + 2] = col[2]; }
          else if (isSel) { o[4 * i] = o[4 * i] * .6 + 56 * .4; o[4 * i + 1] = o[4 * i + 1] * .6 + 209 * .4; o[4 * i + 2] = o[4 * i + 2] * .6 + 255 * .4; }
        }
      }
      for (let i = w * hE; i < w * h; i++) { o[4 * i] *= .3; o[4 * i + 1] *= .3; o[4 * i + 2] *= .3; }
    }
    vctx.putImageData(out, 0, 0);
    if (scaleBox && scaleBox.img === srcData) {  // outline of the detected scale bar
      const b = scaleBox.bar, m = Math.max(3, b.thick);
      vctx.save(); vctx.strokeStyle = '#38d1ff'; vctx.lineWidth = Math.max(2, w / 400); vctx.setLineDash([6, 4]);
      vctx.strokeRect(b.x0 - m, b.y0 - m, b.len + 2 * m, b.thick + 2 * m); vctx.restore();
    }
  }

  const fmt = (v, k = 1) => isFinite(v) ? v.toFixed(k) : '–';
  function renderStats() {
    const s = summary;
    const cells = [
      [s.n, 'measured', true], [fmt(s.mean) + ' nm', 'mean d', true], [fmt(s.sd) + ' nm', 'std. dev.'],
      [fmt(s.d10), 'D10 (nm)'], [fmt(s.d50), 'D50 (nm)'], [fmt(s.d90), 'D90 (nm)'],
      [isFinite(s.cv) ? (100 * s.cv).toFixed(0) + '%' : '–', 'CV'], [s.clusters, 'clusters'], [s.edge, 'cut by edge']
    ];
    $('stats').innerHTML = cells.map(([v, l, k]) => '<div class="stat' + (k ? ' key' : '') + '"><b>' + v + '</b><span>' + l + '</span></div>').join('');
  }

  function renderTable() {
    const ok = result.comps.filter(c => c.cls === 'ok');
    const tb = $('table').tBodies[0];
    tb.innerHTML = ok.map((c, k) => '<tr data-id="' + c.id + '"' + (c.id === selected ? ' class="sel"' : '') + '><td>' + (k + 1) + '</td><td>' + fmt(c.dNm) + '</td><td>' + fmt(c.areaNm2, 0) + '</td><td>' + fmt(c.ar, 2) + '</td></tr>').join('')
      || '<tr><td colspan="4" style="text-align:left;color:var(--muted)">No particles measured. Check the threshold and polarity.</td></tr>';
  }

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function drawHist(target) {
    const c = target || $('hist'), dpr = target ? 2 : (window.devicePixelRatio || 1);
    const W = target ? 640 : (c.clientWidth || 300), H = target ? 340 : 170;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ink = target ? '#333' : cssVar('--muted'), acc = target ? '#1f5fd1' : cssVar('--accent'), line = target ? '#ddd' : cssVar('--line');
    if (target) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
    g.font = '11px "IBM Plex Mono", monospace'; g.fillStyle = ink;
    const ds = summary ? summary.sorted : [];
    if (ds.length < 2) { g.fillText('Not enough particles to plot', 8, 20); $('binInfo').textContent = ''; return; }
    const lo = Math.floor(ds[0]), hi = Math.ceil(ds[ds.length - 1]);
    const bins = Math.min(24, Math.max(6, Math.round(Math.sqrt(ds.length)))), bw = (hi - lo) / bins || 1;
    const cnt = new Array(bins).fill(0); ds.forEach(v => cnt[Math.min(bins - 1, Math.floor((v - lo) / bw))]++);
    const max = Math.max(...cnt), pl = 30, pr = 10, pt = target ? 30 : 8, pb = 24, iw = W - pl - pr, ih = H - pt - pb;
    if (target) { g.font = '13px sans-serif'; g.fillText((name || 'image') + '  ·  n = ' + ds.length + '  ·  mean ' + fmt(summary.mean) + ' nm', pl, 18); g.font = '11px monospace'; }
    g.strokeStyle = line; g.lineWidth = 1;
    for (let k = 0; k <= 2; k++) {
      const y = pt + ih - ih * k / 2;
      g.beginPath(); g.moveTo(pl, y + .5); g.lineTo(W - pr, y + .5); g.stroke();
      g.fillStyle = ink; g.textAlign = 'right'; g.fillText(String(Math.round(max * k / 2)), pl - 6, y + 4);
    }
    g.fillStyle = acc;
    cnt.forEach((v, k) => { const x = pl + iw * k / bins, b = iw / bins, hh = ih * v / max; g.fillRect(x + 1, pt + ih - hh, Math.max(1, b - 2), hh); });
    // D50 marker
    const x50 = pl + iw * (summary.d50 - lo) / (hi - lo || 1);
    g.strokeStyle = ink; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x50 + .5, pt); g.lineTo(x50 + .5, pt + ih); g.stroke(); g.setLineDash([]);
    g.fillStyle = ink; g.textAlign = 'left'; g.fillText(lo + ' nm', pl, H - 7);
    g.textAlign = 'right'; g.fillText(hi + ' nm', W - pr, H - 7);

    if (!target) $('binInfo').textContent = bins + ' bins of ' + fmt(bw) + ' nm · dashed = D50';
  }

  function status(msg) {
    if (msg) { $('status').textContent = msg; return; }
    const s = nmPerPx();
    const parts = [
      Math.round(src.width / scaleFactor) + '×' + Math.round(src.height / scaleFactor) + ' px',
      (isFinite(s) ? (s * scaleFactor).toFixed(3) + ' nm/px' : 'no scale'),
      ...(method === 'ai' ? ['AI model: ' + (choice ? choice.pick : '') + (aiModel === 'auto' ? ' (auto)' : '') + ' (' + fmt(modelMs / 1000, 1) + ' s)'] : [
      ($('flatten').checked ? 'flattened (' + Math.round((+$('bgCell').value || A.autoBgCell(src.width, result.hEff) / scaleFactor)) + ' px cells)' : 'no flattening'),
      'threshold ' + result.threshold + ($('autoThr').checked ? ' (Otsu)' : ' (manual)')]),
      result.comps.length + ' regions' + (result.splitCount ? ' (' + result.splitCount + ' from splits)' : ''),
      (scaleFactor > 1 ? 'upsampled ×' + scaleFactor.toFixed(2) : scaleFactor < 1 ? 'downsampled ×' + scaleFactor.toFixed(2) : 'native'),
      fmt(result.ms, 0) + ' ms',
      'zoom ' + Math.round(zoom * 100) + '%'
    ];
    if (truth) parts.push('synthetic truth: mean ' + fmt(truth.mean) + ' nm over ' + truth.n + ' particles');
    $('status').textContent = parts.join('   ·   ');
  }

  /* ---------- Zoom / pointer ---------- */
  function applyZoom() {
    const stage = $('stage');
    if (fitMode) {
      const aw = stage.clientWidth - 32, ah = stage.clientHeight - 32;
      zoom = Math.max(0.05, Math.min(aw / src.width, ah / src.height));
      if (!isFinite(zoom) || zoom <= 0) zoom = 1;
    }
    view.style.width = Math.round(src.width * zoom) + 'px';
    view.style.height = Math.round(src.height * zoom) + 'px';
    view.classList.toggle('pixelated', zoom >= 2);
    if (result) status();
  }
  function setZoom(z) { fitMode = false; zoom = Math.max(0.1, Math.min(16, z)); applyZoom(); }

  function compAt(ev) {
    const r = view.getBoundingClientRect();
    const x = (ev.clientX - r.left) * src.width / r.width, y = (ev.clientY - r.top) * src.height / r.height;
    const xi = Math.floor(x), yi = Math.floor(y);
    if (!result || xi < 0 || yi < 0 || xi >= src.width || yi >= result.hEff) return { x, y, c: null };
    const l = result.labels[yi * src.width + xi];
    return { x, y, c: l ? result.comps[l - 1] : null };
  }

  const NAMES = { ok: 'measured', cluster: 'likely cluster, excluded', edge: 'cut by edge, excluded', manual: 'excluded by you', small: 'below min. area' };
  view.addEventListener('mousemove', ev => {
    const { c } = compAt(ev), tip = $('tip');
    if (!c) { tip.hidden = true; return; }
    tip.textContent = 'd = ' + fmt(c.dNm) + ' nm · AR ' + fmt(c.ar, 2) + ' · solidity ' + fmt(c.solidity, 2) + ' · ' + NAMES[c.cls];
    tip.style.left = (ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 14) + 'px'; tip.hidden = false;
  });
  view.addEventListener('mouseleave', () => { $('tip').hidden = true; });
  view.addEventListener('click', ev => {
    const { x, y, c } = compAt(ev); if (!c || c.cls === 'small') return;
    if (c.cls === 'manual') {
      const [x0, y0, x1, y1] = c.bbox;
      excluded = excluded.filter(p => {
        const xi = Math.round(p.x), yi = Math.round(p.y);
        return !(xi >= x0 && xi <= x1 && yi >= y0 && yi <= y1 && result.labels[yi * src.width + xi] === c.id);
      });
    } else if (c.cls === 'ok') {
      excluded.push({ x, y });
    } else return;
    run();
  });

  /* ---------- Exports ---------- */
  function download(blob, fname) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const base = () => (name || 'tallygrain').replace(/\.[^.]+$/, '');
  $('exportCsv').addEventListener('click', () => {
    if (!result) return;
    const s = nmPerPx() * scaleFactor;
    const rows = result.comps.filter(c => c.cls === 'ok').map((c, k) => [k + 1, c.dNm.toFixed(2), c.areaNm2.toFixed(1), c.ar.toFixed(3), (c.cx / scaleFactor).toFixed(1), (c.cy / scaleFactor).toFixed(1)].join(','));
    const head = '# Tallygrain export, image: ' + name + ', scale: ' + s.toFixed(4) + ' nm/px, method: ' + (method === 'ai' ? 'AI model (' + (choice ? choice.pick : '') + (aiModel === 'auto' ? ', auto' : '') + ')' : 'threshold ' + result.threshold) + '\n# n=' + summary.n + ', mean=' + fmt(summary.mean, 2) + ' nm, sd=' + fmt(summary.sd, 2) + ' nm, D10=' + fmt(summary.d10, 2) + ', D50=' + fmt(summary.d50, 2) + ', D90=' + fmt(summary.d90, 2) + '\n';
    download(new Blob([head + 'id,diameter_nm,area_nm2,aspect_ratio,x_px,y_px\n' + rows.join('\n') + '\n'], { type: 'text/csv' }), base() + '_particles.csv');
  });
  $('exportPng').addEventListener('click', () => {
    if (!summary) return;
    const c = document.createElement('canvas'); drawHist(c);
    c.toBlob(b => b && download(b, base() + '_histogram.png'), 'image/png');
  });

  /* ---------- Controls ---------- */
  $('detectScale').addEventListener('click', () => detectScale());
  $('aiModel').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; setAiModel(b.dataset.v); run(); });
  $('method').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; setMethod(b.dataset.v); run(); });
  function setPolarity(isBright) {
    bright = isBright;
    $('polarity').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String((b.dataset.v === 'bright') === isBright)));
  }
  $('polarity').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; setPolarity(b.dataset.v === 'bright'); run(); });
  $('autoThr').addEventListener('change', () => { $('thr').disabled = $('autoThr').checked; run(); });
  $('thr').addEventListener('input', () => { $('thrVal').textContent = $('thr').value; schedule(); });
  ['barNm', 'barPx', 'minArea', 'elong', 'solid', 'crop', 'splitStrength', 'bgCell'].forEach(id => $(id).addEventListener('input', schedule));
  $('showOverlay').addEventListener('change', draw);
  $('flatten').addEventListener('change', () => { $('bgCell').disabled = !$('flatten').checked; run(); });
  $('split').addEventListener('change', () => { $('splitStrength').disabled = !$('split').checked; run(); });
  $('clearManual').addEventListener('click', () => { excluded = []; run(); });
  $('zoomIn').addEventListener('click', () => setZoom(zoom * 1.25));
  $('zoomOut').addEventListener('click', () => setZoom(zoom / 1.25));
  $('zoomFit').addEventListener('click', () => { fitMode = true; applyZoom(); });
  $('table').addEventListener('click', ev => {
    const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
    selected = +tr.dataset.id === selected ? 0 : +tr.dataset.id;
    draw(); renderTable();
  });
  $('file').addEventListener('change', ev => { loadFile(ev.target.files[0]); ev.target.value = ''; });
  $('sample').innerHTML = '<option value="" disabled>Load a sample…</option>' + SAMPLES.map(s => '<option value="' + s.id + '">' + s.label + '</option>').join('');
  $('sample').addEventListener('change', ev => loadSample(ev.target.value));

  const stage = $('stage');
  ['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, ev => { ev.preventDefault(); $('drop').hidden = false; }));
  ['dragleave', 'drop'].forEach(t => stage.addEventListener(t, ev => { ev.preventDefault(); if (t === 'dragleave' && stage.contains(ev.relatedTarget)) return; $('drop').hidden = true; }));
  stage.addEventListener('drop', ev => { const f = ev.dataTransfer.files[0]; if (f) loadFile(f); });
  window.addEventListener('paste', ev => { const f = [...(ev.clipboardData?.files || [])][0]; if (f) loadFile(f); });

  let timer = 0;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 120); }
  window.addEventListener('resize', () => { if (fitMode) applyZoom(); drawHist(); });
  // Light / dark mode toggle. Without a saved choice the page follows the system setting.
  $('themeToggle').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('tallygrain-theme', root.dataset.theme); } catch (e) {}
    drawHist();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawHist());

  // Start on a real micrograph when served over http, synthetic otherwise (file:// blocks pixel reads).
  loadSample(location.protocol === 'file:' ? 'synthetic' : 'gold');
})();
