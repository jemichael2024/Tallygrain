"""Prepare the NanoAnalyzer image set (ExtraUnity/NanoAnalyzer images.zip, 20 bright-field TEM/STEM images of
supported nanoparticles with binary masks, GPL-3.0) for eval_emps.js. Masks are binary, so ground-truth
particles are their 8-connected components (touching particles in the mask count as one).
Usage: python3 bench/prep_nanoanalyzer.py UNZIPPED_DIR OUT_DIR"""
import sys, os, glob, json
import numpy as np
from PIL import Image
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
meta = {}
for f in sorted(glob.glob(os.path.join(src, 'images', '*.tif'))):
    n = os.path.basename(f)[:-4]; key = n.replace(' ', '_').replace('.', '')
    im = Image.open(f).convert('L'); g = np.array(im).astype(float)
    fg = np.array(Image.open(os.path.join(src, 'masks', n + '_mask.tif')).convert('L')) > 127
    lab, k = ndimage.label(fg, structure=np.ones((3, 3)))
    meta[key] = {'w': im.width, 'h': im.height, 'bright': bool(g[fg].mean() > g[~fg].mean()), 'n': int(k)}
    open(os.path.join(out, key + '.raw'), 'wb').write(np.array(im.convert('RGBA')).tobytes())
    lab.astype(np.int32).tofile(os.path.join(out, key + '.gt'))
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(len(meta), 'images', sum(m['n'] for m in meta.values()), 'gt particles', sum(not m['bright'] for m in meta.values()), 'dark')
