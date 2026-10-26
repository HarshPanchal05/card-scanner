# Architecture

Industrial Card Scanner is an **offline-first** Android app built with Expo (React Native +
TypeScript). Every feature required to scan, extract, store, browse, and export business cards
works with the device in airplane mode. Nothing in the primary pipeline calls the network.

## High-level pipeline

```
Camera (expo-camera)
  → Image-quality check (jpeg-js decode + Laplacian/brightness/contrast analysis, in JS)
  → Original photo saved to app-private storage (expo-file-system)
  → OCR (Google ML Kit Text Recognition v2, on-device, via @react-native-ml-kit/text-recognition)
  → Extraction pipeline (regex + heuristics + keyword dictionary, pure TypeScript)
  → Review screen (user edits/confirms)
  → SQLite (expo-sqlite) — companies / representatives / phones / emails / categories / cards
  → Card Library / Reports (xlsx) / Save to Contacts (expo-contacts, explicit user action only)
```

No stage requires connectivity. See `docs/OCR.md` for the OCR/extraction engine decision and
`docs/STORAGE.md` for the on-disk layout.

## Module layout

```
src/
  types/           Domain models (models.ts), OCR/extraction types, navigation param lists
  constants/       Config thresholds, category dictionary, designation/geography gazetteers, theme
  database/        SQLite schema + migrations (schema.ts), connection singleton (db.ts),
                   backup dump/restore helpers (backupIO.ts)
  repositories/    One file per aggregate (events, categories, companies, representatives,
                   cards) plus leadRepository.ts, which is the single write path that turns a
                   reviewed extraction into company + representative + phone/email + category
                   rows and links them to a card
  services/
    imageQuality/  Pure pixel analysis (pixelAnalysis.ts) + threshold evaluation (qualityCheck.ts)
    ocr/           ML Kit wrapper with timeout + graceful-unavailable handling
    extraction/    normalize → phone/email/website/name/company/designation/address/category,
                   composed by pipeline.ts
    contacts/      Android Contacts integration (permission requested only on explicit action)
    reports/       Excel generation (excelService.ts) + Android share sheet (sharingService.ts)
    backup/        Zip export/import of the full database + all card images
    duplicates/    Read-only duplicate lookup (phone/email/company-name), never auto-merges
    storage/       App-private folder tree + original/thumbnail image persistence
  state/           zustand store for the active event + one-time app bootstrap
  navigation/      React Navigation (bottom tabs + native stack)
  screens/         One screen component per app screen
  components/      Shared UI (buttons, camera guide overlay, image viewer, pickers, modals)
tests/             Jest unit tests for every pure-logic module (extraction, image quality math,
                   text normalization)
```

## Why these building blocks

- **Expo + development build, not Expo Go.** ML Kit text recognition is a native module; Expo Go
  cannot load it. The app is built with `expo prebuild` + EAS Build (or `expo run:android`
  locally), which is exactly the "Expo development build/custom native modules" path called for
  in the brief.
- **React Navigation instead of expo-router.** expo-router pulls in a set of web-only
  `@expo/ui`/Radix/`vaul` packages purely to support its (unused, Android-only app) web routing
  surface, and those packages had peer-dependency conflicts with React 19 during install. A plain
  bottom-tabs + native-stack setup is simpler, has no web surface to carry, and is just as fast to
  navigate for this app's shape (4 tabs + a handful of stacked flows).
- **RN's built-in `Animated` + gesture-handler instead of react-native-reanimated**, for the same
  reason: reanimated v4's worklets engine is one more moving part in the native build that this
  app's needs (a pinch-zoom image viewer) don't require. `Animated.event` wired to
  `PinchGestureHandler`/`PanGestureHandler` is sufficient and battle-tested.
- **jpeg-js for image-quality analysis instead of a native CV library.** Decoding a downscaled
  (480px-wide) JPEG in pure JS and running a Laplacian-variance pass takes well under a second on
  a mid-range device and needs no native module, keeping the "fast to build, hard to break"
  property of the rest of the pipeline. See `docs/OCR.md` for the fuller trade-off discussion,
  including what a native OpenCV-based approach would buy and why it wasn't judged worth the
  added build complexity for v1.
- **Card images live in app-private document storage (`Paths.document`), not the public Photos
  gallery.** Business cards are sensitive company data (brief §30); keeping them out of
  `MediaStore` avoids `READ_MEDIA_IMAGES`/`READ_EXTERNAL_STORAGE` permissions entirely and matches
  modern Android scoped-storage guidance. Getting data off the device is an explicit, user-invoked
  action (Backup export or Excel report + Share), not an automatic gallery write.
- **No local LLM.** See `docs/OCR.md` — the layered regex/heuristic/dictionary pipeline was
  measured against the requirement (structured fields, multiple phones, multi-representative
  companies, category tagging) and covers it without needing a model on the critical path. The
  architecture keeps `services/extraction/` cleanly separable so a local model could be added
  later as an additional confidence-boosting pass without changing the pipeline's contract
  (`ExtractionResult` in, same shape out).

## Data model

See `src/database/schema.ts` for the authoritative schema. In short:

```
events 1─* cards *─1 companies 1─* representatives 1─* phone_numbers
                        │                    └──────* emails
                        └─* company_categories *─ categories
cards 1─* card_images (front/back)
```

A card always belongs to exactly one event and (once saved) links to exactly one company and one
representative — but a company can have many representatives (§12 of the brief) and a
representative can have many phone numbers and emails. `cards.extraction_json` /
`cards.raw_ocr_text` retain the original OCR output and pipeline result even after the user edits
fields on the Review screen, so a card can be reprocessed or audited later.

## State management

A single `zustand` store (`src/state/eventStore.ts`) holds the active event and drives one-time
app bootstrap (`state/appInit.ts`): run DB migrations, seed the category master list, create the
on-device folder tree, and guarantee at least one event exists. Everything else is local component
state plus direct repository calls — there's no global cache/store for cards, because the Card
Library and Reports screens query SQLite directly with filters/pagination, which is both simpler
and avoids ever holding thousands of scanned cards in memory at once (§28 performance
requirement).

## Offline guarantee, concretely

| Feature | Network required? |
|---|---|
| Camera capture + quality check | No |
| OCR | No (on-device ML Kit) |
| Field extraction | No (regex/heuristics/dictionary) |
| Save lead to SQLite | No |
| Search/browse Card Library | No |
| Save to Android Contacts | No |
| Generate Excel report | No |
| Backup export/restore | No |
| Share a report or backup file | Only the receiving app (WhatsApp, Drive, email…) needs
network — generating and queuing the share is fully local |
