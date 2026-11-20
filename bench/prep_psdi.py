"""Prepare the PSDI gold TEM validation split (24 real experimental images, manual instance outlines, CC BY 4.0;
Stewart & Da Silva De Sa, PSDI record sgvf0-j3g53) for eval_emps.js. Images are downscaled by --scale (default 0.5)
since the browser app also downsizes images above 1600 px.
Usage: python3 bench/prep_psdi.py PSDI_DIR OUT_DIR [split] [scale]"""
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'model'))
import coco
src, out = sys.argv[1], sys.argv[2]
split = sys.argv[3] if len(sys.argv) > 3 else 'val'; sc = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
os.makedirs(out, exist_ok=True)
ims, by = coco.instances(os.path.join(src, f'instances_annotations_{split}.json'))
meta = {}
for info in ims:
    im = Image.open(os.path.join(src, 'img', split, info['file_name'])).convert('L')
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.BILINEAR)
    lab = coco.label_map(info, by.get(info['id'], []), sc)
    n = 'psdi_' + os.path.splitext(info['file_name'])[0].replace('-', '_')
    meta[n] = {'w': im.width, 'h': im.height, 'bright': False, 'n': len(by.get(info['id'], []))}
    open(os.path.join(out, n + '.raw'), 'wb').write(np.array(im.convert('RGBA')).tobytes())
    lab.astype(np.int32).tofile(os.path.join(out, n + '.gt'))
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(len(meta), 'images', sum(m['n'] for m in meta.values()), 'gt particles')
