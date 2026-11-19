"""Train a small U-Net that segments nanoparticles in (S)TEM images.

Data: ArdaGen/STEM-Automated-Nanoparticle-Analysis-YOLOv8-SAM `dataset/` (MIT). Labels there are
bounding boxes, so masks are approximated by the inscribed ellipse of each box (channel 0, "particle")
and a half-size ellipse (channel 1, "core", used as one watershed seed per particle).

Usage: python3 model/train.py /path/to/ardagen_repo out_dir [--iters 3000]
"""
import argparse, glob, json, os, random, time
import numpy as np
import torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image, ImageDraw

TEST = ['Cu3', 'Pd3', 'Pd_silica3', 'PtC2', 'PtCo1', 'PtW5', 'Ru2']  # one image per material family, held out


def load(src):
    data = {}
    for f in sorted(glob.glob(os.path.join(src, 'dataset/images/*'))):
        n = os.path.basename(f).rsplit('.', 1)[0]
        im = np.asarray(Image.open(f).convert('L'), dtype=np.float32)
        H, W = im.shape
        fg, core = Image.new('L', (W, H)), Image.new('L', (W, H))
        df, dc = ImageDraw.Draw(fg), ImageDraw.Draw(core)
        boxes = []
        for line in open(os.path.join(src, 'dataset/labels', n + '.txt')):
            if not line.strip(): continue
            _, x, y, w, h = map(float, line.split())
            x, y, w, h = x * W, y * H, w * W, h * H
            boxes.append([x, y, w, h])
            df.ellipse([x - w / 2, y - h / 2, x + w / 2, y + h / 2], fill=255)
        for x, y, w, h in boxes:  # cores drawn after so overlapping fg does not erase them
            dc.ellipse([x - w / 4, y - h / 4, x + w / 4, y + h / 4], fill=255)
        data[n] = dict(img=normalize(im), fg=np.asarray(fg) > 127, core=np.asarray(core) > 127, boxes=boxes)
    return data


def normalize(im):
    return ((im - im.mean()) / (im.std() + 1e-6)).astype(np.float32)


def block(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
                         nn.Conv2d(cout, cout, 3, padding=1), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class UNet(nn.Module):
    def __init__(self, c=16):
        super().__init__()
        ch = [c, c * 2, c * 4, c * 8, c * 16]
        self.enc = nn.ModuleList([block(1, ch[0])] + [block(ch[i], ch[i + 1]) for i in range(4)])
        self.up = nn.ModuleList([nn.ConvTranspose2d(ch[i + 1], ch[i], 2, stride=2) for i in range(4)])
        self.dec = nn.ModuleList([block(ch[i] * 2, ch[i]) for i in range(4)])
        self.head = nn.Conv2d(ch[0], 2, 1)

    def forward(self, x):
        skips = []
        for i, e in enumerate(self.enc):
            x = e(x)
            if i < 4: skips.append(x); x = F.max_pool2d(x, 2)
        for i in reversed(range(4)):
            x = self.dec[i](torch.cat([self.up[i](x), skips[i]], 1))
        return self.head(x)  # logits; apply sigmoid for probabilities


def sample(data, names, size=256):
    n = random.choice(names); d = data[n]
    s = random.uniform(0.6, 1.5)  # scale jitter so the model sees a range of particle sizes
    H, W = d['img'].shape
    cs = int(size / s)
    cs = min(cs, H, W)
    y = random.randint(0, H - cs); x = random.randint(0, W - cs)
    stack = np.stack([d['img'][y:y + cs, x:x + cs], d['fg'][y:y + cs, x:x + cs], d['core'][y:y + cs, x:x + cs]]).astype(np.float32)
    t = torch.from_numpy(stack)[None]
    t = F.interpolate(t, size=(size, size), mode='bilinear', align_corners=False)[0]
    img, lab = t[:1], (t[1:] > 0.5).float()
    k = random.randint(0, 3)
    img, lab = torch.rot90(img, k, (1, 2)), torch.rot90(lab, k, (1, 2))
    if random.random() < 0.5: img, lab = img.flip(2), lab.flip(2)
    img = img * random.uniform(0.7, 1.3) + random.uniform(-0.3, 0.3) + torch.randn_like(img) * random.uniform(0, 0.15)
    return img, lab


def loss_fn(logits, lab):
    p = torch.sigmoid(logits)
    bce = F.binary_cross_entropy_with_logits(logits, lab, pos_weight=torch.tensor([3.0, 3.0]).view(1, 2, 1, 1))
    inter = (p * lab).sum((2, 3)); dice = 1 - (2 * inter + 1) / (p.sum((2, 3)) + lab.sum((2, 3)) + 1)
    return bce + dice.mean()


def predict(model, img):
    H, W = img.shape
    ph, pw = (16 - H % 16) % 16, (16 - W % 16) % 16
    x = torch.from_numpy(np.pad(img, ((0, ph), (0, pw)), mode='reflect'))[None, None]
    with torch.no_grad():
        return torch.sigmoid(model(x))[0, :, :H, :W].numpy()


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--iters', type=int, default=3000)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    random.seed(0); np.random.seed(0); torch.manual_seed(0); torch.set_num_threads(4)
    data = load(a.src)
    train = [n for n in data if n not in TEST]
    print(len(train), 'train images,', len(TEST), 'test images', flush=True)
    model = UNet(16); opt = torch.optim.AdamW(model.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=a.iters)
    print(sum(p.numel() for p in model.parameters()), 'parameters', flush=True)
    t0 = time.time(); run = 0
    for it in range(1, a.iters + 1):
        model.train()
        batch = [sample(data, train) for _ in range(8)]
        x = torch.stack([b[0] for b in batch]); y = torch.stack([b[1] for b in batch])
        loss = loss_fn(model(x), y)
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        run = 0.98 * run + 0.02 * loss.item() if it > 1 else loss.item()
        if it % 100 == 0:
            print(f'iter {it} loss {run:.3f} {time.time() - t0:.0f}s', flush=True)
            torch.save(model.state_dict(), os.path.join(a.out, 'unet.pt'))
    torch.save(model.state_dict(), os.path.join(a.out, 'unet.pt'))
    model.eval()
    for n in TEST:
        pr = predict(model, data[n]['img'])
        pr.astype(np.float32).tofile(os.path.join(a.out, n + '.prob'))
    json.dump({n: list(data[n]['img'].shape) for n in TEST}, open(os.path.join(a.out, 'test_shapes.json'), 'w'))
    print('done', flush=True)
