# Accuracy against images with a known answer (2026-11-19)

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
