"""Prepare the EMPS test split (by256/emps, 99 images with instance masks) for eval_emps.js.
Images come from published paper figures; use for local evaluation only, do not redistribute.
Polarity is taken from the masks (mean inside vs outside), standing in for the user's choice."""
import sys, os, json, csv
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
names = [r[0].strip() for r in csv.reader(open(os.path.join(src, 'test.csv'))) if r and r[0].strip()]
meta = {}
for n in names:
    n = n.rsplit('.', 1)[0]
    fi = os.path.join(src, 'images', n + '.png'); fs = os.path.join(src, 'segmaps', n + '.png')
    if not (os.path.exists(fi) and os.path.exists(fs)): continue
    im = Image.open(fi).convert('L'); g = np.array(im).astype(float)
    lab = np.array(Image.open(fs)).astype(np.int32)
    if lab.ndim == 3: lab = lab[..., 0]
    if lab.shape != g.shape: continue
    fg = lab > 0
    if fg.sum() == 0 or (~fg).sum() == 0: continue
    meta[n] = {'w': im.width, 'h': im.height, 'bright': bool(g[fg].mean() > g[~fg].mean())}
    open(os.path.join(out, n + '.raw'), 'wb').write(np.array(im.convert('RGBA')).tobytes())
    lab.astype(np.int32).tofile(os.path.join(out, n + '.gt'))
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(len(meta), 'images')
