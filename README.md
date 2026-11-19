# Feret

Fast nanoparticle sizing for SEM and TEM micrographs. Drop in an image, set the scale bar, and get a size distribution (mean, SD, D10/D50/D90, CV) with every counted particle outlined so you can check the result.

> Status: early prototype. "Feret" is a working name (named after the Feret diameter); the trademark has not been checked.

## Why

A statistically meaningful size estimate needs at least ~200 particles. Sizing that many by hand in FIJI/ImageJ takes an experienced researcher about an hour per sample, and two people measuring the same image by hand usually get different answers ([Aviles & Lear, ACS Nanoscience Au, 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12186846/)). Free automated options exist (FIJI + Trainable Weka, LLNL LIST) but need setup and tuning most students skip.

## Run it

No install or build step. Serve the folder and open it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk also works for your own uploads, but the sample menu needs a server because browsers block pixel reads from local files. Everything runs client-side; images never leave the browser.

The app has a settings sidebar (scale, polarity, threshold, filters), a zoomable viewer with hover read-outs (click a particle to exclude it), and a results panel with summary stats, histogram, a per-particle table, and CSV/PNG export. `about.html` is the original landing page.

## How the prototype measures

1. Convert to grayscale and apply a 3x3 box blur.
2. Pick a global threshold with Otsu's method.
3. Label connected regions (8-connectivity).
4. Drop specks below a minimum area and regions cut by the image edge.
5. Flag likely clusters and exclude them: aspect ratio above 1.5, or solidity (area ÷ convex-hull area) below 0.85 for regions of at least 100 px.
6. Report the equivalent circular diameter of each remaining region:

$$
d_{\text{eq}} = 2\sqrt{\frac{A}{\pi}} \cdot s
$$

where $A$ is the region area in pixels and $s$ is the scale in nm/px (scale bar length in nm divided by its length in px).

On the synthetic pattern it measures a mean of 63.2 nm against a true 64.3 nm. Results on real SEM/STEM images are in [docs/test-results.md](docs/test-results.md).

## Known limits

- Touching particles are flagged and excluded, not split. Dense samples will be undercounted.
- One global threshold struggles with low-contrast TEM images and uneven backgrounds.
- Equivalent circular diameter suits near-spherical particles only. Rods and plates need length and width.
- Tested on four open-licence micrographs; touching particles are the dominant failure ([details](docs/test-results.md)).

## Layout

```
index.html            the app
about.html            landing page
css/app.css           app styles
js/analysis.js        segmentation + measurement (no DOM, runs in Node too)
js/app.js             UI: loading, viewer, results, export
samples/              test micrographs + CREDITS.md
docs/research.md      idea shortlist, competitors and sources
docs/test-results.md  how it does on real images
```

## Roadmap

- [x] Test on real SEM/TEM images and record where it fails
- [ ] Test on our own micrographs
- [ ] Split touching particles (watershed)
- [ ] Read the scale bar automatically
- [ ] Batch mode: many images in, one combined distribution out
- [ ] Histogram export with log-normal fit
- [ ] Desktop "snap" hotkey that sizes whatever micrograph is on screen
