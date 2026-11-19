"""Prepare the pulcovamon Au nanoparticle TEM images: read the scale-bar value from the repo's
metadata, measure the bar length in px (longest dark run in the bottom 8%), downsample like the app."""
import sys, glob, json, os
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
meta = {}
for d in ['AuNP20nm', '40nmAuNP', 'AuNP50nm', '80nmAuNP', 'AuNP80nm']:
    nominal = int(''.join(c for c in d.replace('AuNP', '') if c.isdigit()))
    mf = glob.glob(os.path.join(src, 'data', d, '*metadata.json'))
    if not mf: continue
    for k, v in json.load(open(mf[0])).items():
        f = os.path.join(src, 'data', d, k)
        if not k.endswith('.jpg') or not os.path.exists(f): continue
        im = Image.open(f).convert('L'); a = np.array(im); H, W = a.shape
        bar = 0
        for y in range(int(H * 0.92), H):
            run = 0
            for x in range(W):
                run = run + 1 if a[y, x] < 40 else 0
                bar = max(bar, run)
        sf = min(1, 1600 / W); im2 = im.resize((round(W * sf), round(H * sf)), Image.BILINEAR)
        n = d + '_' + k[:-4]
        open(os.path.join(out, n + '.raw'), 'wb').write(np.array(im2.convert('RGBA')).tobytes())
        meta[n] = {'w': im2.width, 'h': im2.height, 'nominal': nominal, 'barNm': float(v[0]), 'barPx': bar, 'sf': sf}
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(len(meta), 'images')
