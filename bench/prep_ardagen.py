"""Convert the ArdaGen YOLO dataset to raw RGBA + box metadata for eval_ardagen.js.
Polarity (bright/dark particles) is taken from the labelled box centres, standing in for the user's choice."""
import sys, glob, json, os
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
meta = {}
for f in sorted(glob.glob(os.path.join(src, 'dataset/images/*'))):
    n = os.path.basename(f).rsplit('.', 1)[0]
    im = Image.open(f).convert('L'); a = np.array(im).astype(float); H, W = a.shape
    boxes = [list(map(float, l.split()))[1:] for l in open(os.path.join(src, 'dataset/labels', n + '.txt')) if l.strip()]
    centres = [a[min(H - 1, int(y * H)), min(W - 1, int(x * W))] for x, y, w, h in boxes]
    open(os.path.join(out, n + '.raw'), 'wb').write(np.array(im.convert('RGBA')).tobytes())
    meta[n] = {'w': W, 'h': H, 'bright': bool(np.median(centres) > np.median(a)),
               'boxes': [[x * W, y * H, w * W, h * H] for x, y, w, h in boxes]}
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(len(meta), 'images')
