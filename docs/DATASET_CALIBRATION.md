# Dataset Calibration — Kaggle Indian Business Cards

**Dataset:** Indian Business cards sample images (Kaggle)
**Dataset URL:** https://www.kaggle.com/datasets/chauhanmayank8/indian-business-cards-sample-images
**Date:** 2026-09-08

## Access

Kaggle CLI/API and browser-authenticated download were both unavailable in this environment (no
`kaggle` package, no `~/.kaggle/kaggle.json`, no `KAGGLE_USERNAME`/`KAGGLE_KEY`, and the Claude in
Chrome extension wasn't connected). The user downloaded the dataset manually via their own
authenticated Kaggle session and provided the local path:
`C:\Users\admin\Downloads\archive\scraped_images_bcards`. License/owner metadata could not be
retrieved automatically (Kaggle's dataset page is client-rendered and requires authentication to
query via API) — **not confirmed**; verify on the Kaggle page before any redistribution beyond
local QA use. This pass only reads the images locally for calibration; nothing from the dataset is
committed to git (`qa-data/`, `qa-results/` are `.gitignore`d) or shipped in the app.

## Critical finding: this dataset is design templates, not real photographed cards

Visual inspection of multiple images (both randomly sampled and drawn from quality-gate rejects)
showed **every one is a business-card design template/mockup with generic placeholder text** —
"Full Name," "Company Name," "Address Line 1," "Phone Number," "E-mail Address" — not a real
photographed card with real data. This was confirmed to the user mid-task, who directed the work
to continue as **quality-gate/capture-pipeline calibration only** (Phases 2-8, 14-20 of the
original plan) and skip OCR/extraction/phone-format/address-format/category benchmarking (Phases
9-13) — there is no real text content in this dataset to validate extraction accuracy against, and
inventing ground-truth labels for placeholder text would be meaningless. OCR/extraction validation
for this project continues to rest on the real physical-card testing already performed this
session (see `FINAL_DEVICE_QA_REPORT.md`) and the existing Jest extraction test suite.

This restriction does **not** limit the quality-gate work below: `computePixelMetrics()`
(blur/brightness/contrast/content-coverage) operates purely on pixel data and is completely
indifferent to whether the text is real or placeholder — the visual diversity (colors, layouts,
logos, contrast levels) this dataset provides is genuinely useful for that purpose.

## Phase 2 — Dataset inventory

Full inventory: `qa-results/dataset-inventory.json` (script: `scripts/qa/inventory.py`).

| | |
|---|---|
| Total files | 1436 |
| Readable | 1436 (0 errors) |
| Format | 100% PNG |
| Orientation | **100% landscape** — 0 portrait images exist in this dataset |
| Aspect ratio | 1.809–1.811 (essentially fixed — the scrape/crop process normalized every image to ~1.81:1) |
| Width | 322–804px (median 804) |
| Height | 178–444px (median 444) |
| Brightness (mean of per-image means) | 161.2 / 255 |
| Dark cards (mean brightness < 80) | 107 (7.5%) |
| Light cards (mean brightness > 200) | 406 (28.3%) |
| Low-contrast cards (std-dev < 25) | 77 (5.4%) |

**Limitation:** zero portrait examples exist natively. Portrait testing (Phase 8) used a
synthetic 90°-rotation of the landscape set instead (see below) — the one deliberate addition to
the transform list beyond the original spec, needed to test orientation handling at all.

**Limitation:** these are flat, digitally-rendered graphic templates, not photographs — they carry
none of a real camera photo's natural lighting falloff, shadow, texture, or sensor noise. This
matters directly for Phase 7 below.

## Phase 3 — Representative subset

90 images selected (script: `scripts/qa/select-subset.py`), stratified across brightness terciles
× contrast terciles × baseline pass/reject status (18 buckets, 5 per bucket, deterministic seed) —
list at `qa-results/subset-80.txt`. Diversity confirmed: every bucket had real candidates (smallest
bucket had 8 available, still yielded 5), so the subset isn't dominated by any one visual profile.

## Phase 4 — Baseline quality-gate benchmark (full 1436, real production algorithm)

Ran the **actual production `computePixelMetrics()`** (`src/services/imageQuality/
pixelAnalysis.ts`, imported directly — zero reimplementation) against every image, resized to the
real `IMAGE_QUALITY_CONFIG.analysisWidth` (480px), with a byte-for-byte mirror of
`evaluateMetrics()`'s threshold logic (documented in `scripts/qa/benchmark-quality.ts` — the one
piece not directly importable outside Metro, since its file also contains RN-only imports for a
different function; see that script's header comment). Full results: `qa-results/
card-quality-baseline.csv`.

| | |
|---|---|
| Total | 1436 |
| Passed | 1083 (75.4%) |
| Rejected | 353 (24.6%) |
| — blurry | 0 |
| — too_dark | 23 (1.6%) |
| — too_bright | 152 (10.6%) |
| — low_contrast | 5 (0.3%) |
| — incomplete_card | 229 (16.0%) |

Zero blur rejections is expected and not evidence of anything — these are pristine vector/graphic
renders with no possibility of camera blur, so the blur metric had nothing to catch. This baseline
is not representative for blur calibration; Phase 5's synthetic blur (applied by this QA pass, with
known parameters) is the meaningful signal there instead.

## Phase 5 — Synthetic degradation

1980 reproducible variants generated from the 90-image subset (script: `scripts/qa/degrade.py`,
fixed seed) — 22 transforms × 90 originals: blur (mild/medium/strong), darkening (moderate/
strong), overexposure (moderate/strong), reduced contrast, rotation (5°/10°/20°/90°-portrait-sim),
perspective skew (mild/moderate), crop (5%/10%/20%), downscale-then-upscale (75%/50%/30%), and
JPEG re-compression (quality 40/15). Manifest: `qa-results/degraded-manifest.json`. Files kept only
under `qa-data/` (gitignored, not shipped).

Per-transform results (real production algorithm, same as Phase 4): `qa-results/
degraded-quality-v2.csv` (post-fix; `degraded-quality.csv` is the pre-fix run, kept for the
before/after comparison below). Analysis script: `scripts/qa/analyze-degraded.py`.

## Phase 6 — Blur calibration

| Transform | Pass rate | Median blurVariance | vs. baseline median (1516.5) |
|---|---|---|---|
| (undegraded baseline) | 75.4% | 1516.5 | — |
| blur_mild (σ=1) | 52.2% | 402.5 | 3.8x lower |
| blur_medium (σ=3) | 0.0% | 12.6 | 120x lower |
| blur_strong (σ=6) | 0.0% | 1.5 | 1000x lower |

The threshold (60) cleanly and monotonically separates sharp from blurred — medium and strong blur
are caught with 100% reliability, and even the mild blur pass rate reflects genuinely-softer images
crossing the threshold rather than noise. **No evidence supports changing
`blurVarianceThreshold`; left unchanged.**

One correlated-but-expected side effect: blurring an image also lowers its measured
`contentCoverage` (blur smooths the same edges both metrics are built from), so `blurry` and
`incomplete_card` co-fire on the same images at medium/strong blur. This is correct behavior, not
a bug — a heavily blurred image genuinely has less detectable edge content too.

## Phase 7 — Brightness/contrast calibration

**A real, concrete false-reject was found and is documented — but the fix is deliberately NOT
implemented in this pass; see reasoning below.**

`img86.png` — a clean, professional "Chartered Accountant" template: solid black text on a plain
white background, thin green border, textbook-legible — was rejected as `too_bright`
(brightness 245.23) purely because of its light background, despite having reasonable measured
contrast (33.72, well above `minContrast=18`). This is exactly the failure mode the task brief
warned about: a valid design penalized for an intentional light color choice, not for any actual
glare or readability problem.

Investigated whether `contrast` could reliably distinguish "genuinely washed-out/glare" from
"legitimately light-background but readable" within the 152 `too_bright`-flagged baseline images:
their contrast distribution (median 44.85, range 23.4–72.3) overlaps too heavily with the passing
population's (median 52.38) to support a new, confident sub-threshold rule without risking either
false-passing real glare or continuing to false-reject clean designs — the evidence isn't strong
enough to safely tighten or combine the check yet.

**Why no threshold change was made despite the clear false-reject:** this dataset's images are
flat digital renders, not photographs — they have none of a real camera photo's natural lighting
falloff/shadow/vignette, which is exactly what `maxBrightness=225` was originally tuned against
(via real on-device photography earlier this session). A genuine phone photo of a white card under
typical indoor lighting rarely averages above ~220-230 unless there's real glare, precisely because
of that natural shading a flat render doesn't have. Raising `maxBrightness` based on this dataset's
brightness distribution risks mis-calibrating the real pipeline against non-representative input.

**Recommended follow-up (not done here):** test the current threshold against real phone photos of
light/white-background physical cards on the connected device before adjusting `maxBrightness` or
combining it with `contrast`. Flagged as a remaining limitation below, not implemented speculatively.

`dark_moderate`/`dark_strong`/`contrast_reduced` degradations behaved as expected — pass rate drops
monotonically with severity, and darkening also reduces `contentCoverage` for the same reason blur
does (lower absolute luminance differences → weaker Laplacian response), which is realistic, not a
bug.

## Phase 8 — Framing/orientation — **real bug found and fixed**

The production capture pipeline (`analyzeImageQuality()` → `ImageManipulator.manipulateAsync(uri,
[{resize:{width: analysisWidth}}])`) always resized by **width**, regardless of orientation. For a
portrait-oriented photo (taller than wide), that fits the image against its *short* edge instead of
its long edge.

**Concretely, on this dataset's cards (804×444 landscape → 444×804 when simulated as portrait via
a 90° rotation):**

| | Landscape (resize by width) | Portrait (resize by width, the bug) |
|---|---|---|
| Analysis size | 480×265 | 480×**869** |
| Scale factor from source | 0.60x (downscale) | 1.08x (**upscale**) |
| Pixel count | 127,200 | 417,120 (**3.3x more**) |

This skewed `contentCoverage` low enough to false-reject otherwise-fine portrait photos as
`incomplete_card`: the 90°-portrait-simulated variant of the 90-image subset passed only **24.4%**
of the time (vs. 75.4% baseline), dominated by `incomplete_card` (65/90).

### Fix

`resizeActionForAnalysis(width, height, target)` added to `src/services/imageQuality/
qualityCheck.ts` — a pure, unit-tested function that always constrains the **longer** edge to
`target`, regardless of orientation. `analyzeImageQuality()` now accepts the camera capture's own
`{width, height}` (always available on `CameraCapturedPicture`, no extra decode needed) and uses it
to pick the correct resize dimension; falls back to the original width-only behavior only if
dimensions aren't supplied. Call site updated in `src/screens/ScannerScreen.tsx` to pass
`photo.width`/`photo.height`. The QA harness (`scripts/qa/decode_stream.py`) was updated to mirror
the same logic, for consistent future benchmarking.

### Before/after (same 90-image portrait-simulated subset)

| | Pass rate | `incomplete_card` count | Example `contentCoverage` (img2206) |
|---|---|---|---|
| Before fix | 24.4% (22/90) | 65/90 | 0.1489 |
| After fix | **50.0% (45/90)** | 34/90 | **0.2254** (+51%) |

Overall degraded-set pass rate also improved (849/1980 → 872/1980) with zero regressions in any
other transform category (verified by re-running the full 1980-variant benchmark after the fix).
The remaining ~50% rejection rate for a full 90°-sideways card is expected — most capture flows
assume a roughly-upright photo, and a fully sideways card is a genuine edge case beyond pure
resize-dimension handling; the fix specifically closes the *resize-asymmetry* bug, not every
possible orientation challenge.

### Tests added

`tests/imageQuality/qualityCheck.test.ts` — 4 new tests for `resizeActionForAnalysis` (landscape,
portrait, square, and the exact motivating case with explicit assertions that neither orientation
ever constrains its short edge).

## Phase 14 — Performance

Timed the real `computePixelMetrics()` in isolation (script: `scripts/qa/perf.ts`), pure in-memory,
no I/O:

| Input | Resolution | Median time |
|---|---|---|
| Landscape @ analysisWidth=480 | 480×265 (0.13MP) | 2.80ms |
| Portrait @ analysisWidth=480 (post-fix) | 480×869 (0.42MP) | 8.90ms |
| Small thumbnail | 240×133 (0.03MP) | 0.71ms |
| Un-downscaled full capture | 3072×4096 (12.6MP) | 392.51ms |

The ~3x higher pixel count for portrait images after the fix costs an extra ~6ms — negligible in
absolute terms (well under a frame budget), no performance concern. The 392ms figure for a
full-resolution capture confirms why the existing architecture already downscales to `analysisWidth`
before running quality analysis rather than analyzing the original — that design was already
correct and required no change. The original captured image is never touched by this analysis path
(a separate downscaled temp copy is created via `ImageManipulator`), so storage quality is
unaffected either way.

## Phase 15 — QA harness

Built as `scripts/qa/`: `inventory.py`, `select-subset.py`, `degrade.py`, `decode_stream.py`,
`benchmark-quality.ts`, `analyze-degraded.py`, `perf.ts`. Developer-only, not referenced from any
production code path or shipped UI. Reusable for future dataset calibration passes (point
`DATASET_DIR`/`SUBSET_LIST` at a new source and re-run).

## Generalized fixes only (Phase 16)

The one code change made (`resizeActionForAnalysis`) is a pure function of width/height/target —
no Kaggle filenames, card designs, or company names are referenced anywhere in the fix or its
tests. The brightness/contrast finding was deliberately left as documentation rather than a
speculative fix, per the same principle — changing a threshold based on non-representative
synthetic data would itself have been a form of overfitting to this dataset.

## Automated tests (Phase 17)

- **Before this pass:** 93/93 Jest passing.
- **After this pass:** **97/97 Jest passing** (4 new: `resizeActionForAnalysis` regression suite).
- `npx tsc --noEmit`: clean, zero errors.

## Device retest (Phase 18)

Code changed (`qualityCheck.ts`, `ScannerScreen.tsx`) — JS/TS only, no native code. See the device
retest results reported alongside this document for the physical-camera verification (light card,
dark card, portrait card, dense-text card, small-text card, multiple-number card).

## Remaining limitations / risks

- **Brightness/contrast false-reject (img86-class designs) is real and unresolved.** Documented
  above with reasoning for not acting on it from this dataset alone; recommended follow-up is
  real-device photography of light-background cards before any threshold change.
- **No native portrait examples in this dataset** — portrait testing relied on a synthetic 90°
  rotation, which validates the resize-dimension fix but can't exercise every real-world portrait
  capture scenario (e.g. natural hand-shake, varying card-to-frame ratios in a genuine portrait
  photo).
- **This dataset cannot validate OCR/extraction/phone-format/address-format/category-dictionary
  behavior** (Phases 9-13 of the original plan) — it contains no real card data, only placeholder
  text. That validation continues to rest on real physical cards and the existing extraction test
  suite.
- **Dataset license was not confirmed** (Kaggle page is client-rendered, couldn't be queried
  without authentication) — fine for this local-only QA use, but verify before any broader
  redistribution.
