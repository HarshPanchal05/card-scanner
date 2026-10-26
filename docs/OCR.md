# OCR & Extraction Engine

## Engine chosen: Google ML Kit Text Recognition v2 (Latin), via `@react-native-ml-kit/text-recognition`

### Options considered

| Option | Offline | Speed | Accuracy (printed Latin text) | RN/Expo integration | Package size | Verdict |
|---|---|---|---|---|---|---|
| **Google ML Kit Text Recognition v2** | Yes, fully on-device after Play Services first-use setup | Fast (~100-400ms/image on mid-range hardware) | Very good on printed business-card text | Small, well-maintained wrapper, standard native-module autolinking | Small — ships as a Play Services dependency, not bundled in the APK | **Chosen** |
| Tesseract (react-native-tesseract-ocr / similar) | Yes | Slower; needs a trained-data file (~10-30MB per language) bundled or downloaded | Noticeably worse on small/stylized card fonts without careful preprocessing | Wrappers are less actively maintained; several are abandoned | Large (trained data files) | Rejected — accuracy and maintenance risk on exactly the input (small, varied fonts) this app needs to handle well |
| PaddleOCR (via a custom native bridge) | Yes | Fast, good accuracy | Good, but requires bundling/converting models and writing a custom native bridge — no maintained RN wrapper exists | None — would require writing and maintaining a native module from scratch | Medium-large (model files) | Rejected for v1 — the integration cost (custom native module, model packaging, testing across Android versions) isn't justified when ML Kit already meets the accuracy bar |
| Cloud OCR (Google Vision API, AWS Textract, etc.) | **No** | Fast when online, unusable offline | Excellent | Simple REST call | N/A | Rejected outright — violates the core "offline-first, no cloud API for basic scanning" requirement (brief §3, §23) |

ML Kit Text Recognition v2 wins on the combination that matters most here: it's genuinely
on-device (no per-image network call), fast enough to keep the scan-next-card loop tight, accurate
on the printed/semi-stylized Latin text found on business cards, and has a small, actively
maintained RN wrapper that needs no custom native code to integrate — just standard Expo
prebuild/autolinking.

### Consequence: requires a development build, not Expo Go

`@react-native-ml-kit/text-recognition` is a native module. It is **not available in Expo Go**.
The app must be run via:

```
npx expo prebuild --platform android
npx expo run:android          # local development build
# or
eas build --profile development --platform android   # cloud development build
```

The app detects this at runtime: if the native module isn't linked, `recognizeCardSide()` throws
`OcrUnavailableError`, which the Scanner screen catches and surfaces as "On-device text
recognition unavailable — you can still fill in the card details manually" rather than crashing or
silently producing fake data. The card and its photos are still saved either way — OCR failure
never loses captured work (brief §29).

A second, distinct failure mode is `OcrRecognitionError` — a genuine on-device recognition failure
(a corrupt/unreadable image, an ML Kit runtime error, low memory) as opposed to the module simply
not being linked. `recognizeCardSide()` distinguishes the two by checking whether the caught error
matches the exact "doesn't seem to be linked" string the native module's JS shim throws when
unlinked; anything else is reported as a real recognition failure ("Couldn't read the card
clearly") rather than the misleading "you need a development build" message. This distinction
matters once the app ships as a real development/production build (where the module is always
linked) — without it, any transient OCR failure would incorrectly tell the user their build is
broken.

### Multilingual support

ML Kit Text Recognition v2 supports separate scripts (Latin, Chinese, Devanagari, Japanese,
Korean) via `TextRecognitionScript`. The app currently recognizes with `TextRecognitionScript.LATIN`,
which covers English-language business cards (the target use case). Swapping scripts per-event or
auto-detecting is a straightforward follow-up (see README "Known Limitations").

## Extraction: why no local LLM is required

The brief explicitly asks not to reach for a model just because one exists, and to first check
whether OCR + regex + heuristics + a category dictionary is sufficient. It is, for this problem:

- **Phone numbers, emails, websites** are highly regular, regex-matchable formats — an LLM adds
  latency and non-determinism for a problem regex already solves reliably (see
  `services/extraction/phoneExtractor.ts`, `emailExtractor.ts`, `websiteExtractor.ts` and their
  tests in `tests/extraction/`).
- **Company / person / designation / department** are identified with a scoring heuristic over
  OCR lines: legal-suffix keywords and ALL-CAPS/positional signals for company name, a designation
  keyword dictionary (`constants/designations.ts`), and a Title-Case name-shape check for the
  person's name, preferring the line adjacent to the detected designation. This is naturally
  layout-agnostic — it does not assume a fixed field position, which is what §8 ("completely
  different layouts") requires.
- **Address / city / state / country** use a small offline gazetteer (`constants/geography.ts`) —
  Indian states/major cities plus a 6-digit PIN code anchor — since the target deployment context
  is Indian industrial expos.
- **Product category** is offline keyword-dictionary classification
  (`services/extraction/categoryExtractor.ts`) against `constants/categories.ts`, scored by how
  many distinct keywords match, with the result always editable by the user and a guaranteed
  "Other" fallback so the field is never silently empty.

Every stage produces a confidence score (`ExtractionResult.confidence`), which the Review screen
uses to flag fields likely worth double-checking, without exposing raw ML/heuristic internals to
the end user.

### If a local model is added later

The pipeline's contract is a pure function: `runExtractionPipeline(rawOcrText) → ExtractionResult`.
A local small instruct model (e.g. a quantized Gemma/Phi/Qwen variant via an on-device runtime)
could be added as an optional additional pass that only *raises* confidence or fills gaps the
heuristics left blank — never as a replacement for the deterministic pipeline, and never on the
critical path for saving a card. Requirements for adding one, if it's ever justified by real
low-confidence-rate data: runs fully on-device, has a hard timeout, fails gracefully back to the
heuristic result, and never blocks Save Lead. None of that exists yet because the measured
heuristic coverage didn't warrant it for v1.

## Blur / image-quality detection

Not ML-based at all — a classic, fast computer-vision technique implemented in pure TypeScript:

1. Downscale the capture to ~480px wide (`expo-image-manipulator`).
2. Decode the JPEG in pure JS (`jpeg-js`) to get an RGBA pixel buffer — no native canvas needed on
   React Native.
3. Convert to grayscale and compute the **Laplacian variance** (a standard sharpness proxy: a
   sharp image has strong, varied edges → high variance; a blurry image is smooth → low variance).
4. Also compute mean brightness, luminance standard deviation (contrast), and an edge-density
   "content coverage" fraction (a rough proxy for "is the frame actually full of card content").
5. Compare all four against configurable thresholds (`constants/config.ts` →
   `IMAGE_QUALITY_CONFIG`) to produce a pass/fail verdict with a specific, actionable message
   ("Image is blurry...", "Too much glare detected...", "Card is not fully visible...").

This runs before the image is ever committed as the card's photo, so a bad capture is caught and
the user is prompted to retake immediately (brief §6) — OCR is never given a doomed input.
