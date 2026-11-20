# Accuracy against images with a known answer (2026-11-19)

## Update 2026-11-20: automatic scale-bar reading

When you open an image, Tallygrain looks for a scale bar:
1. **Finding the bar** (`js/scalebar.js`): a solid, thin, horizontal rectangle much darker or brighter than what surrounds it.
2. **Reading the label** (tesseract.js OCR, in the browser): the app tries the area right of, below, above and left of the bar.

It fills both fields only when it reads a label. That label must be a round value (1, 2, 2.5, 3 or 5 × 10ⁿ), sit where a label belongs, and pass a confidence floor. If the bar is found but the label can't be read, only the px field is filled and the nm field is cleared. The bar is always outlined in cyan so you can check it.

| Test set | Images | Bar length correct | Both fields filled correctly | Filled wrongly | Left for manual entry |
|---|---|---|---|---|---|
| Commercial Au TEM (bar px known) | 20 | 20 / 20 | **15** | 0 | 5 |
| PSDI gold TEM (labels read by eye) | 24 | 24 found* | **12** | 0 | 12 |
| NanoAnalyzer, images with a bar | 10 (+3 too small to check by eye) | 10 found* | **9** | 0 | 1 |
| App samples with a bar (JEOL, TESCAN) | 2 | 2 / 2 | **1** | 0 | 1 |
| **All of the above** | **56** | | **37 (66%)** | **0** | **19** |
| Images with no scale bar | 9 | | correctly left alone: **9 / 9** | 0 | |

\*Bar length not checked against an independent measurement for PSDI and NanoAnalyzer. Where it was checked, it agreed within 0.5%.

**Caveats:**
- The confidence floor (20) and the round-value rule were set while looking at these same images. On new images, expect a lower hit rate and possibly some wrong fills, so always check the outline and the fields.
- Ruler-style bars, like the TESCAN tick ruler, are only found when their outline happens to look solid. Text in very small fonts often can't be read.
- Reading takes about 1 to 10 s per image. The OCR engine (about 15 MB) downloads on first use and runs locally.

## Update 2026-11-20 (later): two-model AI mode

AI mode now has two models and picks one per image (**Auto**, the default). You can also force one by hand:
- **Supported:** v1 + clean-up. For particles on textured catalyst supports.
- **Dispersed:** the gold-trained v2a + clean-up. For separate particles on a clean film.

Auto runs both models, then picks **Dispersed** only when two things hold (`chooseModel` in `js/analysis.js`):
- the dispersed model finds no more particle centres than the supported model, and
- the background has little fine texture: the high-pass residual on non-particle pixels is below 0.2 of the image's contrast.

| Test set (F1 at IoU ≥ 0.5) | Threshold | Supported only (before) | **Auto (shipped)** | Auto picked Dispersed |
|---|---|---|---|---|
| ArdaGen catalysts, 7 held-out | 0.011 | **0.502** | 0.492 | 12 of all 33 images |
| EMPS, 99 images | 0.055 | 0.231 | **0.282** | 33 of 99 |
| NanoAnalyzer, 20 images | 0.032 | **0.436** | **0.436** | 0 of 20 |
| PSDI real gold TEM, 24 images | **0.332** | 0.133 | 0.271 | 19 of 24 |
| Commercial Au 50 nm, median D50 (true 50) | 49.4 nm | 20.6 nm | **51.8 nm** | 13 of 20 gold images |

**Caveats:**
- The two cut-offs (1.0 and 0.2) were chosen by looking at these same test sets. That is a mild form of tuning on the test data. Only two coarse values were tried, but the real-world gain may be a little smaller than this table shows.
- On clean gold, plain thresholding is still better (F1 0.33 vs 0.27). Auto mostly closes the gap for AI mode rather than beating thresholding.
- Running both models takes about twice as long as one: roughly 10 s for a 1,200 px image on a laptop CPU.

## Update 2026-11-20: more training data, and a clean-up step

**What changed in the app:** AI mode now cleans up the model's particle mask before measuring. It fills small holes inside particles and drops blobs that have no predicted particle centre. The model weights are unchanged (v1), because none of the retrained models beat v1 overall (see below).

**New test sets (evaluation only, not shipped):**
- **PSDI real gold TEM:** 24 experimental bright-field TEM images of Au spheres and rods, 1,109 hand-outlined particles. CC BY 4.0. Stewart & Da Silva De Sa, PSDI record sgvf0-j3g53. Scored at half resolution.
- **NanoAnalyzer:** 20 bright-field TEM/STEM images of supported particles with binary masks, 2,635 particles (touching particles in the mask count as one). GPL-3.0. ExtraUnity/NanoAnalyzer.

F1 at IoU ≥ 0.5 (box IoU for ArdaGen, mask IoU for the rest). Gold 50 nm is the median per-image D50 (true value 50 nm).

| Test set | Threshold (default settings) | v1 (before) | **v1 + clean-up (shipped)** | v2a: + synthetic + PSDI gold | v2b: + PSDI gold only |
|---|---|---|---|---|---|
| ArdaGen catalysts, 7 held-out | 0.011 | 0.409 | **0.502** | 0.191 | 0.280 |
| EMPS, 99 images | 0.055 | 0.188 | 0.231 | **0.264** | 0.221 |
| NanoAnalyzer, 20 images | 0.032 | 0.354 | **0.436** | 0.177 | 0.316 |
| PSDI real gold TEM, 24 images | **0.332** | 0.095 | 0.133 | 0.213 | 0.172 |
| Commercial Au 50 nm, D50 | **49.4 nm** | 15.8 nm | 20.6 nm | **49.3 nm** | 38.2 nm |

**Reading this:**
- The clean-up step alone lifted v1 on every set. That is the shipped change.
- Training on 400 synthetic gold TEM images (PSDI train split) plus our own synthetic bright-field images fixed 50 nm gold sizing (49.3 nm). The cost was that the model started marking support texture as particles, so catalyst F1 dropped from 0.50 to 0.19. Dropping our synthetic images (v2b) did not solve this.
- On clean bright-field gold, plain thresholding is still the best method (F1 0.33 and D50 49.4 nm). The app's advice stays the same: **Threshold for clean, dispersed particles; AI model for particles on textured supports.**
- Likely next lever: a larger model, or separate "dispersed" and "supported" models. One small CPU-trained model is trading one domain off against the other.
- The 40 nm and 80 nm commercial-gold sets fail for every method, including thresholding, so the problem is probably those images' scale metadata, not detection.

Training data options added: `model/synth.py` (synthetic bright-field TEM with exact masks), `model/coco.py` + `--psdi` (PSDI COCO outlines), `--invert`, `--extra`. Bench prep: `bench/prep_psdi.py`, `bench/prep_nanoanalyzer.py`.

## Update: trained segmentation model (AI mode)

A small U-Net (1.9 M parameters, [models/README.md](../models/README.md)) trained on CPU on 26 of the 33 ArdaGen catalyst images. Scored on the 7 held-out images, which the model never saw. Matching is stricter than the section below: a detection counts only if its bounding box overlaps a labelled box with IoU of at least 0.5.

| Test set | Threshold (+ flattening, splitting) | AI model | Better? |
|---|---|---|---|
| ArdaGen held-out, 7 images, 1,270 particles: precision | 0.6% | **39.5%** | Yes |
| ... recall | 13.8% | **42.4%** | Yes |
| ... F1 | 0.011 | **0.409** | Yes |
| ... median size error of matches | 14.8% | **9.0%** | Yes |
| EMPS (99 SEM/TEM paper figures, 2,608 outlined particles), F1 at mask IoU 0.5 | 0.055 | **0.188** | Yes, mostly through far fewer false detections |
| Commercial 20 nm Au, TEM bright field, D50 | **19.3 / 18.3 nm** | 22.9 / 2.6 nm | **No** |
| Commercial 50 nm Au, median D50 of 8 images | **49.4 nm** | 15.8 nm | **No** |

**Reading this:** the model is far better on what it was trained on (bright metal particles on a textured support in STEM), and helps on the mixed EMPS set, but it is worse on plain bright-field TEM of dispersed particles, which it never saw. So threshold stays the default and AI mode is a switch. The published YOLOv8 + SAM pipeline on this data reports F1 0.91, so there is still a large gap; more varied, shippable training data is the main lever.

Per-image held-out results (AI model): Cu3 F1 ≈ 0.70, Pd3 0.62, Pd_silica3 0.48, PtW5 0.67, Ru2 0.75, PtCo1 0.23, PtC2 (bright-field TEM on carbon) 0.02.

## Update: background flattening

Tallygrain now subtracts a smooth background before thresholding (per-cell percentile, median + mean smoothed, bilinear interpolation). It is on by default. Same benchmarks, before → after:

| Case | Before | After |
|---|---|---|
| 50 nm Au, uneven lighting (image 009) | 2,005 detections, D50 10.4 nm | **13 particles, D50 50.9 nm** |
| 50 nm Au, uneven lighting (image 008) | 1,926 detections, D50 10.4 nm | **9 particles, D50 44.7 nm** |
| 50 nm Au, all 8 images, median D50 | 46.1 nm | **49.4 nm** |
| 20 nm Au, D50 | 19.4 / 18.2 nm | 19.3 / 18.3 nm (unchanged) |
| Catalyst set recall | 31% | 41% |
| Catalyst set precision | 2% | 2% (still fails: textured supports need a trained model) |
| Repo samples (SiO₂, STEM NPs, synthetic) | | Unchanged within 1 nm |

Results below are the earlier run without flattening.


Settings for every run: Otsu threshold, watershed splitting on (strength 1.0), min. area 20 px (4 px for the catalyst set), cluster above aspect ratio 1.5 or below solidity 0.85. Scripts and sources: [bench/](../bench/README.md).

## 1. Commercial gold nanoparticles, TEM bright field (closest to a typical lab report)

Source: [pulcovamon/Nanoparticles_app](https://github.com/pulcovamon/Nanoparticles_app). Answer = manufacturer's nominal size; scale from each image's bar.

| Nominal | Images | Tallygrain D50 per image (nm) | Verdict |
|---|---|---|---|
| 20 nm | 2 | 19.4, 18.2 | **Within 3-9%** |
| 50 nm, clean images | 5 | 60.3, 56.0, 49.7, 41.3, 46.1 (median 49.7) | **Median within 1%**, single images off by up to 21% |
| 50 nm, uneven background | 2 | 10.4, 10.4 (about 2,000 junk regions) | Fails: a brightness gradient across the image beats the global threshold |
| 50 nm, very high mag | 1 | 0.5 | Fails: the 3 particles fill the frame and touch the edges |
| 40 nm and 80 nm | 10 | mostly 8-10 | Not a Tallygrain error: these grids are mostly ~8-10 nm particles with a few large ones (visible in the images). The nominal size does not describe what is on the grid |

## 2. Supported metal catalysts, STEM/TEM (hard case)

Source: [ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM](https://github.com/ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM) (MIT): 33 images, 5,341 hand-labelled particles (Cu, Pd, Pt, PtCo, PtW, Ru on silica, alumina or carbon).

| Metric | Tallygrain | Published model on the same data |
|---|---|---|
| Recall (labelled particles found) | 31% | F1 0.91 (YOLOv8 + SAM) |
| Precision (Tallygrain detections that are real particles) | 2% | |
| Median size error, matched particles | 54% | |

**Tallygrain fails here.** Tiny metal particles sit on a support that is itself textured and bright, so a global threshold picks up the support. This needs a trained model, not a better threshold.

## What this means

- On clean, dispersed TEM samples (the common lab-report case) Tallygrain already lands within a few percent of the known size.
- Next fixes in order of payoff: ~~background flattening~~ (done, see top), a **size filter or two-population view** (bimodal grids), and an **ML segmentation model** for particles on supports.
- Caveat: nominal sizes are the supplier's figure, not a per-particle measurement, and the 20 nm and clean 50 nm sets are only 7 images. Treat these as early evidence, not a validation.
