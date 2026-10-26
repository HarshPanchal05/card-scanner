# Final Device QA Report — Industrial Card Scanner v1.0.0
Date: 2026-09-10

## Important note on scope: emulator → physical device

This QA pass was **requested as an emulator-only test** (Nothing A059P explicitly
excluded). Here is what actually happened, in order:

1. A dedicated `CardScanner_QA` AVD (Android 16 / API 36, x86_64, Google APIs, 3GB RAM,
   1080×2400 @420dpi, portrait) was located, booted successfully in ~33s, and confirmed
   clean (zero third-party packages).
2. The release APK installed successfully but **crashed immediately on launch**
   (`SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`). Root cause:
   the release APK's native libraries directory contains **only `arm64-v8a`** — no
   `x86_64` build was produced. A `google_apis` (non-Playstore) x86_64 emulator image has
   no ARM-translation layer, so an arm64-only APK cannot run on it natively. This is an
   APK/build-configuration fact, not a UI bug — see "Environment Finding" below.
3. Shortly after, the emulator consumed enough host RAM that the user asked it to be
   stopped. It was killed along with its logcat capture and adb server; no `qemu-system`
   or `emulator.exe` processes were left running, and host RAM returned to baseline
   (~5GB free of 15.7GB).
4. Given (2) and (3) together — the only available emulator image cannot run this APK at
   all, and the emulator was independently ruled out for memory reasons — the user
   explicitly authorized falling back to the physical **Nothing A059P**, connected over
   **wireless ADB** (paired via mDNS discovery, `192.168.1.127`), for the remainder of
   this pass.

**Everything below (sections 5 onward) was therefore tested on the physical Nothing
A059P, not an emulator**, per the user's explicit in-session override of the original
emulator-only instruction.

## Environment Finding (blocking issue for future emulator QA)

- **The current release APK cannot run on any x86_64 Android emulator**, because it only
  ships `arm64-v8a` native libraries (React Native, Hermes/JSC, ML Kit's native glue,
  SQLite, etc.). To restore emulator testability, the Gradle config would need to build
  for `x86_64` as well (e.g. multi-ABI `reactNativeArchitectures` in
  `android/gradle.properties`) for QA builds, while the production release can remain
  arm64-only for size. **Not fixed** — this task is QA, not development, per instructions;
  flagging for a future decision.

## Environment (physical device used for sections 5+)

| | |
|---|---|
| Device | Nothing A059P (Nothing Phone, codename "Asteroids") |
| Android version | 16 |
| API level | 36 |
| Architecture | arm64-v8a |
| Resolution | 1080 × 2392 |
| Density | 420 dpi |
| Connection | Wireless ADB (`192.168.1.127`, port changed once mid-session after a Wi-Fi toggle — reconnected via mDNS) |
| Pre-existing app data | 4 saved cards, 2 companies, from a prior QA session (2026-09-08/09) |

## Build

| | |
|---|---|
| APK path | `dist/Industrial-Card-Scanner-v1.0.0-final.apk` |
| Size | 63,025,527 bytes (~60.1 MB) |
| SHA-256 | `40838f43a353a809f7585141e0f32a85719af569f9f4cbcc1a502e44b325c97a` |
| versionName / versionCode | 1.0.0 / 1 |
| minSdk / targetSdk | 24 / 36 |
| Build type | Release |
| Source freshness | No source file (`src/`, `App.tsx`, `app.json`) is newer than the APK — confirmed current, no rebuild performed |

## Results

| # | Area | Result | Notes |
|---|---|---|---|
| 5–6 | Locate & install release APK | **PASS** | Correct APK identified, verified current vs. source, installed cleanly on the phone |
| 7 | Launch real app (not source inspection) | **PASS** | Launched via `am start`/monkey, interacted live throughout |
| 9 | Logcat monitoring | **PASS** | Full-session logcat captured; 0 `FATAL EXCEPTION`, 0 SQLite errors, 0 ML Kit errors on the physical device across the whole session |
| 10 | Dashboard | **PASS** | Renders correctly: title, current-event banner, Scan Card CTA, 4 stat tiles, Recent Cards list, bottom nav. Teal brand color correct. No clipping/overlap found in the app's own UI (see note on a nav-bar visual artifact below) |
| 11 | Scanner — camera screen | **PASS** | Camera preview, corner-bracket guide frame (centered), instructions banner, shutter button all render and are positioned correctly, no overlap |
| 11 (physical card capture) | **NOT TESTED — no real business card available in the test environment** | Per instructions, not fabricated |
| 12 | ROI / frame-only OCR | **PASS (indirect)** | Confirmed the on-device blur/quality gate (part of the same crop-then-analyze pipeline) actively runs on a live capture and rejects bad input — see below. Full OCR-on-crop-vs-full-photo comparison was not re-verified this session (no real card); this exact fix was previously verified per project history |
| — | Quality-gate pipeline (real capture) | **PASS** | Captured a real photo of a non-card scene; the app correctly flagged "Image is blurry. Please hold the phone steady and retake." with a red guide frame — proves the capture → crop → blur-analysis pipeline executes correctly on real hardware |
| 13 | Review/Edit screen | **PASS** | Company, Representative (name/designation/title), multi-phone editor (type badges + delete icons), Email, Website, Product Categories (24 chips, clean wrap, no overlap), "+ Add another representative". Save Changes / View Card / Save to Contacts all present, correctly sized and spaced |
| 14 | Multiple representatives (visual) | **NOT TESTED — no multi-representative card exists in the current on-device database** | The release APK's database was freshly seeded on this device (first install 2026-09-08); the earlier debug-build regression fixtures (e.g. CARD-000005 with 2 reps) are not present here. Did not fabricate test data per instructions. The Review screen's own "+ Add another representative" control was confirmed present and usable |
| 15 | Card Library | **PASS** | Thumbnails load, company/representative/date/category/status badges all render cleanly, search bar + Filter button present. Minor nit: search placeholder text ("Search company, name, pho…") is truncated without an ellipsis — cosmetic only |
| 16 | Card Detail | **PASS** | Verified on a real saved card (Planet Automotive Pvt. Ltd. / Rahul Vora): photo, company, category chip, representative block with 3 phone numbers (mobile/landline/mobile, correctly labeled), email, "Save to Contacts" button, Website, multi-line Address (wraps correctly), scan date/event, Edit/Delete buttons. Full-screen scroll confirmed all fields reachable, nothing clipped |
| 17 | Events | **PASS** | "General Scanning" event shown with checkmark, Rename/Archive actions well-aligned, New Event CTA clear |
| 18 | Duplicate modal | **NOT TESTED — no duplicate-triggering condition available without creating new scan data**; Dashboard's "Possible duplicates" stat correctly reads 0 for current data |
| 19 | Category Picker | **PARTIAL** | The inline multi-select category chips (used in Review and in Reports filtering) were verified: 24 categories, clean 2–3-per-row wrap, no overlap, selection state visible. A separate dedicated picker *screen/modal* (if one exists elsewhere, e.g. behind Card Library's "Filter" button) was not explicitly opened this session |
| 20 | Phone List Editor | **PASS** | Tested with the existing 3-phone representative: each row shows number, type badge (Mobile/Landline), delete icon; "+ Add phone number" present; touch targets adequately sized; Save Changes stays visible at the bottom |
| 21 | Image Viewer | **NOT TESTED this session** — "Tap to view full image" affordance was seen and confirmed present on Card Detail but not opened |
| 22 | Reports | **PASS — real Excel generation verified** | Generate Report screen (Event/Category/Date-Range filters) renders cleanly. Tapped "Generate Excel Report" → success dialog appeared immediately → tapped Share Report → Android's system share sheet showed a real file, `General_Scanning_2026-...T05-51-29-570Z.xlsx`, confirming an actual XLSX was written (not just a toast claim). Share sheet was dismissed immediately without sending to any contact |
| 23 | Backup | **PASS — real backup verified** | Backup & Restore screen renders cleanly, correctly lists what's included. Tapped "Create Backup" → button entered a loading state → "Backup created / Your backup is ready" dialog appeared immediately with Later/Share Backup options, matching spec. Storage screen separately showed a non-zero, growing "Backups" size |
| 24 | Contacts | **NOT PERFORMED (by design, for data safety)** | This is the user's real daily-driver phone; tapping "Save to Contacts" would write a real entry into their personal (likely synced) Contacts app. Skipped rather than performed and rolled back, since a Google-synced contact isn't cleanly reversible. The button and its surrounding UI were confirmed present and correctly laid out |
| 25 | Offline test | **NOT COMPLETED — wireless-ADB constraint** | Attempted via `svc wifi disable` (safer than airplane mode, to avoid interrupting calls/SMS); this also severed the wireless-ADB session itself, since it runs over the same Wi-Fi link. Confirmed with the user, Wi-Fi was re-enabled, and ADB was reconnected (rediscovered via mDNS on a new port). A true offline test of this app is not practical over wireless ADB — it would require USB ADB (out of scope here since the phone was already an exception) or the user manually toggling airplane mode while watching the phone directly |
| 26 | Restart | **PASS** | `am force-stop` → relaunch: no crash, new process ID, Dashboard immediately showed the same data (4 cards, 2 companies, same Recent Cards) — confirms persistence and clean restart |
| 27 | Device reboot | **NOT PERFORMED** | Rebooting the user's real daily-driver phone was judged too disruptive for a QA pass on personal hardware; not attempted |
| 28 | Visual UI QA | **PASS, with one system-level observation** | Across Dashboard/Scanner/Card Library/Card Detail/Review/Reports/Backup/Settings/Events: no text clipping, no button overlap, consistent icon style, consistent card padding, correct safe-area handling. One recurring visual artifact was investigated: a faint duplicate/ghosted status-bar icon strip appears low on the screen in several screenshots (Dashboard, Scanner). UI-hierarchy dumps confirmed **no app element occupies that screen region** in either case — this is Android's/Nothing OS's system gesture-navigation overlay, not an app rendering defect |
| 29 | App branding | **PASS** | Teal brand color consistent everywhere, camera/scan iconography consistent, no Expo placeholder icon seen at any point |
| 30 | Performance | **PASS (qualitative)** | All screen transitions, tab switches, and button taps were responsive during this session; no visible freezes; Card Library scrolled smoothly with 4 cards (small dataset — not a stress test) |
| 31 | Data safety | **Respected** | No production card data was altered or deleted. No destructive actions taken (`Delete All Cards`, `Clear Temporary Files` intentionally avoided). One real backup and one real Excel report were generated as explicitly permitted by the task (both non-destructive, additive artifacts) |
| 32 | Bug handling | See below | |

## Bugs / findings

1. **[Environment-blocking, not a code bug in the shipped app] Release APK is arm64-v8a
   only.** Prevents any x86_64 Android emulator (the only kind available on this SDK
   install) from running it at all — crashes with `SoLoaderDSONotFoundError` before any
   UI renders. Real devices (arm64, which is effectively all modern Android phones) are
   unaffected. Flagging so a future emulator-based QA/dev cycle can decide whether to add
   an x86_64 build variant for that purpose specifically.
   - Logcat evidence: `SoLoaderDSONotFoundError: couldn't find DSO to load:
     libreactnative.so`, `Native lib dir: .../lib/arm64` vs. `DirectApkSoSource[...
     base.apk!/lib/x86_64]` present but empty of the arm64-expecting loader's target.

2. **Minor cosmetic:** Card Library search bar placeholder text ("Search company, name,
   phone...") is clipped mid-word without an ellipsis on a 1080px-wide, 420dpi screen.
   Cosmetic only, does not affect function.

No functional, data-loss, or crash bugs were found on the physical device this session.
Zero `FATAL EXCEPTION`, SQLite, or ML Kit errors across the full captured logcat.

## Not tested (honest accounting)

- Real printed-card OCR / physical camera focus / lighting / positioning — no real
  business card was available in this environment; not fabricated, per instructions.
- Multiple-representative visual display — no such card exists in this device's current
  database (fresh release-build data, not the earlier debug-build regression fixtures).
- Duplicate-detection modal — no duplicate-triggering data available without creating
  new scans.
- Dedicated Category Picker screen/modal (if distinct from the inline chips already
  verified).
- Image Viewer (full-screen pinch/zoom) — affordance confirmed present, not opened.
- Contacts save-and-verify round-trip — skipped intentionally (real personal Contacts,
  not cleanly reversible).
- True network-offline behavior — wireless ADB shares the network link with the device
  under test, so cutting connectivity for the app also disconnects the QA tooling.
- Full device reboot — skipped as too disruptive for the user's daily-driver phone.

## Session note: emulator vs. physical phone

This session began strictly on an emulator per instructions, hit a genuine environment
blocker (Finding #1) plus a host-memory concern, and the user explicitly authorized
switching to the physical Nothing A059P for the remainder of the pass. All results from
"Build" onward reflect the physical device, not an emulator.
