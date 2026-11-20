"""Load COCO-style instance annotations (e.g. the PSDI gold TEM dataset, CC BY 4.0) as instance label maps."""
import json, os
import numpy as np
from PIL import Image, ImageDraw


def instances(ann_path):
    d = json.load(open(ann_path))
    by = {}
    for a in d['annotations']:
        by.setdefault(a['image_id'], []).append(a)
    return d['images'], by


def label_map(im_info, anns, scale=1.0):
    W, H = round(im_info['width'] * scale), round(im_info['height'] * scale)
    lab = Image.new('I', (W, H)); dr = ImageDraw.Draw(lab)
    for k, a in enumerate(sorted(anns, key=lambda a: -a.get('area', 0)), 1):  # small drawn last stay visible
        seg = a['segmentation']
        if isinstance(seg, str): seg = json.loads(seg)
        for poly in seg:
            if len(poly) >= 6: dr.polygon([(x * scale, y * scale) for x, y in zip(poly[0::2], poly[1::2])], fill=k)
    return np.asarray(lab, dtype=np.int32)


def cores(lab):
    """Inner half (by distance to the edge) of each instance: one watershed seed per particle."""
    from scipy import ndimage
    core = np.zeros(lab.shape, bool)
    for k, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None: continue
        m = np.pad(lab[sl] == k, 1)
        dt = ndimage.distance_transform_edt(m)[1:-1, 1:-1]
        if dt.max() > 0: core[sl] |= dt > 0.5 * dt.max()
    return core
