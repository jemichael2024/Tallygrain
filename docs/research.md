# Idea research (2026-11-17)

Goal: an AI tool tied to a Nanotechnology Engineering degree that saves real time and needs no institutional access.

## Shortlist, best first

| # | Concept | Who already does it | Verdict |
|---|---|---|---|
| 1 | Particle sizer (Tallygrain) | Free: FIJI + Trainable Weka; [LLNL LIST](https://pls.llnl.gov/article/22441/using-machine-learning-techniques-extract-nanomaterial-information-sem-images) (open source); research models without released code ([Tao et al., RSC Adv. 2025](https://pubs.rsc.org/en/content/articlehtml/2025/ra/d5ra03210e)) | Buildable now. Gap is ease of use, not the method |
| 2 | XRD/Raman/FTIR interpretation copilot | Rigaku [AI phase ID](https://rigaku.com/products/x-ray-diffraction-and-scattering/xrd/learning/ai-analysis/neural-network-application-phaseid) | Later feature. Good reference databases are licensed |
| 3 | Lab-bench voice assistant | LabTwin (since 2019); [Benchling AI for Academics](https://help.benchling.com/hc/en-us/articles/47505104598541-Benchling-AI-for-Academics-Beta) | Crowded |
| 4 | Screen copilot for MATLAB/Excel | [MATLAB Copilot](https://www.mathworks.com/company/newsroom/mathworks-launches-generative-ai-powered-matlab-copilot-to-boost-productivity-and-accelerate-development-for-engineers-scientists-and-researchers.html) (Oct 2025) | Avoid, vendors own it |
| 5 | Lab report uncertainty/plot helper | QExpy, labtex, ChatGPT | Low willingness to pay, integrity risk |

## Evidence for the problem

- Aviles & Lear, "Practical Guide to Automated TEM Image Analysis...", ACS Nanoscience Au 2025 ([PMC12186846](https://pmc.ncbi.nlm.nih.gov/articles/PMC12186846/)): at least 200 particles for a meaningful estimate; about 200 particles per hour by hand; about 40 samples per work week at most; manual results differ between people.
- Tao, Ji & Liu, RSC Advances 2025: existing methods "often require manual operations" and "manual parameter tuning"; scale-bar measurement in ImageJ is "time-consuming and labor-intensive".

## Open risks

- Students may not pay while FIJI is free. Paying customers are more likely companies or labs doing routine QC.
- Commercial competitors (instrument-vendor software, paid image-analysis suites) not yet checked.
