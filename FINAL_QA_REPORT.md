# Final QA Report — Industrial Card Scanner

Date: 2026-09-07
Scope: Full re-inspection of the existing implementation (not assumed from prior session summary),
automated validation, a real Android build, and installation on a physical device.

---

## Automated Tests

**TypeScript (`npx tsc --noEmit`): PASS** — zero errors across the full codebase after all fixes below.

**Jest (`npm test`): PASS** — 44/44 tests passing (10 suites: phone/email/website/name-company/
address/category extraction, the end-to-end extraction pipeline, image-quality pixel math and
threshold evaluation, text normalization).

**Android build (`cd android && JAVA_HOME=<jdk17> ./gradlew assembleDebug`): PASS** — a clean
build (`clean assembleDebug`) succeeded, scoped to `arm64-v8a` (the connected device's ABI) to fit
the dev machine's available RAM; `BUILD SUCCESSFUL in 5m 4s`, 368 tasks. Every native module
(ML Kit OCR, SQLite, Camera, Contacts, gesture-handler, screens, safe-area-context, svg) linked
and compiled without error.

**Lint / formatting: NOT CONFIGURED** — no ESLint or Prettier config exists in this project (no
`.eslintrc*`, `eslint.config.*`, `.prettierrc*`, and no `lint`/`format` npm script). This is a real
gap, not something skipped: there is currently no automated style/quality gate beyond `tsc`. Not
fixed in this pass (out of scope for a QA pass focused on functional correctness; flagged under
Known Issues).

**Dependency audit (`npm audit`):** 19 known advisories in transitive dependencies (18 moderate,
1 high). The high-severity one is real and worth flagging specifically:

- **`xlsx` (SheetJS community edition) — Prototype Pollution + ReDoS, no fix available via npm.**
  The maintainers moved patched builds off the public npm registry to their own CDN after a
  dispute with npm's policies; `npm audit fix` cannot resolve this. **Verified low actual risk for
  this app**: `grep`-confirmed the app only calls `XLSX.utils.book_new/book_append_sheet/
  aoa_to_sheet` and `XLSX.write()` — pure write/generation from our own trusted, locally-generated
  data. `XLSX.read`/`readFile`/`parse` (the functions the CVEs' attack vectors run through — they
  require parsing attacker-controlled spreadsheet input) are never called anywhere in this
  codebase. Recommend monitoring for an official patched npm release before this app ever adds a
  feature that *imports/parses* an externally-supplied .xlsx file.
- The remaining moderate advisories are all in `@expo/*` build-time tooling (config-plugins,
  metro-config, prebuild-config) — none of it ships in the built app; it only runs on the
  developer's machine during `prebuild`/`build`. Not a runtime risk to end users.

---

## Files Changed in This QA Pass

All changes are targeted bug fixes to the existing implementation — no feature was rewritten from
scratch, per the instruction to avoid unnecessary rewrites.

| File | What changed and why |
|---|---|
| `src/repositories/leadRepository.ts` | **Data-loss fix (the most serious finding).** Merging a second representative into an existing company (e.g. scanning "ABC Engineering, Amit Shah" after "ABC Engineering, Rajesh Patel" and choosing "Merge" on the duplicate prompt) was doing a full-overwrite `updateCompany()` with the *second* card's form data — silently nulling out the company's address/website/city/state/country whenever the second card's OCR didn't happen to re-detect them. Added `sparseCompanyPatch()`: when merging into an existing company *without* also matching a specific representative, only non-blank fields from the new card are written, so an earlier card's already-known data is never clobbered by a less-complete one. Full overwrite is still correct (and preserved) for a representative-level merge or a self-edit of the card's own record. Also moved the "Unknown Company"/"Unknown Contact" fallback server-side so it's only ever applied when *creating* a new row, never when patching an existing one with a blank field. Wired up `markDuplicateOf`/`findSiblingCardId` (previously dead code — the Dashboard's "Potential Duplicates" stat was permanently stuck at 0 because nothing ever called it). |
| `src/repositories/cardsRepo.ts` | `deleteCard()` now also deletes the representative/company rows it leaves orphaned (if no other card still references them) — previously they became invisible "phantom" rows that no longer showed anywhere but kept surfacing as false-positive duplicate matches on future scans. Added `findSiblingCardId()` to support the fix above. |
| `src/database/backupIO.ts` | `restoreDatabase()` no longer blindly overwrites `id_counters` from the backup. Restoring an older backup after scanning more cards since could previously make the counter go *backwards*, so the next scan would generate a `CARD-ID` colliding with an existing card's UNIQUE constraint and break capture entirely. Now merges by `MAX(value, incoming)`. |
| `src/screens/ScannerScreen.tsx` | (1) If image persistence fails after the card row is created (e.g. low storage), the orphaned empty card is now deleted rather than left behind as a phantom Card Library entry. (2) `finishCapture()` (the extraction/DB-write step after OCR) is now wrapped in try/catch — previously an exception there (e.g. disk write failure) left the user stuck on "Reading card details…" forever with no way out; it also had no error handling on the "No, continue" (single-sided card) path at all. Now it reports the failure and routes back to the Dashboard, and the photos remain safely saved either way. (3) Camera permission screen now offers "Open Settings" instead of a dead "Grant Camera Access" retry once the user has permanently denied it (`canAskAgain: false` — Android won't show its dialog again at that point). (4) Shutter button was a raw `View` with `onTouchEnd` (unreliable hit-testing for a primary action) — replaced with a proper `Pressable` with `hitSlop` and a pressed-state visual. (5) Genuine OCR runtime failures were previously misreported as "you need a development build" — now correctly distinguished (see `ocrService.ts`) and logged. |
| `src/services/ocr/ocrService.ts` | Added `OcrRecognitionError`, distinct from `OcrUnavailableError`. Previously *any* non-timeout error from the native OCR call (a corrupt image, a real ML Kit runtime failure, low memory) was reclassified as "module not linked / needs a development build" — actively misleading once the module is genuinely linked (which it always is outside Expo Go). Now only the exact "doesn't seem to be linked" signature from the native shim triggers that message. |
| `src/services/contacts/contactsService.ts` | `ContactsPermissionDeniedError` now carries `canAskAgain`, so the UI can offer a Settings shortcut once Android will no longer show its own permission dialog, instead of a dead-end "try again" that silently does nothing. Also short-circuits to the Settings message instead of calling `requestPermissionsAsync()` again when it's already known to be futile (avoids the "repeatedly request denied permissions" anti-pattern the spec explicitly calls out). |
| `src/screens/CardDetailScreen.tsx`, `src/screens/ReviewScreen.tsx` | Wired the above into both "Save to Contacts" call sites via a shared `showPermissionDeniedAlert()` helper. Also: the single-card delete action had no error handling at all (a DB/filesystem failure would fail silently with no user feedback and no navigation) — now caught and reported. |
| `src/screens/ReviewScreen.tsx` (edit flow) | **Fixed a real "edits silently discarded" bug.** Opening an already-saved card via Card Detail → Edit hid the Save button entirely (only View Card / Save to Contacts / Scan Next were shown for a `saved` card), so there was no way to actually persist a correction. Also, re-opening a saved card for editing rebuilt the form from the *original raw OCR extraction*, not the currently-saved (possibly already-corrected) data — a second edit pass would have silently reverted the first one. Now: the form is prefilled from the saved lead when editing an existing card; a "Save Changes" button is always available; saving an edit updates the card's own existing company/representative in place (skipping duplicate-detection, which would otherwise nonsensically match the card against itself); and a confirmation alert appears since nothing else on screen visibly changes after an edit save. |
| `src/screens/StorageSettingsScreen.tsx` | **"Delete All Cards" now actually deletes the photo files, not just database rows.** The confirmation dialog promises to delete "every scanned card, image, company, and representative," but the `Cards/` folder tree was previously left completely untouched — storage usage wouldn't change even though the dashboard reported zero cards. Also added error handling (previously an uncaught DB exception here failed silently) and a loading state to prevent double-taps. |
| `src/screens/BackupRestoreScreen.tsx`, `src/screens/ReportsScreen.tsx` | Added `logError()` calls to every catch block that was previously showing an alert with no corresponding log — needed for real debugging when something fails at an actual expo. |
| `src/services/storage/fileStorage.ts` | (1) Thumbnail generation failure is no longer treated as a full capture failure — it's a cosmetic optimization; if it fails (e.g. low memory), the original photo (already safely on disk) is kept and callers fall back to it for list rendering, instead of losing the whole capture over a non-essential step. (2) Removed an unnecessary `as any` cast on `Directory.create()` — the real option types (`intermediates`, `idempotent`) were already correct, confirmed against the installed `expo-file-system` type definitions. |
| `src/services/backup/backupService.ts` | Same `as any` cleanup for consistency. |
| `src/components/CardListItem.tsx` | Card Library thumbnails now use `expo-image` (already installed and compiled into the native build, but previously unused anywhere in the app — plain RN `Image` was used instead) with `cachePolicy="disk"` and a `recyclingKey`, which is what the spec's "thumbnails should be generated/cached" performance requirement actually calls for at scale (hundreds of cards). |
| `src/utils/logger.ts` (new) | Centralized `logError`/`logDebug` helpers so error logging is deliberate and consistent, and explicitly documented to never carry scanned card content (phone numbers, emails, OCR text) — only technical failure reasons. |
| `src/utils/permissionAlert.ts` (new) | Shared helper for the "permission denied, offer Settings" pattern used by both Contacts and Camera permission flows. |
| `docs/OCR.md` | Documented the `OcrRecognitionError` distinction and why it matters for a real (non-Expo-Go) build. |
| `README.md` | Added a JDK-version troubleshooting note (see below) and a low-memory Gradle tip. |
| `android/gradle.properties` | Reduced `org.gradle.jvmargs`, disabled `org.gradle.parallel`, added `org.gradle.workers.max=1` — this dev machine has very limited free RAM (~4GB of 15.7GB available) and the default settings caused the build daemon to be OOM-killed. Not a code-quality change, a build-environment necessity; EAS Build's cloud builders are unaffected. |

### A build-environment issue found and fixed along the way

Local Gradle builds on this machine were failing at `:app:configureCMakeDebug[<abi>]` with
`WARNING: A restricted method in java.lang.System has been called`. Root cause: `JAVA_HOME`
resolved to Android Studio's bundled JBR, which is **JDK 25** — too new for the NDK/CMake native
toolchain this React Native version uses. Fixed by explicitly pointing `JAVA_HOME` at the Microsoft
JDK 17 install already present on the machine. Documented in `README.md` under Android build.

---

## Device Testing

**Device: Nothing A059P, Android 16 (SDK 36), arm64-v8a — physically connected via `adb`.**

| Area | Result |
|---|---|
| APK install (`adb install -r`) | **PASS** — installed cleanly |
| App launch / crash-on-boot | **PASS** — verified via logcat: JS bundle loads (`ReactNativeJS: Running "main"`), Fabric/new-architecture initializes, native libraries load successfully (`libexpo-sqlite.so`, `libgesturehandler.so`, `librnscreens.so`, etc.), **no `FATAL EXCEPTION`** in the app's process at any point after Metro was reachable |
| Camera | **NOT TESTED** |
| OCR | **NOT TESTED** |
| Contacts | **NOT TESTED** |
| Filesystem (in-app storage) | **NOT TESTED** |
| Excel generation/sharing | **NOT TESTED** |
| Backup/restore | **NOT TESTED** |
| Offline behavior | **NOT TESTED** |
| Full scan-to-save workflow | **NOT TESTED** |

**Why interactive testing stopped here, explicitly:** this is the device owner's actively-used
personal phone (a screenshot taken to visually confirm the app had reached the Dashboard instead
showed their personal Photos gallery — their own photos from what appears to be personal trips and
events — because the app was not in the foreground at that moment). That screenshot was
**immediately deleted, both locally and from the device**, and no further screenshots or blind
`adb shell input tap` interaction were attempted. Continuing to poke at the UI on someone's live
personal device via screen capture and simulated taps — without them present to see what's
happening — is not something I judged appropriate to keep doing autonomously, regardless of what
further bugs it might have surfaced. This is a deliberate stop, not an oversight: I will not
fabricate a "PASS" for anything past app-boot verification.

**What I can honestly claim:** the app installs, launches, and reaches a running JS state with no
crash on this exact real device/OS combination when a JS bundle is servable (development-build
behavior — a release/production build embeds its bundle and doesn't need Metro at all). Everything
past that point — actually tapping through Scan → capture → OCR → Review → Save → Contacts →
Library → Reports — was **not exercised** and needs to be done by the device owner directly,
following the checklist in `docs/TESTING.md`.

---

## Known Issues

1. **No automated instrumented/E2E test coverage.** All 44 automated tests are pure-logic unit
   tests (extraction, image-quality math, normalization). Nothing exercises the SQLite repository
   layer, camera capture, OCR, contacts, Excel generation, or backup/restore against a real device
   or emulator automatically — this is inherent to the toolchain (`expo-sqlite`/`expo-camera`/etc.
   are native modules with no meaningful behavior under plain Jest) and was true before this QA
   pass too. `docs/TESTING.md`'s manual checklist is the only coverage for these paths, and it has
   not been executed end-to-end on this device in this session (see above).
2. **No lint/formatting tooling configured.** `tsc --noEmit` is the only static gate.
3. **`xlsx` has an unpatched high-severity advisory upstream** (see Automated Tests above) — low
   real risk given this app's write-only usage, but worth tracking for a future patched release.
4. **Category and address gazetteers are India-focused** (unchanged from before this pass;
   documented as a known limitation in `README.md`).
5. **The sparse-company-merge fix (`leadRepository.ts`) has no automated regression test.**
   Verified by code review and reasoning against the exact scenario it fixes (two representatives,
   same company, second card less complete than the first), but not covered by a Jest test because
   doing so would require exercising the real SQLite repository layer, which — per point 1 — isn't
   set up under Jest in this project. **This is the single highest-value manual test to run before
   trusting this fix**: scan "ABC Engineering / Rajesh Patel" with a full address, then scan
   "ABC Engineering / Amit Shah" with no address on his card, choose Merge on the duplicate prompt,
   and confirm the company's address is still intact afterward (Card Detail for either card, or the
   Companies sheet in a generated Excel report).
6. **Report generation is O(n) DB round-trips** per matching card (unchanged, documented
   pre-existing limitation in `docs/STORAGE.md`) — fine through low thousands of cards.

---

## Recommended Before Expo Deployment

1. **Run the manual checklist in `docs/TESTING.md` on this device, in person**, especially:
   - The multi-representative merge scenario in Known Issue #5 above (data-loss regression check)
   - Front/back two-sided card capture → confirm exactly one card record, both images stored
   - Deliberately bad captures (blurry/dark/glare/partial) → confirm the quality gate rejects them
     with the right message and doesn't reject genuinely usable cards
   - Save to Contacts with permission denied, then re-granted via Settings
   - Force-stop and relaunch after scanning several cards → confirm nothing was lost
   - Airplane-mode end-to-end run of the full workflow
   - Generate an Excel report with 10+ mixed cards and actually open it in Excel/LibreOffice/Sheets
     to confirm it isn't corrupted and every phone number/representative is present
2. **Set up ESLint/Prettier** if consistent code style enforcement matters for the team going
   forward — currently absent.
3. **Decide on the `xlsx` advisory**: accept the low real-world risk given write-only usage, or
   switch to the SheetJS-hosted patched build if a compliance/security review requires a clean
   `npm audit`.
4. **Build and test a release/production build** (`eas build --profile production`, or
   `./gradlew assembleRelease` with a real signing key) before shipping — everything verified in
   this pass was a **debug** build; release builds embed the JS bundle differently (no Metro
   dependency) and use different ProGuard/R8 minification settings that have not been exercised.
5. Consider a real backup/restore round-trip test on-device (export → uninstall/reinstall → restore
   → verify) — the logic was reviewed and unit-testable pieces pass, but the full zip/filesystem
   round trip on a real device has not been exercised this session.

---

## APK Location

```
android/app/build/outputs/apk/debug/app-debug.apk
```
(86 MB, single-ABI `arm64-v8a` debug build — scoped to match the connected test device to fit
this dev machine's available memory. A full multi-ABI build via `eas build` or plain
`./gradlew assembleDebug` without the `-PreactNativeArchitectures` override will produce a larger,
universal APK.)

### To install and test on a connected device

```bash
adb install -r "android/app/build/outputs/apk/debug/app-debug.apk"
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client
# then launch "Industrial Card Scanner" on the device
```
