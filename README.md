# Feret

Fast nanoparticle sizing for SEM and TEM micrographs. Drop in an image, set the scale bar, and get a size distribution (mean, SD, D10/D50/D90, CV) with every counted particle outlined so you can check the result.

> Status: early prototype. "Feret" is a working name (named after the Feret diameter); the trademark has not been checked.

## Why

A statistically meaningful size estimate needs at least ~200 particles. Sizing that many by hand in FIJI/ImageJ takes an experienced researcher about an hour per sample, and two people measuring the same image by hand usually get different answers ([Aviles & Lear, ACS Nanoscience Au, 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12186846/)). Free automated options exist (FIJI + Trainable Weka, LLNL LIST) but need setup and tuning most students skip.

## Try it

No install. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Everything runs client-side; images never leave the browser.

## How the prototype measures

1. Convert to grayscale and apply a 3x3 box blur.
2. Pick a global threshold with Otsu's method.
3. Label connected regions (8-connectivity).
4. Drop specks below a minimum area and regions cut by the image edge.
5. Flag regions with aspect ratio above a limit (default 1.5) as likely clusters and exclude them.
6. Report the equivalent circular diameter of each remaining region:

$$
d_{\text{eq}} = 2\sqrt{\frac{A}{\pi}} \cdot s
$$

where $A$ is the region area in pixels and $s$ is the scale in nm/px (scale bar length in nm divided by its length in px).

On the built-in synthetic sample it measured a mean of 61.4 nm against a true 62.2 nm.

## Known limits

- Touching particles are flagged and excluded, not split. Dense samples will be undercounted.
- One global threshold struggles with low-contrast TEM images and uneven backgrounds.
- Equivalent circular diameter suits near-spherical particles only. Rods and plates need length and width.
- Not yet tested on real micrographs.

## Layout

```
index.html        landing page + in-browser sizer (single file, no build step)
docs/research.md  idea shortlist, competitors and sources
samples/          put test micrographs here (see samples/README.md)
```

## Roadmap

- [ ] Test on 3-5 real SEM/TEM images and record where it fails
- [ ] Split touching particles (watershed)
- [ ] Read the scale bar automatically
- [ ] Batch mode: many images in, one combined distribution out
- [ ] Histogram export with log-normal fit
- [ ] Desktop "snap" hotkey that sizes whatever micrograph is on screen
