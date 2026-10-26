# Testing

## Automated tests

`npm test` runs the Jest suite (`jest-expo` preset, TypeScript via `babel-preset-expo`). All 44
tests cover the pure-logic layers that don't require a running device — extraction, image-quality
math, and text normalization:

```
tests/
  extraction/
    phoneExtractor.test.ts        multiple numbers, dedup across sides, PIN-code false-positive guard
    emailExtractor.test.ts        multiple emails, case handling, OCR punctuation noise
    websiteExtractor.test.ts      www.-prefixed vs bare domain, avoids matching an email's domain
    nameCompanyExtractor.test.ts  company/person/designation/department on varied layouts
    addressExtractor.test.ts      city/state/country/PIN detection, graceful empty case
    categoryExtractor.test.ts     keyword-dictionary classification and ranking
    pipeline.test.ts              end-to-end: realistic card, front+back merge, empty input, no-phone card
  imageQuality/
    pixelAnalysis.test.ts         Laplacian variance on synthetic flat vs. checkerboard images,
                                   brightness/contrast on known pixel data
    qualityCheck.test.ts          threshold evaluation, correct issue + message per failure mode,
                                   multiple simultaneous issues
  utils/
    textNormalize.test.ts         company/person/phone/email normalization for duplicate matching
```

### Why database, storage, contacts, and Excel/backup services aren't unit-tested here

Those modules (`repositories/*`, `services/storage`, `services/contacts`, `services/reports`,
`services/backup`) call real native modules (`expo-sqlite`, `expo-file-system`,
`expo-contacts`, `expo-image-manipulator`) that don't have meaningful behavior under plain Jest
without deep mocking that would mostly test the mocks rather than the app. They're covered by the
manual device checklist below instead, which exercises them against the real native
implementations — a more trustworthy signal for this kind of I/O-heavy code than a mocked unit
test would be. If this app grows a CI pipeline with an Android emulator, promoting these to
Detox/Maestro instrumented tests would be the next step.

## Manual test checklist (run on a real Android device via a development build)

### Capture & quality detection
- [ ] Clean, well-lit card → accepted immediately, "Image quality looks good"
- [ ] Deliberately blurry (camera shake) capture → rejected with the blur message, retake works
- [ ] Very dark room → rejected with "too dark" message
- [ ] Strong glare/reflection on a glossy card → rejected with "too much glare" message
- [ ] Card rotated ~30° in frame → still extracts correctly if legible; quality gate is about
      blur/exposure/completeness, not rotation, so this exercises the extraction heuristics'
      layout-agnostic behavior rather than the quality gate itself
- [ ] Card only partially inside the guide frame → rejected as incomplete

### Card content variations
- [ ] Card with zero phone numbers → saves fine, phone list empty, no crash
- [ ] Card with 3+ phone numbers of different kinds (mobile/office/fax) → all captured, correctly
      kinded where labeled
- [ ] Card with multiple email addresses → all captured
- [ ] One-sided card (user selects "No, continue") → single-image card, OCR from front only
- [ ] Two-sided card (user selects "Yes, scan back") → both images stored, OCR text combined,
      still exactly one card record (not two)
- [ ] Two different representatives from the same company, scanned as separate cards → company is
      reused/merged (via the duplicate-detection prompt), two representative rows, not one
      overwritten by the other
- [ ] Logo-heavy card with lots of decorative graphic elements and little text → doesn't crash;
      degrades gracefully to fewer extracted fields
- [ ] Very small print → OCR/extraction quality degrades gracefully; user can still correct fields
      manually on the Review screen
- [ ] Non-English card → ML Kit is currently configured for the Latin script; non-Latin scripts
      will under-extract (see README "Known Limitations") but must not crash the app

### Offline & resource conditions
- [ ] Full flow (scan → OCR → save → contacts → report) with the device in Airplane Mode
- [ ] Low device storage → capture/save fails with a clear message, doesn't corrupt existing data
- [ ] Contacts permission denied → "Save to Contacts" shows the permission message, doesn't crash,
      card is still saved as a lead regardless
- [ ] Camera permission denied → Scanner screen shows the "Grant Camera Access" prompt instead of
      a blank/crashed screen

### Data & reporting
- [ ] Excel report generation with a few hundred cards completes and opens correctly in a
      spreadsheet app
- [ ] Excel sharing via the Android share sheet (e.g. to Gmail/Drive/WhatsApp)
- [ ] Report filtering by event/category/date range narrows the output correctly
- [ ] Backup export → uninstall/reinstall (or clear app data) → restore → all cards, companies,
      representatives, and photos come back
- [ ] App restart after scanning several cards → all data persisted correctly (SQLite + files)
- [ ] Scanning a few hundred cards in one sitting → Card Library stays responsive (pagination),
      dashboard stats stay accurate

## Development-build requirement

None of the manual checklist can be run in Expo Go — OCR, SQLite, and Contacts are all native
modules. Build and install a development client first:

```
npx expo prebuild --platform android
npx expo run:android
```
