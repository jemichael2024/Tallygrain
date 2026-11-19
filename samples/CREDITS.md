# Sample image credits

These images are redistributed for testing. Each keeps its original licence. They are **not** covered by any licence Tallygrain itself adopts.

| File | Type | Scale used in the app | Source | Licence |
|---|---|---|---|---|
| `sem/gold_on_carbon_jeol.jpg` | SEM (JEOL, ×200,000, 15 kV) | 100 nm bar = 82 px | `example/Gold_on_carbon.jpg` in [rybakov-ks/ParticleAnalyzer](https://github.com/rybakov-ks/ParticleAnalyzer) @ `9dacec3` | GPL-3.0 (repository licence). The repository does not say who took the image; it looks like a standard gold-on-carbon test specimen. **Confirm rights before any public or commercial use.** |
| `sem/cathode_licovo4_tescan.jpg` | SEM (TESCAN MIRA, 100 kx, 20 kV) | 1 µm bar = 387 px (view field 3.306 µm over 1280 px) | `example/Cathode_LiCoVO4.jpg` in [rybakov-ks/ParticleAnalyzer](https://github.com/rybakov-ks/ParticleAnalyzer) @ `9dacec3` | GPL-3.0 (repository licence) |
| `tem/sio2_haadf.png` | STEM HAADF, SiO₂ particles, 128 × 128 px | 8.5524 nm/px from file metadata | `particlespy/data/SiO2 HAADF Image.hspy` in [ePSIC-DLS/ParticleSpy](https://github.com/ePSIC-DLS/ParticleSpy) @ `898612e` | GPL-3.0 (repository licence) |
| `tem/jeol_haadf.png` | STEM HAADF (JEOL), nanoparticles, 112 × 112 px | 1.2490 nm/px from file metadata | `particlespy/data/JEOL HAADF Image.dm4` in [ePSIC-DLS/ParticleSpy](https://github.com/ePSIC-DLS/ParticleSpy) @ `898612e` | GPL-3.0 (repository licence) |

The two STEM images were converted from the original `.hspy`/`.dm4` data to 8-bit PNG with a 0.5–99.5 percentile contrast stretch (RosettaSciIO + Pillow). Pixel size comes from the files' own calibration. Neither source reports a reference particle size for these images.
