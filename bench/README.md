# Accuracy benchmarks

Scripts that score `js/analysis.js` against outside images with a known answer. The image data is not stored here; clone the source repositories first.

| Benchmark | Source | Licence | Ground truth |
|---|---|---|---|
| Supported catalysts (STEM/TEM) | [ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM](https://github.com/ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM) `dataset/` | MIT | 5,341 hand-drawn bounding boxes over 33 images |
| EMPS, 99-image test split (SEM/TEM paper figures) | [by256/emps](https://github.com/by256/emps) | Repository MIT; images are journal figures, so evaluate locally only | Hand-drawn instance masks (2,608 particles) |
| Commercial Au nanoparticles (TEM) | [pulcovamon/Nanoparticles_app](https://github.com/pulcovamon/Nanoparticles_app) `data/` | none stated (evaluate locally, do not redistribute) | Manufacturer's nominal size (20/40/50/80 nm) + scale bar value from the repo's metadata |

```bash
git clone --depth 1 https://github.com/ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM /tmp/ardagen
git clone --depth 1 https://github.com/pulcovamon/Nanoparticles_app /tmp/aunp
pip install pillow numpy
python3 bench/prep_ardagen.py /tmp/ardagen /tmp/bench_ard && node bench/eval_ardagen.js /tmp/bench_ard --flatten
python3 bench/prep_aunp.py /tmp/aunp /tmp/bench_au && node bench/eval_aunp.js /tmp/bench_au --flatten
```

AI model: `python3 model/predict.py unet.pt <bench dir> <prob dir>`, then add `--prob <prob dir>` to any eval script (`--only Cu3,Pd3,Pd_silica3,PtC2,PtCo1,PtW5,Ru2` restricts the catalyst set to the held-out images). EMPS: `python3 bench/prep_emps.py <emps repo> /tmp/bench_emps && node bench/eval_emps.js /tmp/bench_emps --flatten`.

Drop `--flatten` to reproduce the earlier numbers. Results and interpretation: [docs/accuracy.md](../docs/accuracy.md).
