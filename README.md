# Industrial Card Scanner

An **offline-first** Android app for scanning business/visiting cards at industrial
exhibitions/expos and turning them into structured, searchable leads — no internet connection
required for scanning, OCR, extraction, storage, contacts, or reporting.

Built with Expo (React Native + TypeScript), SQLite, on-device OCR (Google ML Kit), and a
regex/heuristic/dictionary-based extraction pipeline (no cloud API, no LLM on the critical path).

## Features

- **Guided card capture** with a live card-frame overlay and instant, on-device image-quality
  feedback (blur, brightness, contrast, framing) — bad photos are rejected before they're ever
  saved, with a specific reason and an immediate retake.
- **Front + back support** as a single card record, OCR text combined automatically.
- **Fully offline OCR** (Google ML Kit Text Recognition v2) and **structured field extraction**:
  company, representative, designation, department, multiple phone numbers (kinded:
  mobile/office/landline/fax/WhatsApp), multiple emails, website, address/city/state/country, and
  product/category tagging — from OCR text alone, no cloud call.
- **Multiple representatives per company** modeled properly in the database (not overwritten),
  with duplicate detection (by phone/email/company name) that always asks before merging.
- **Editable review screen** before anything is saved — OCR is a starting point, never the final
  word.
- **Explicit "Save to Contacts"** — nothing is ever written to Android Contacts automatically;
  permission is requested only when the user presses the button.
- **Card Library** with offline search (company/representative/phone/email) and
  event/category/date filters, paginated for datasets of hundreds-to-thousands of cards.
- **Excel reports** (Visitors / Companies / Summary sheets) generated entirely on-device and
  shared via the Android share sheet.
- **Event management** so cards scanned at different expos stay grouped and reportable
  separately.
- **Local backup/restore** — one zip file containing the full database and every card photo.
- **Storage management** — usage breakdown, temp-file cleanup, per-card and bulk delete.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, TypeScript (strict) |
| Navigation | React Navigation (bottom tabs + native stack) |
| Database | expo-sqlite (WAL mode), hand-written schema + migrations |
| Camera | expo-camera |
| OCR | Google ML Kit Text Recognition v2 (`@react-native-ml-kit/text-recognition`) — see `docs/OCR.md` |
| Image-quality analysis | Pure JS: `jpeg-js` decode + Laplacian-variance sharpness check |
| Contacts | expo-contacts |
| Excel | `xlsx` (SheetJS community edition) |
| Sharing | expo-sharing |
| Backup archives | `jszip` |
| File storage | expo-file-system (new `File`/`Directory` API), app-private document storage |
| State | zustand (one small store for the active event + bootstrap) |

Full reasoning for each non-obvious choice is in `docs/ARCHITECTURE.md` and `docs/OCR.md`.

## Setup

Requires Node 20+, a JDK 17, and the Android SDK (via Android Studio). Verified against Node 24,
npm 11, Java 17 (Microsoft build), Android SDK platforms 36/37, build-tools 36.0.0.

```bash
npm install
```

## Development

This app uses native modules (ML Kit OCR, SQLite, Camera, Contacts) that **do not run in Expo
Go**. Use a development build:

```bash
npx expo prebuild --platform android   # generates ./android (gitignored — regenerated as needed)
npx expo run:android                   # builds and installs a development client on a
                                        # connected device/emulator, then starts Metro
```

After the first `run:android`, you can iterate with `npx expo start --dev-client` and reload the
JS bundle without a full native rebuild — a native rebuild is only needed again if you add/change
a native dependency or `app.json` plugin config.

Run the unit test suite (extraction pipeline, image-quality math, text normalization):

```bash
npm test
```

## Android build (APK/AAB)

Via EAS Build (`eas.json` defines `development`/`preview`/`production` profiles):

```bash
eas build --platform android --profile preview       # internal-distribution APK
eas build --platform android --profile production    # Play-ready AAB
```

Or fully locally, once `npx expo prebuild` has generated `./android`:

```bash
cd android
./gradlew assembleDebug     # or assembleRelease with a configured signing key
```

This has been verified end-to-end on a real machine: `assembleDebug` completes successfully and
produces an installable `app-debug.apk` with every native module linked (ML Kit OCR, SQLite,
Camera, Contacts, gesture-handler, screens, safe-area-context, svg).

**JDK note:** if `./gradlew` fails at `:app:configureCMakeDebug[<abi>]` with
`WARNING: A restricted method in java.lang.System has been called`, Gradle picked up a JDK that's
too new (24+) for the NDK/CMake toolchain — this happens when `JAVA_HOME` points at Android
Studio's bundled JBR on a recent Studio install. Point `JAVA_HOME` at a JDK 17 install instead
(the one Expo/React Native 0.86 targets) before invoking `gradlew`:
```bash
JAVA_HOME="/path/to/jdk-17" ./gradlew assembleDebug
```
EAS Build's cloud builders already pin a compatible JDK, so this only matters for fully local
builds. On a memory-constrained dev machine, add `--max-workers=1` and lower
`org.gradle.jvmargs`/disable `org.gradle.parallel` in `android/gradle.properties` if the daemon
gets OOM-killed mid-build — the full native build (four ABIs, first run) needs a few GB of
headroom.

## Permissions

| Permission | Requested when | Why |
|---|---|---|
| Camera | First time the Scanner screen opens | Capturing card photos |
| Contacts (read/write) | Only when the user presses **Save to Contacts** on a specific card | Creating the Android contact for that representative |

No storage permission is requested — card photos, the database, reports, and backups all live in
the app's private document storage (see `docs/STORAGE.md` for why). No network permission is used
by the app's own code; the OS grants `INTERNET` by default but nothing in the scanning, storage,
OCR, extraction, contacts, or report-generation path makes a network call.

## Documentation

- `docs/ARCHITECTURE.md` — module layout, data flow, and the reasoning behind each architectural
  choice
- `docs/OCR.md` — OCR engine selection, why no local LLM was added, blur-detection method
- `docs/STORAGE.md` — on-disk folder layout, database schema notes, backup/restore format
- `docs/TESTING.md` — automated test coverage and the manual on-device test checklist

## Known limitations

- **OCR script is fixed to Latin.** `TextRecognitionScript.LATIN` covers English-language cards.
  Non-Latin cards (e.g. pure Devanagari/Chinese text) will under-extract rather than crash. Adding
  a per-event script setting or auto-detection is straightforward future work in
  `services/ocr/ocrService.ts`.
- **Address/category gazetteers are India-focused** (`constants/geography.ts`,
  `constants/categories.ts`), matching the target deployment context described in the brief.
  Both are plain data files, easy to extend or regionalize.
- **Report generation is O(n) DB round-trips** for the filtered card set (one `getCardWithDetails`
  call per card). Fine through the low thousands of cards; a batched single-query version would be
  the next optimization if reports over very large datasets become slow (see `docs/STORAGE.md`).
- **No "Open in spreadsheet app" as a separate action from Share.** The Android share sheet
  (`expo-sharing`) already covers both "open with a spreadsheet app" and "save to Drive/Files" in
  one flow, so a separate `Intent.ACTION_VIEW` implementation wasn't added for v1.
- **No local LLM.** By design — see `docs/OCR.md` for the reasoning and what would justify adding
  one later.

## Future improvements

- Auto-detect card script/language and switch ML Kit's recognition script accordingly.
- A native OpenCV-based card-edge/corner detector for stricter "is the whole card really in
  frame" validation beyond the current edge-density heuristic.
- Batched report queries for very large datasets.
- Optional local small-model pass to raise extraction confidence on ambiguous cards (see
  `docs/OCR.md` "If a local model is added later").
