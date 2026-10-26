# Industrial Card Scanner — Final Release Build

## FINAL RELEASE BUILD (2026-09-10, latest — incorporates the multi-representative extraction fix)

**BUILD STATUS: PASS**

This build incorporates the false-positive multi-representative extraction fix (department/
lab/product-line lines like "Hitachi Research Laboratory" or "Kappo Dining" no longer get
misclassified as extra fake representatives) made earlier in this session, plus its 12 new
regression tests. No other functionality was touched.

## 1. SOURCE STATUS

| Check | Result |
|---|---|
| `npm test` | **146/146 PASSING** (16 suites) |
| `npx tsc --noEmit` | **CLEAN** — zero errors |
| QA harness (`tests/qa`) | **19/19 PASSING**, 0 `falsePositiveMultiRep` findings across all 11 real sourced cards |
| Multi-representative fix present in source | Confirmed (`hasDepartmentKeyword`/`hasCompanySuffixKeyword` checks and the designation-adjacency collapse rule in `src/services/extraction/multiRepresentative.ts`) |
| Git | No commits made this session beyond the repo's pre-existing `80e2f81 Initial commit`; nothing pushed |

Verified before build (Phase 1) and re-verified after install (Phase 7) — identical results
both times, as expected since no source changed in between.

## 2. APK

| | |
|---|---|
| Path | `dist/Industrial-Card-Scanner-v1.0.0-final.apk` |
| Also produced at | `android/app/build/outputs/apk/release/app-release.apk` (Gradle's native output location; copied to the `dist/` path above) |
| Size | 63,028,231 bytes (~60.1 MB) |
| SHA-256 | `e1b7eb983abbdb21c0fe1f1fb6c80d49f7596458cc96d63e128e1f67ab8fa140` |
| Package / Application ID | `com.industrialexpo.cardscanner` |
| versionName / versionCode | 1.0.0 / 1 |
| minSdk / targetSdk | 24 / 36 |
| Native ABI | `arm64-v8a` only (matches the physical target device; same scoping as every prior build — x86_64/emulator support intentionally not added, per instructions) |
| Release / debuggable | **Release, non-debuggable** — confirmed via `aapt2 dump badging` (no `debuggable` flag present) |
| Standalone / Metro dependency | **Standalone, no Metro dependency** — `assets/index.android.bundle` (3,797,616 bytes) is embedded in the APK; 73 ML Kit OCR model/resource files bundled. Extracted-bundle string search found exactly 3 `localhost`/`__METRO` matches, all inert `__DEV__`-gated React Native framework internals (`__METRO_GLOBAL_PREFIX__` constant and the standard `http://localhost:8081/` dev-tooling string) — identical, byte-for-byte-equivalent finding to the prior release build's verification; none are reachable in a release build |

### Build environment

- Java: OpenJDK 17.0.20 (Microsoft build), forced via `JAVA_HOME="C:/Program Files/Microsoft/jdk-17.0.20.8-hotspot"` (Android Studio's bundled JBR on this machine is JDK 25, too new for the NDK/CMake toolchain — same known workaround as every prior build).
- Build command: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon` (identical to the prior release build's documented command, for reproducibility).
- `BUILD SUCCESSFUL in 8m 7s`, 473 tasks (23 executed, 450 up-to-date — only the JS bundle and a handful of app-module tasks needed re-running since only `src/` TypeScript changed; all native/dependency modules were cached).
- Free RAM at build start: ~1-2 GB (tighter than the prior build's 1.19 GB, but the build completed without OOM issues; `org.gradle.jvmargs=-Xmx1536m`, `org.gradle.parallel=false`, `org.gradle.workers.max=1` in `android/gradle.properties` — unchanged, already in place from earlier sessions — kept it stable).

## 3. USB DEVICE

| | |
|---|---|
| Device | Nothing A059P (`AsteroidsProIND`/`Asteroids`) |
| ADB serial | `001763595002230` |
| Connection | **USB** — confirmed via `adb devices -l` showing the bare serial (not an `ip:port` address). One transient `unauthorized` state was seen and resolved by you accepting the on-device USB-debugging prompt; wireless debugging was not used at any point despite being enabled on the phone. |

## 4. INSTALLATION

**Success.** `adb install -r` (preserves existing app data) completed with `Success`; app data
(4 saved cards, 2 companies) was retained after install, confirmed live on the Dashboard.

## 5. SMOKE TEST

| Flow | Result |
|---|---|
| A. Dashboard | **PASS** — launches, correct data (4 cards, 2 companies), no clipping observed, navigation confirmed working throughout the rest of the test |
| B. Scanner | **PASS** — camera opens, guide overlay visible, shutter works |
| Camera quality gate | **PASS** — capturing an unusable frame correctly triggered "Image is blurry. Please hold the phone steady and retake." |
| C. Real card (capture → review → save) | **NOT TESTED this session** — no physical card was available; you declined when asked. The extraction/parsing pipeline this exercises is already covered by 146 automated tests including 11 real sourced card images (0 false positives) |
| D. Multiple phone numbers | **NOT TESTED via physical camera this session** (same reason as C). Already verified live on-device from the existing saved card (Rahul Vora / Planet Automotive, 3 phone numbers, correctly typed and labeled) — re-confirmed present and intact in the Review screen during the Contacts check below. Also covered by the automated pipeline tests (e.g. the Indian +91 3-phone card, REAL-005) |
| E. Multi-representative | **NOT TESTED via physical camera this session** — no such physical card available. Per instructions, not fabricated. Covered by the automated regression suite: the Krish FURNITURE case (Shaileshbhai/9824921087, Niteshbhai/9374969212) passes both as a standalone unit test and as an end-to-end pipeline test against the real, previously-captured OCR text — see §6 |
| F. Contacts | **Action verified, but a no-op this time** — tapping the button showed a persisted "Contact Saved ✓" state (from the prior session's successful save-and-delete cycle) and did not create a new OS contact when tapped again (confirmed via `content query`: still no "Rahul Vora" contact on the device). This reflects the app tracking its own "already saved" flag rather than checking the live Contacts provider — a pre-existing characteristic unrelated to this release's code change, not a new regression. The underlying save mechanism itself (correct name/org/note/email/3 phones/address/website) was fully verified end-to-end with a real created-then-deleted contact in the immediately preceding session on this same install |
| G. Excel | **PASS** — "Excel report generated" appeared immediately; Share Report showed a real file in the system share sheet, `General_Scanning_2026-09-10T09-42-55-471Z.xlsx` (today's timestamp), confirming actual generation. Dismissed without sending |
| H. Persistence | **PASS** — force-stopped and relaunched; new process ID, all data intact (4 cards, 2 companies), no crash |
| I. Offline / no-Metro dependency | Verified at the APK level (§2) rather than by disconnecting network, to avoid risking the USB ADB session — confirms no active Metro/localhost dependency exists in the release bundle |

**Zero `FATAL EXCEPTION`, SQLite error, or ML Kit error** across the entire smoke-test logcat capture.

## 6. MULTI-REPRESENTATIVE

- **Automated result:** All 12 new regression tests pass (9 unit-level in `multiRepresentative.test.ts` covering organization/department/lab/product-line/generic-Title-Case scenarios, 3 end-to-end in `pipeline.test.ts`). QA harness confirms 0 `falsePositiveMultiRep` findings across 11 real sourced cards (previously 2 before the fix).
- **Krish FURNITURE result:** **PASSING**, re-confirmed explicitly by name this session (`npx jest -t "Krish"` → 2/2 pass). Company "Krish FURNITURE" splits into exactly 2 representatives — Shaileshbhai (9824921087) and Niteshbhai (9374969212) — with phones correctly, exclusively separated (no cross-contamination), no company-field overwrite, no duplicate representative, verified both as a standalone `detectMultipleRepresentatives` unit test and end-to-end via `runExtractionPipeline` against the real, previously-device-captured OCR text for this exact card.
- **Physical-device result:** Not independently re-tested this session (no multi-representative physical card was available; not fabricated, per instructions).

## 7. BUGS

**Found during this final phase:** None that block release. One observation (Contacts "already saved" state not reflecting the live OS contacts provider — see §5F) — pre-existing behavior, unrelated to this release's actual code change, not new, not fixed (out of scope: "only make a source-code change if the release build itself exposes a genuine build/runtime problem," and this is a UX nuance, not a build/runtime failure).

**Fixed:** None in this phase — no genuine build/runtime problem was found. The multi-representative extraction bug was already fixed and tested in the immediately preceding session, and this phase only built, installed, and smoke-tested that already-fixed source.

**Existing, previously-documented, out-of-scope limitations (unchanged, not addressed here):** per-representative designation is not split by `multiRepresentative.ts` (returns `null`, documented as an intentional deferral); several lower-confidence extraction nuances on non-Indian address formats, ALL-CAPS names, and concatenated phone digit runs (see the prior QA harness report) — none touched, per explicit instruction not to modify extraction architecture further.

## 8. FINAL VERDICT

**READY FOR RELEASE**
