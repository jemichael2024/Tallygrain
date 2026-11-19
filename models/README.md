# Tallygrain segmentation model

`tallygrain-unet.onnx` is a small U-Net (about 1.9 M parameters) that outputs two probability maps per pixel: **particle** and **particle core**. In the app's AI mode, the particle map replaces thresholding and each core blob seeds one particle in the watershed split.

| | |
|---|---|
| Training data | [ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM](https://github.com/ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM) `dataset/`, 26 of 33 images (Cu, Pd, Pt, PtCo, PtW, Ru on silica, alumina, carbon). MIT licence, Copyright (c) 2023 ArdaGen. |
| Held out | Cu3, Pd3, Pd_silica3, PtC2, PtCo1, PtW5, Ru2 (one per material family), never seen in training |
| Labels | The dataset has bounding boxes, not outlines, so training masks are the inscribed ellipse of each box (cores: half-size ellipse). Expect slightly rounded outlines. |
| Training | `python3 model/train.py <ardagen repo> <out>`; CPU only, 2,500 steps of 8 random 256 px crops with scale, rotation, flip, contrast and noise augmentation |
| Export | `python3 model/export_onnx.py <out>/unet.pt models/tallygrain-unet.onnx` |
| Licence of the weights | MIT, as a derivative of the MIT-licensed training data |

Not used for training: EMPS (by256/emps). Its repository is MIT, but the images are figures from published journal articles whose copyright sits with the publishers, so a model trained on them may not be shippable. EMPS is used only as a local test set (`bench/eval_emps.js`).
