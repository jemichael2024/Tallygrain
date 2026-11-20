"""Synthetic bright-field TEM images of nanoparticles with exact masks.

Each image is a grey carbon film (uneven illumination, fine grain, optional darker support patches) with dark
particles of one size population (ellipses or rounded polygons, some touching). About 1 in 5 images is
inverted so it looks like dark-field / HAADF. Returns the same dict layout as train.load():
img (z-scored float32), fg and core (bool masks; core = half-size ellipse per particle, one watershed seed each).
"""
import math, random
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def _shape(draw, cx, cy, a, b, ang, poly, scale=1.0):
    a, b = a * scale, b * scale
    if poly:
        k = poly
        pts = [(cx + a * math.cos(t) * math.cos(ang) - b * math.sin(t) * math.sin(ang),
                cy + a * math.cos(t) * math.sin(ang) + b * math.sin(t) * math.cos(ang))
               for t in [2 * math.pi * i / k + ang for i in range(k)]]
        draw.polygon(pts, fill=255)
    else:
        n = max(24, int(a * 2))
        pts = [(cx + a * math.cos(t) * math.cos(ang) - b * math.sin(t) * math.sin(ang),
                cy + a * math.cos(t) * math.sin(ang) + b * math.sin(t) * math.cos(ang))
               for t in [2 * math.pi * i / n for i in range(n)]]
        draw.polygon(pts, fill=255)


def make(size=512, rng=random):
    H = W = size
    bg = rng.uniform(0.45, 0.85)
    img = np.full((H, W), bg, np.float32)
    img *= 1 + ndimage.gaussian_filter(np.random.randn(H, W).astype(np.float32), rng.uniform(40, 120)) * rng.uniform(5, 25)
    if rng.random() < 0.65:  # support grains / thicker carbon
        s = ndimage.gaussian_filter(np.random.randn(H, W).astype(np.float32), rng.uniform(8, 30))
        sup = s > np.quantile(s, rng.uniform(0.3, 0.8))
        sup = ndimage.gaussian_filter(sup.astype(np.float32), 1.5)
        img *= 1 - sup * rng.uniform(0.05, 0.25)
    img *= 1 + ndimage.gaussian_filter(np.random.randn(H, W).astype(np.float32), rng.uniform(0.7, 2.0)) * rng.uniform(0.03, 0.12)

    r0 = math.exp(rng.uniform(math.log(2.5), math.log(45)))
    cv = rng.uniform(0.08, 0.35)
    cover = rng.uniform(0.04, 0.3)
    n_target = int(cover * H * W / (math.pi * r0 * r0)) + 1
    n_target = min(n_target, 900)
    touch_p = rng.uniform(0, 0.4)
    poly_p = rng.choice([0, 0, 0.3, 0.8])
    dark = rng.uniform(0.15, 0.65)
    gamma = rng.uniform(0, 0.8)
    parts = []
    tries = 0
    while len(parts) < n_target and tries < n_target * 20:
        tries += 1
        r = max(1.5, r0 * math.exp(rng.gauss(0, cv)))
        if parts and rng.random() < touch_p:
            px, py, pr = rng.choice(parts)[:3]
            t = rng.uniform(0, 2 * math.pi); dd = (pr + r) * rng.uniform(0.85, 1.0)
            x, y = px + dd * math.cos(t), py + dd * math.sin(t)
        else:
            x, y = rng.uniform(-r, W + r), rng.uniform(-r, H + r)
        ok = True
        for qx, qy, qr, *_ in parts:
            if (qx - x) ** 2 + (qy - y) ** 2 < (0.82 * (qr + r)) ** 2: ok = False; break
        if not ok: continue
        ar = 1 + abs(rng.gauss(0, 0.12))
        poly = rng.choice([5, 6, 6, 8]) if rng.random() < poly_p else 0
        parts.append((x, y, r, r * math.sqrt(ar), r / math.sqrt(ar), rng.uniform(0, math.pi), poly))

    fg = Image.new('L', (W, H)); core = Image.new('L', (W, H))
    df, dc = ImageDraw.Draw(fg), ImageDraw.Draw(core)
    absorb = np.zeros((H, W), np.float32)
    for x, y, r, a, b, ang, poly in parts:
        m = Image.new('L', (W, H)); _shape(ImageDraw.Draw(m), x, y, a, b, ang, poly)
        mk = np.asarray(m) > 127
        if not mk.any(): continue
        _shape(df, x, y, a, b, ang, poly); _shape(dc, x, y, a, b, ang, 0, 0.5)
        # thickness-like profile: 1 at centre, falls toward the edge (gamma=0 gives a flat disc)
        yy, xx = np.nonzero(mk)
        rho = np.sqrt(((xx - x) / max(a, 1)) ** 2 + ((yy - y) / max(b, 1)) ** 2).clip(0, 1)
        prof = (1 - rho ** 2) ** (gamma / 2) if gamma > 0 else np.ones_like(rho)
        dk = dark * rng.uniform(0.8, 1.2)
        absorb[yy, xx] = np.maximum(absorb[yy, xx], dk * prof)
    if rng.random() < 0.5:  # lattice-fringe / diffraction-contrast mottling inside particles
        absorb *= 1 + ndimage.gaussian_filter(np.random.randn(H, W).astype(np.float32), rng.uniform(1, 3)) * 0.6 * (absorb > 0)
    img = img * (1 - absorb.clip(0, 0.95))
    img = ndimage.gaussian_filter(img, rng.uniform(0.4, 1.4))
    img += np.random.randn(H, W).astype(np.float32) * rng.uniform(0.005, 0.05)
    if rng.random() < 0.2: img = -img
    img = ((img - img.mean()) / (img.std() + 1e-6)).astype(np.float32)
    return dict(img=img, fg=np.asarray(fg) > 127, core=np.asarray(core) > 127, boxes=[])


if __name__ == '__main__':  # write a few examples for a visual check
    import sys, os
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    random.seed(1); np.random.seed(1)
    for i in range(8):
        d = make()
        g = ((d['img'] - d['img'].min()) / (np.ptp(d['img']) + 1e-6) * 255).astype(np.uint8)
        Image.fromarray(np.concatenate([g, d['fg'] * 255, d['core'] * 255], 1).astype(np.uint8)).save(f'{out}/synth_{i}.png')
