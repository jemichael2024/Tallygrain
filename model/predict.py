"""Run the trained U-Net on a benchmark folder (raw RGBA + meta.json with w, h) and write <name>.prob
(float32: particle map then core map, each h*w), matching what the browser feeds analysis.js.
Usage: python3 model/predict.py unet.pt BENCH_DIR OUT_DIR"""
import sys, os, json
import numpy as np, torch
sys.path.insert(0, os.path.dirname(__file__))
from train import UNet, normalize, predict
w_path, src, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
m = UNet(16); m.load_state_dict(torch.load(w_path, map_location='cpu')); m.eval(); torch.set_num_threads(4)
for n, d in json.load(open(os.path.join(src, 'meta.json'))).items():
    rgba = np.fromfile(os.path.join(src, n + '.raw'), dtype=np.uint8).reshape(d['h'], d['w'], 4).astype(np.float32)
    g = 0.299 * rgba[..., 0] + 0.587 * rgba[..., 1] + 0.114 * rgba[..., 2]
    predict(m, normalize(g)).astype(np.float32).tofile(os.path.join(out, n + '.prob'))
print('done')
