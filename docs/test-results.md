# Test results on real micrographs (2026-11-19)

Method: threshold segmentation (Otsu on a 3×3 blurred image), 8-connected regions, equivalent circular diameter. Regions are excluded when they touch the image edge, fall below the minimum area, have aspect ratio above 1.5, or (when at least 100 px in area) have solidity below 0.85.

| Image | Particles visible (rough) | Measured | Mean d | What went wrong |
|---|---|---|---|---|
| Synthetic pattern (known truth) | 100 inside frame | 97 | 63.2 nm (truth 64.3 nm) | Two overlapping pairs flagged, as intended |
| SEM Au on carbon | ~40 large + hundreds of tiny dots | 29 | 44.4 nm, CV 100% | Bimodal sample, so one mean is meaningless. Tiny dots below about 8 px are either dropped or noisy. Some irregular single crystals flagged as clusters |
| STEM SiO₂ spheres | ~150 | 4 | 40.5 nm | Almost every sphere touches a neighbour, so whole clumps merge into one region. Only isolated spheres are measured. Particles are only ~5 px across, too small for shape checks |
| STEM JEOL nanoparticles | ~20 | 2 | 11.6 nm | Same merging problem, plus one bright particle dominates the threshold |
| SEM LiCoVO₄ cathode | dense packed grains | 0 | – | Grains are packed with no background between them, so a global threshold cannot separate them. Needs edge- or ML-based segmentation |

## Takeaways

1. **Touching particles are the main failure.** Real samples agglomerate. Splitting them (distance-transform watershed, then a trained model) is the top priority.
2. **Bimodal samples need separate populations,** for example a size cut-off or a log-scale histogram.
3. **Low-resolution images** (particles under ~8 px across) need sub-pixel handling or should be flagged as unreliable.
4. **Dense SEM microstructures** (sintered grains, cathodes) are a different problem from dispersed particles and are probably out of scope for v1.

None of the source repositories report a reference size for these exact images, so apart from the synthetic pattern these are qualitative checks, not accuracy measurements.
