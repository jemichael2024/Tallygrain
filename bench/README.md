# Accuracy benchmarks

Scripts that score `js/analysis.js` against outside images with a known answer. The image data is not stored here; clone the source repositories first.

| Benchmark | Source | Licence | Ground truth |
|---|---|---|---|
| Supported catalysts (STEM/TEM) | [ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM](https://github.com/ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM) `dataset/` | MIT | 5,341 hand-drawn bounding boxes over 33 images |
| Commercial Au nanoparticles (TEM) | [pulcovamon/Nanoparticles_app](https://github.com/pulcovamon/Nanoparticles_app) `data/` | none stated (evaluate locally, do not redistribute) | Manufacturer's nominal size (20/40/50/80 nm) + scale bar value from the repo's metadata |

```bash
git clone --depth 1 https://github.com/ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM /tmp/ardagen
git clone --depth 1 https://github.com/pulcovamon/Nanoparticles_app /tmp/aunp
pip install pillow numpy
python3 bench/prep_ardagen.py /tmp/ardagen /tmp/bench_ard && node bench/eval_ardagen.js /tmp/bench_ard --flatten
python3 bench/prep_aunp.py /tmp/aunp /tmp/bench_au && node bench/eval_aunp.js /tmp/bench_au --flatten
```

Drop `--flatten` to reproduce the earlier numbers. Results and interpretation: [docs/accuracy.md](../docs/accuracy.md).
