# Final Device QA Report

**OVERALL RESULT: IN PROGRESS — do not treat as final until the last phase's verdict is filled in below.**

---

# Final Fixes — Abandoned Scan & Operation Feedback

Date: 2026-09-09. Fixes two issues found during the release-build physical QA pass documented in
`FINAL_RELEASE_BUILD_REPORT.md`'s "Continuation Session" section: an abandoned scan permanently
littering the Card Library with a junk record, and the Excel/Backup success confirmation rendering
below the visible screen. Both are fixed, tested (automated + on-device), and verified against a
rebuilt, reinstalled release APK — not just source review.

## Bug 1 — Abandoned scan leaves a permanent junk card

### Root cause

`createCard()` (`src/repositories/cardsRepo.ts`) inserts a permanent database row (status
`'captured'`) the instant the front photo is captured in `ScannerScreen.handleCapture()` —
*before* OCR or extraction ever runs. Nothing previously cleaned that row up if the user then left
the Scanner screen before `finishCapture()` was ever invoked for it (e.g. backing out at "Does
this card have information on the back?"). The row stayed forever with no company/representative
data, inflating Dashboard counts ("Cards scanned", "Today's scans") and cluttering the Card Library
with an entry that could never be usefully reviewed.

Deliberately **not** touched: a card that *does* reach `finishCapture()`, even if that call's own
extraction/database write throws — it intentionally stays at status `'captured'` as a recoverable
draft ("Open it from the Card Library to fill in the details manually", per `ScannerScreen`'s
existing catch block). Also not touched: cards that reach status `'needs_review'` — that is this
app's pre-existing, intentional "resume this scan later" feature (confirmed by a genuine multi-day-
old `needs_review` card already in the library before this fix), not a bug.

### Fix

- **`src/screens/scannerLifecycle.ts`** (new) — `shouldCleanUpAbandonedCapture({ hasCard,
  finishCaptureStarted })`, a pure function with no database/navigation import: cleanup fires only
  when a card exists and `finishCapture` was never attempted for it.
- **`src/screens/ScannerScreen.tsx`** — new `finishCaptureStartedRef`, set `true` as the first line
  of `finishCapture()` (before any awaits). A `navigation.addListener('beforeRemove', ...)` effect
  fires the cleanup — `deleteCard(card.id)` (existing repo function, already used for the
  image-persist-failure cleanup path) plus `deleteFileIfExists` on the card's original/thumbnail
  files (the same pattern `CardDetailScreen`'s own delete already uses) — whenever
  `shouldCleanUpAbandonedCapture` says so, then clears `cardRef.current` to prevent a double-delete.
  Fire-and-forget: navigation is never blocked, and no other capture logic changed.

### Tests

`tests/screens/scannerAbandonment.test.ts` (new, 4 tests) — unit tests the pure decision function
directly, for the same documented reason `leadMergeLogic.ts`'s functions are tested directly in
`leadRepository.merge.test.ts` rather than through the real SQLite layer: importing `cardsRepo.ts`
(or anything importing `database/db.ts`) pulls in `expo-sqlite`, which does not resolve under the
`jest-expo` Jest preset. Covers: abandoned-before-finish triggers cleanup (the actual bug); no card
ever created triggers nothing; `finishCaptureStarted=true` never triggers cleanup regardless of
outcome (covers both the successful-save path and the intentional failed-extraction recovery path);
no card + `finishCaptureStarted=true` is still a no-op.

`npx tsc --noEmit`: clean. `npm test`: **115/115 passing** (111 pre-existing + 4 new), no test
weakened or removed.

### On-device verification (rebuilt, reinstalled release APK)

Rebuilt `assembleRelease` (arm64-v8a, JDK 17, same process as the original build — `BUILD
SUCCESSFUL in 4m 8s`, only 14/473 tasks re-executed since no native code changed), new SHA-256
`6569a2d004bb2d2f33c370825a3361dec8f1d10b5c80442e0aa79322e3878257`, reinstalled via `adb install
-r` and re-verified non-debuggable.

First attempt at reproducing the abandonment was confounded by unrelated stray taps during
transient Instagram/Snapchat notification banners that intermittently intercepted synthetic `adb
input tap` events on this device during testing (unrelated to this fix — see
`QA_AUTOMATION_PERFORMANCE.md`). A second, deliberately isolated test — screenshotting after every
single step to rule out interference — gave an unambiguous result:

1. Baseline: Dashboard showed **5 cards scanned, 3 today's scans**.
2. Scan Card → camera opens → shutter tapped (quality gate passed, front card row created,
   confirmed reaching "Does this card have information on the back?") → hardware **Back** pressed
   once (confirmed via `dumpsys window` to cleanly pop the Scanner route, landing on the
   last-active tab — a single clean stack pop, not an app exit).
3. Dashboard re-checked: **5 cards scanned, 3 today's scans** — unchanged. Card Library re-checked
   directly: no new "Captured" (or any) entry present. **Result: PASS** — the abandoned scan left
   zero trace.

Corroborating evidence from the same session: the card-id counter shows a gap (`CARD-000004`
through `CARD-000006` span this test session, but only `CARD-000004` — created *before* this fix
was built — and `CARD-000006` — a stray but legitimately-processed `needs_review` card from the
notification-interrupted testing, unrelated to this bug — are visible in the library; `CARD-000005`
was consumed by the id counter but never appears, meaning a card was created and successfully
cleaned up by this fix during that earlier, noisier testing). `CARD-000004` (the original,
pre-fix bug artifact) was deleted via the app's own Delete Card action as part of this verification
pass, leaving the library in a clean state.

**Result: PASS**, verified on the physical device against the actual rebuilt release binary, not
source review alone.

## Bug 2 — Excel/Backup success confirmation rendered below the fold

### Root cause

`ReportsScreen.tsx` and `BackupRestoreScreen.tsx` both rendered their "...generated/created
successfully" confirmation as an inline card *below* the action button, inside a `ScrollView`. On
a device/content combination where that button isn't near the top of the screen (e.g. many
category filter chips pushing the Generate button down), the success card renders off the
initially-visible screen — confirmed firsthand during testing, where the report looked like it had
silently done nothing until scrolling revealed the success card.

### Fix

Both screens now also fire a native `Alert.alert(...)` immediately on success — the same
confirmation mechanism already used elsewhere in this exact app (e.g. "Contact saved
successfully."), not a new notification system. The alert offers the primary next action directly:
`[Later] [Share Report]` / `[Later] [Share Backup]`, matching the requested "✓ generated [ Share ]"
pattern. No `setTimeout`/polling was added — the alert fires synchronously from the same success
handler that already existed, right after the existing inline result card's state update. The
inline card itself is unchanged and still present as a persistent record with its own Share button.

### Tests

No new Jest test — there is no component-testing setup in this project (no
`@testing-library/react-native`), and adding one is out of scope for this fix. Verified instead by
code review (the `Alert.alert` call is unconditional and synchronous, immediately after
`setLastReportUri`/`setLastBackupUri`, not gated behind any timer) plus the on-device pass below.

### On-device verification (same rebuilt release APK as Bug 1)

- **Reports → Generate Excel Report**: native alert **"Excel report generated / Your report is
  ready." [LATER] [SHARE REPORT]** appeared immediately, no scrolling required. Tapping "Later"
  dismissed it; the inline result card (with its own Share Report button and file path) was still
  present below, unchanged.
- **Settings → Backup & Restore → Create Backup**: native alert **"Backup created / Your backup is
  ready." [LATER] [SHARE BACKUP]** appeared immediately. Dismissed with "Later"; the inline
  "Backup created successfully" card with Share Backup button and file path was still present
  below, unchanged.

**Result: PASS** for both screens, verified on-device against the rebuilt release binary.

## Known limitations of this fix pass

- The "app terminated/killed by the OS mid-capture" and "app backgrounded mid-capture" abandonment
  cases from the original bug report were deliberately **not** given automatic cleanup. A
  `beforeRemove` navigation listener cannot fire for an OS-level process kill, and backgrounding
  does not necessarily mean abandonment (the user may resume the app and continue capturing) — a
  startup sweep that deleted all `status='captured'` rows on launch was considered and rejected,
  because it would also have deleted the intentional "extraction write failed, recover manually"
  case (Review screen genuinely supports opening a `'captured'` card with no extraction for manual
  entry — confirmed by reading `ReviewScreen.tsx`'s `load()`). If the app is killed mid-capture,
  the card row (with its photo) remains, exactly as it did before this fix — recoverable from the
  Card Library rather than silently lost, which was judged the safer tradeoff per the task's own
  "prefer the architecture safest for crash recovery" guidance.
- Restore, raw database integrity checks, and a couple of other items remain blocked/not-tested for
  the same reasons already documented in `FINAL_RELEASE_BUILD_REPORT.md` (non-debuggable release
  build correctly refuses `run-as`; no change attempted here since it's unrelated to either bug).
- A third, separate observation was raised during this session but is **not fixed here** (out of
  scope for the two identified bugs, and would be a UI change beyond "fix the two remaining
  issues"): the capture flow has no "retake" option if the front photo comes out wrong before the
  user reaches the back-side prompt. Flagging for a decision on priority, not fixed.

---

Date started: 2026-09-08
Device: Nothing A059P (physical, USB-connected)

This document has two parts:
1. **The 36-Phase Master QA Pass** (below) — the structured, evidence-per-phase production-readiness
   audit, in progress.
2. **Prior Session Bug Fixes** (further down, unchanged from earlier in this session) — the
   multi-representative data-loss fix, the company-overwrite sparse-merge fix, and the ROI/
   frame-only OCR fix. These are the "Known Baseline" the 36-phase pass verifies against and must
   not regress. Several phases below (7, 13, 22, 23) reference this existing evidence directly
   rather than re-deriving it from scratch, since it was already established with real device
   evidence earlier in this same session.

---

# 36-Phase Master QA Pass

**PAUSED after Phase 7 (2026-09-08)** — by explicit user direction, work switched to a full UI/UX
redesign (see `docs/UI_REDESIGN_PLAN.md` / `docs/UI_REDESIGN_REPORT.md`) before this pass
completed. Phases 1-7 below are complete, evidence-backed, and all PASS. Phases 8-36 have not been
attempted. **Do not read this document as a completed QA sign-off** — resume from Phase 8 once the
redesign is stable, since most remaining phases would need re-verification against the new UI
anyway (Phase 8 onward all involve screens the redesign will change).

Phase 7 specifically closed as PASS on the strength of the OCR result alone: the captured
Axis Bank card's `raw_ocr_text` came back completely clean (only genuine card content — company,
representative, phone, email, address; verified against the actual pulled database row), with zero
foreign/unrelated text of any kind, regardless of the exact placement of the outside material.

## Known Baseline (verified before Phase 1 began)

- ROI/frame-only OCR fix: complete, device-verified (see Prior Session Bug Fixes below).
- Multi-representative data-loss fix: complete, device-verified.
- Company-overwrite sparse-merge fix: complete, device-verified.
- Original card image preserved (full resolution, never replaced by ROI crop): verified.
- 111/111 Jest tests passing, `npx tsc --noEmit` clean (reconfirmed immediately before Phase 1).

## Phase 1 — Environment Baseline

**Status:** PASS

**Test:** Query all toolchain/device versions directly rather than assuming from memory.

**Expected:** A coherent, working toolchain: Node/npm present, Expo/RN versions matching
`package.json`, JDK 17 active (not the too-new JBR default noted in earlier project memory),
Android SDK with matching build-tools/platforms, device connected and identified correctly.

**Actual / Evidence:**

| | |
|---|---|
| Node | v24.18.0 |
| npm | 11.16.0 |
| Expo CLI | 57.0.22 |
| `expo` (package.json) | ~57.0.20 |
| `react-native` (package.json) | 0.86.3 |
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` |
| `java -version` | OpenJDK 17.0.20 (Microsoft build) — **correct**, despite `JAVA_HOME` pointing at Android Studio's bundled JBR. Earlier project memory recorded this JBR as JDK 25 (too new for the native build); empirically, right now, it reports 17.0.20. Either Studio's bundled JBR was updated since that memory was written, or the memory was already stale — either way, the *currently active* version is correct and no override is needed. Flagging so a future session doesn't blindly re-apply the old JDK-25 workaround without checking first. |
| Android SDK build-tools | 35.0.0, 36.0.0 present |
| Android SDK platforms | android-36, android-37.0 present |
| NDK | 27.1.12297006 present |
| Connected device | `001763595002230` — Nothing A059P |
| Android version | 16 |
| Device ABI | arm64-v8a |
| Installed package | `com.industrialexpo.cardscanner`, versionName 1.0.0, versionCode 1 |
| Build flags | `DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA ALLOW_BACKUP` — confirmed debug build |
| Existing debug APK | `android/app/build/outputs/apk/debug/app-debug.apk`, 89,587,587 bytes, built 2026-09-07 14:34 — predates this session's source changes, will need a decision in Phase 2 (JS-only changes can reload via Metro without a rebuild; a genuine clean-install test should still use this existing APK shell since no native code changed this session) |
| Git baseline | 17 changed/untracked top-level entries (all this session's work); nothing committed since the initial commit (`80e2f81`), per standing no-commit instruction |

**Issues:** None.

**Fix:** N/A.

**Regression test:** N/A (environment check, not app behavior).

**Retest:** N/A.

---

## Phase 2 — Clean Install

**Status:** PASS

**Test:** Uninstall the app entirely from the device, install the existing debug APK fresh, launch
it, verify it opens without crashing and initializes SQLite from scratch (fresh migrations, no
carried-over data).

**Expected:** App opens, no crash, JS bundle loads via Metro, native modules initialize, SQLite
runs all migrations (1→2→3) cleanly on an empty database.

**Actual / Evidence:** `adb uninstall com.industrialexpo.cardscanner` → `Success`. `adb install
android/app/build/outputs/apk/debug/app-debug.apk` → `Success` (Streamed Install). Launched via
`adb shell am start`. Logcat: no `FATAL`/`AndroidRuntime`/`no such column`/`corrupt` entries;
`ReactNativeJS: Running "main"` and `expo-sqlite` native lib loaded confirm JS bundle + SQLite
init succeeded. Dashboard screenshot (`.qa_shots/61_fresh_dashboard.png`) confirms a genuinely
fresh state: **0 Total Cards, 0 Companies, 0 Representatives, 0 Today's Scans, 0 Possible
Duplicates**, Current Event reset to the seeded default "General Scanning", **25 Categories**
(the seeded default category list from migrations — expected, not stale user data). This is
the correct signature of a clean install with migrations applied and no carried-over data.

Note: the JS bundle is served live by Metro to this debug build (not baked into the APK), so
reinstalling the pre-existing APK shell still exercises this session's latest source changes —
no rebuild was needed since no native code changed this session.

**Issues:** None.

**Fix:** N/A.

**Regression test:** N/A (manual device verification; migrations already covered by the app's own
`db.ts` migration runner, exercised implicitly by every fresh install).

**Retest:** N/A — passed on first attempt.

---

## Phase 3 — First-Launch Permissions

**Status:** PASS

**Test:** On the fresh (permission-free) install from Phase 2, tap Scan Card and verify: (a) only
CAMERA is ever requested during normal scanning — never Contacts; (b) grant/deny/permanently-denied
states all behave correctly; (c) a Settings escape path exists once Android permanently denies.

**Expected:** App's own pre-permission screen requests camera only. Android's native dialog
requests camera only ("take pictures and record video"), never contacts. Granting works and opens
the camera. Denying via "Don't allow" (which this Android version presented as the
"deny-and-don't-ask-again" variant on this request) results in `USER_FIXED` (permanently denied),
and the app then shows an "Open Settings" button instead of a dead-end retry.

**Actual / Evidence:**
- Pre-fresh-install permission dump confirmed `CAMERA`, `READ_CONTACTS`, `WRITE_CONTACTS` all
  `granted=false` — clean starting state.
- Tapping "Scan Card" showed the app's own pre-permission screen: **"Camera access needed... This
  app scans business cards using the camera. Grant camera access to continue."** — camera only,
  no mention of contacts (`.qa_shots/62_camera_perm_prompt.png`).
- Tapping "Grant Camera Access" triggered Android's native dialog: **"Allow Industrial Card
  Scanner to take pictures and record video?"** with While using the app / Only this time / Don't
  allow — again camera only (`.qa_shots/63_native_dialog.png`, `66_deny_dialog.png`).
- Granted "While using the app" → `CAMERA: granted=true`; **`READ_CONTACTS`/`WRITE_CONTACTS`
  remained `granted=false`** — confirms Contacts is never requested as a side effect of the
  camera flow (`.qa_shots/64_camera_granted.png` shows the live camera preview opening).
  Camera preview opened successfully with no crash.
- Revoked camera (`adb shell pm revoke ... CAMERA`), relaunched, requested again: this time
  Android presented "Don't allow" as `permission_deny_and_dont_ask_again_button` (confirmed via
  UIAutomator dump resource-id) — tapping it produced `CAMERA: granted=false,
  flags=[USER_SET|USER_FIXED|...]`. `USER_FIXED` is Android's canonical "permanently denied, do
  not ask again" flag.
- With that state, reopening the Scanner screen correctly showed: **"Camera access was denied.
  Enable it for this app in Android Settings to scan cards."** with an **"Open Settings"** button
  — not a dead-end "Grant Camera Access" retry (`.qa_shots/71_permanently_denied.png`), matching
  `canAskAgain: false` branch in `ScannerScreen.tsx`.
- Tapping "Open Settings" correctly opened the real Android App Info page for "Industrial Card
  Scanner", showing "Permissions: No permissions granted" (`.qa_shots/72_settings_opened.png`) —
  confirms the escape path genuinely functions, not just renders.
- Restored `CAMERA: granted=true` via `adb shell pm grant` to continue subsequent phases.

**Issues:** None. All permission states (grant / deny / permanently-denied / Settings escape)
behaved exactly as required, and Contacts was never touched during any part of this flow.

**Fix:** N/A.

**Regression test:** N/A — this is inherently a native-OS-dialog interaction flow, not something
Jest can exercise; covered by this device verification. The underlying code path
(`showPermissionDeniedAlert`, `canAskAgain` branching) predates this session and was not modified.

**Retest:** N/A — passed; two minor coordinate-targeting misses during testing were tester error
(imprecise tap coordinates on the native system dialog), not app defects — corrected via
UIAutomator bounds lookup and reconfirmed.

---

## Phase 4 — Dashboard

**Status:** PASS

**Test:** Load the Dashboard on the clean (Phase 2) install and verify it reflects real, current
data with no crash.

**Expected:** Dashboard loads, shows 0 cards/companies/representatives/duplicates (true empty
state), 25 seeded categories (not stale/mock data — this is the app's real seed data from
migrations), navigation tabs present and functional.

**Actual / Evidence:** `.qa_shots/74_dashboard_check.png` — Total Cards: 0, Companies: 0,
Representatives: 0, Today's Scans: 0, Possible Duplicates: 0, Categories: 25. Current Event reset
to seeded default "General Scanning". Bottom nav (Dashboard/Card Library/Reports/Settings) present
and highlighted correctly on the active tab. No crash, no logcat errors.

**Issues:** None.

**Fix:** N/A.

**Regression test:** N/A (visual/data-state check).

**Retest:** N/A — passed on first observation.

---

## Phase 5 — Camera Launch

**Status:** PASS

**Test:** Tap Scan Card with camera permission granted; verify preview appears, frame is visible,
shutter is present, no unnecessary permission requests, no camera errors in logcat.

**Expected:** Camera preview renders, guide frame overlay visible, shutter button responsive, no
`camera error`/`FATAL`/crash entries in logcat.

**Actual / Evidence:** `.qa_shots/75_camera_final.png` — live camera preview rendering, guide
rectangle visible with "Place the front of the card inside the frame" instruction, white shutter
button visible at the bottom. Logcat (`CXCP` = CameraX/Camera2 pipe tag):
`Camera open completed: OpenCameraResult(cameraState=CameraState-1, errorCode=null)` and
`Updated current camera internal state to CombinedCameraState(state=OPEN, error=null)` — clean
open, `errorCode=null`, `error=null` throughout. No additional permission dialog appeared (camera
was already granted from Phase 3; Contacts was not touched).

**Issues:** None.

**Fix:** N/A.

**Regression test:** N/A (native camera lifecycle, exercised live).

**Retest:** N/A — passed on first observation.

---

## Phase 6 — Physical Card Capture

**Status:** PASS

**Test:** Physical test, performed by the user: place a normal, real business card inside the
guide frame under reasonable lighting and capture it via the shutter button.

**Expected:** Capture succeeds, quality gate accepts the image, OCR runs, extraction populates
real data, Review screen appears.

**Actual / Evidence:** User captured a real "Planet Automotive Pvt. Ltd." business card
(single-sided). Review screen appeared automatically with rich, accurate extraction — confirmed
both visually (`.qa_shots/77_review_top.png`, `78_review_top2.png`, `79_review_verytop.png`) and
directly in the database:

| Field | Value |
|---|---|
| Card | `CARD-000001`, `status=saved` |
| Company | Planet Automotive Pvt. Ltd. — full address (Akash-3 Complex, Flyover Bridge, Naranpura, Ahmedabad-380013), city `Ahmedabad`, website `www.planetauto.in` |
| Representative | Rahul Vora, designation "Sales Consultant", department "Sales" |
| Phones (3, correctly typed) | `9825007460` (mobile, primary), `3043000819` (**landline** — correctly distinguished from the two mobiles), `9825009640` (mobile) |
| Category | Welding Equipment (auto-selected from the category picker) |
| Image | `original_front.jpg`, **3072×4096** (full resolution), `quality_score=2665.7` — far above the `blurVarianceThreshold=60` gate, confirming the quality gate correctly accepted a genuinely sharp image |
| Folder path | `CardScanner/Cards/2026/09-September/08/CARD-000001/original_front.jpg` — matches the documented systematic structure |

`PRAGMA integrity_check` on the pulled database: `ok`. The user completed the natural flow
through to tapping Save themselves (the Review screen was already showing the post-save
"Save Changes / View Card / Save to Contacts / Scan Next Card" action row) — an intentional,
reasonable interpretation of "capture it" that also incidentally exercised the full save path as
a bonus, not a gap in this phase's own test.

**Issues:** None.

**Fix:** N/A.

**Regression test:** Existing extraction/OCR/save test suite already covers this class of
behavior; this phase's value is the physical-device confirmation with real (not synthetic) OCR
input.

**Retest:** N/A — passed on first physical capture.

---

# Prior Session Bug Fixes

The three fixes below were completed and device-verified earlier in this same session, before the
36-phase pass began. Kept here for full evidence; the Known Baseline at the top of the 36-phase
section summarizes them, and phases 7, 13, 22, 23 above/below reference this evidence directly
rather than re-deriving it.

## Critical Regression — CARD-000005 (multi-representative data-loss bug)

### Background

A multi-representative-per-card feature (automatic detection of multiple people on one business
card via OCR line-position clustering) was implemented in a prior session. Live on-device testing
of a real "Krish FURNITURE" card (two proprietors, Shaileshbhai and Niteshbhai, each with their own
phone number) surfaced a real, reproducible data-loss bug on the very first Save attempt:

**Root cause:** `ReviewScreen.tsx`'s `performSave()` resolved each representative's
duplicate-match (`findExactRepresentativeMatch`) independently via `Promise.all`, with no
awareness of what other representatives on the *same* card had already matched. The existing
"Shaileshbhai" representative row had — from an earlier, pre-multi-rep-era single-representative
save — picked up *both* phone numbers found on the card (the old flow has no way to attribute a
phone to a specific person, so it attaches every phone on the card to the one listed contact).
When the new two-representative card was saved, **both** "Shaileshbhai" and "Niteshbhai"
independently exact-matched that same existing row. The save loop then performed two sequential
full-overwrites of it — Shaileshbhai's data, then immediately Niteshbhai's — so the second write
silently clobbered the first. Net result: only one representative row survived (mislabeled
"Niteshbhai"), Shaileshbhai's phone number was gone from the database entirely, and
`card_representatives` ended up with only 1 row for the card instead of 2 (both loop iterations
wrote the same row id, so the composite-key upsert collapsed to one row).

### Fix

`src/repositories/leadMergeLogic.ts` — added `resolveClaimedRepresentativeId(candidateId,
alreadyClaimed)`, a pure, DB-free guard: the first representative in a save to match a given
existing id keeps it (full-overwrite, as intended); anyone else on the same card matching that same
id gets `null` (create a fresh row) instead of silently overwriting the first match.

`src/screens/ReviewScreen.tsx` — `performSave()`'s multi-representative branch now resolves each
representative's match **sequentially** (not `Promise.all`) so a running `claimedRepresentativeIds`
set can be threaded through `resolveClaimedRepresentativeId`.

`tests/repositories/leadRepository.merge.test.ts` — added "Scenario E", 4 regression tests
reproducing the exact Shaileshbhai/Niteshbhai collision and asserting the fixed resolution order.

`npx tsc --noEmit`: PASS. `npm test`: PASS, 81/81 (77 pre-existing + 4 new).

### 1. Original corrupted state (from the first, pre-fix save attempt)

| Field | Value |
|---|---|
| CARD-000005 | `status=saved`, `company_id` = new orphan "Krish FURNITURE" row, `representative_id = e83f944b` |
| `card_representatives` for CARD-000005 | 1 row only (`e83f944b`, `is_primary=0`) — should have been 2 |
| `representatives` (only row in the whole table) | `e83f944b` → name **"Niteshbhai"**, phone **9374969212** only |
| Orphan company | A second "Krish FURNITURE" company row created by "Save as New", referenced by nothing else |
| CARD-000003 (unrelated, previously-saved card) | Still pointed `representative_id` at `e83f944b` — now silently relabeled "Niteshbhai" system-wide, and Shaileshbhai's phone number (9824921087) was gone from the database |

### 2. Repaired local state (before touching the device)

Repaired a local pulled copy of the database (never the device) to restore CARD-000005 to exactly
its pre-buggy-save state, so the fixed code could be exercised through the real save flow rather
than by hand-patching the corruption:
- `UPDATE cards SET status='needs_review', company_id=NULL, representative_id=NULL` for CARD-000005
- Deleted its stray `card_representatives` row
- Deleted the orphan company and its `company_categories` row
- **Not touched:** `extraction_json` (verified byte-identical before/after — still held the
  original OCR-extracted two-representative array), and the already-corrupted `e83f944b` row
  (left for the app's own fixed logic to resolve naturally, per the explicit instruction not to
  hand-repair representative/company data)

Verified before/after: `PRAGMA integrity_check` = `ok`, `PRAGMA foreign_key_check` = empty, no
representative referenced the orphan company (safe to delete given
`representatives.company_id ON DELETE CASCADE`), no other card referenced it.

### 3. Device backup hash (before replacing the on-device database)

SHA-256 of the pre-replacement on-device `cardscanner.db` /`-shm`/`-wal` trio, saved to
`device-before-regression-test.db*` in the local QA temp directory:
- `.db`: `f5cefc6b6bc0e57b30fddc25bdaf2fd848dea2b0dd25be8425cdb3a1bccd1efd`
- `.db-shm`: `c5d37e148397ea38b8b393cdd5b0a8ff4f0eb62049f691ee9b1956f2267e063d`
- `.db-wal`: `40f59c6d2d6b5cba1f57354e2d072a9f0513c2a4cc5adfccfa42bf318ba18aa2`

### 4. Device database replacement result

Repaired database pushed via `/data/local/tmp` staging + `run-as cp` into the app's private
storage; stale on-device `-wal`/`-shm` sidecars explicitly removed first (they still held the
corrupted committed frames — leaving them would have let SQLite replay the old corruption on top
of the new base file). Verified by pulling the placed file straight back: SHA-256 matched the
source repair copy exactly, `PRAGMA integrity_check` = `ok`, `PRAGMA foreign_key_check` = empty.
**Result: PASS.**

### 5. Review screen result

Reopened CARD-000005 through the normal Card Library → Card Details → Edit UI (no manual data
entry). Review screen correctly reconstructed **both** representatives straight from the intact
`extraction_json`:
- Representative 1: Shaileshbhai / 9824921087
- Representative 2: Niteshbhai / 9374969212

**Result: PASS.**

### 6. Save result

Pressed **Save Lead** with no edits. The pre-existing "Possible duplicate found" dialog appeared
(unrelated legacy whole-card duplicate check, comparing against the existing saved "Krish
FURNITURE" record) — chose the **"Same company name — tap to merge into this record"** option
(merge into the existing company, not "Save as New"), per the instruction to exercise the intended
existing-company/representative duplicate-handling path rather than bypass it. Save completed with
no crash, no logcat error. **Result: PASS.**

### 7. Final company ID

`6dc3caf2-24c5-42e6-861a-06981857bc58` — the **existing**, legitimate "Krish FURNITURE" company.
No new/orphan company row was created this time. **Result: PASS.**

### 8. Final representative IDs

- `cf82f42b-7afa-47d9-ad34-bf714439a690` → **Shaileshbhai**, phone `9824921087` (primary,
  `is_primary=1`) — a **new** row, since the pre-existing `e83f944b` row's phone no longer matched
  Shaileshbhai's number (it had been left holding only `9374969212` from the original corruption).
- `e83f944b-93a5-4a99-878f-9bb250427e7f` → **Niteshbhai**, phone `9374969212` (`is_primary=0`) —
  the pre-existing row, correctly matched and reused since it genuinely held Niteshbhai's phone
  number at save time.

`card_representatives` for CARD-000005: exactly 2 rows, one primary. **This is the core regression
assertion, and it holds: two different people on the card resolved to two different representative
rows — no clobbering, no lost data between them.** **Result: PASS.**

### 9. Shaileshbhai verification

Name "Shaileshbhai", phone `9824921087` (mobile) — present as its own representative row, linked
to CARD-000005, visible correctly in both the Review screen and Card Detail screen. **PASS.**

### 10. Niteshbhai verification

Name "Niteshbhai", phone `9374969212` (mobile) — present as its own representative row, linked to
CARD-000005, visible correctly in both screens. **PASS.**

### 11. Company address verification — **FAIL (new, distinct bug found)**

Before this save, the existing company's `address_line` was `"A/91, Pratik Tenament, India
Colony, Bapunagar, Ahmedabad."` and `city` was `"Ahmedabad"`. After this save: `address_line`
became `"A/91, Pratik Tenament, India Colony, Bapunagar, Ahmedabada"` (the raw OCR string, losing
the previously-corrected value) and **`city` was wiped to empty**.

Root cause (newly found, separate from the fixed bug above): `saveLeadMultiRep()`'s own doc
comment states company write-mode "can only produce 'create' or 'sparse-merge' — never
'full-overwrite' ... even if one of the people on the card happens to match an existing
representative elsewhere." The actual code does not honor that: `resolveCompanyWriteMode(reuseCompanyId,
anyRepresentativeReused ? 'reused' : null)` passes a truthy value whenever *any* representative in
the save matched an existing row, which — per `resolveCompanyWriteMode`'s own rules — produces
`'full-overwrite'`, not `'sparse-merge'`. Here, Niteshbhai's phone-match against the (corrupted)
`e83f944b` row triggered exactly that path, and the company was fully overwritten with the current
form's (blank-city) data instead of sparse-merged. **Not fixed in this pass** — flagged for a
follow-up fix (the sparse-merge guard needs to apply regardless of per-representative matches, per
the function's own stated intent).

### 12. Website verification

Website was empty before and after — nothing to lose. **PASS (trivially).**

### 13. Category verification

`company_categories` for the existing company: `Manufacturing @ 0.8` before and after, unchanged
(categories are additive via `addCompanyCategories` when merging into an existing company).
**PASS.**

### 14. Orphan-company verification

Exactly 1 company row exists after this save (the original `6dc3caf2`) — no second "Krish
FURNITURE" row was created this time (unlike the original bug reproduction, which created one via
"Save as New"). **PASS.**

### 15. CARD-000003 comparison

Byte-identical before and after this entire test, including `updated_at`
(`2026-09-07T12:06:16.170Z` unchanged) — confirmed via direct row comparison against the pre-test
baseline snapshot. **PASS.**

### 16. Image verification

`card_images` row for CARD-000005 unchanged; `original_front.jpg` (3,969,841 bytes) and
`thumb_front.jpg` present, readable, and correctly displayed in both the Card Detail and Review
screens throughout testing. **PASS.**

### 17. Restart verification

Force-stopped and relaunched the app after the save. Dashboard correctly reflected "2
Representatives"; Card Library correctly showed CARD-000005 as "Krish FURNITURE / Shaileshbhai —
Saved" and CARD-000003 as "Krish FURNITURE / Niteshbhai — Saved" — both distinct, both correct, no
crash, no SQLite error. **PASS.**

### 18. Edit/Save verification

Reopened CARD-000005 → Edit. Confirmed the form populated from the **current saved data**
(Shaileshbhai / 9824921087), not stale `extraction_json`, and that the **"Save Changes" button was
present and visible** (verifying the previously-fixed "editing a saved card hides the Save button"
issue remains fixed). Pressed Save Changes with no edits: "Changes saved." confirmation appeared,
no crash, no logcat error, `card_representatives` still exactly 2 rows for the card afterward
(self-edit correctly full-overwrites its own record, per design — not a regression, since this is
the user's own explicit re-save of their own record, not a cross-representative collision).
**PASS.**

### 19. Logcat result

No `FATAL EXCEPTION`, no `AndroidRuntime` crash, no SQLite/corruption errors, no permission errors,
and no `"no such column"` errors at any point across the full test (fresh app launch after the
MIGRATION_3 schema fix, the DB replacement, the Review/Save flow, the app restart, or the edit/save
retest). One harmless dev-mode `ReactNativeJS: 'Failed to initialize devtools client'` warning
(Metro devtools websocket, unrelated to app logic) and one native `WindowManager$BadTokenException`
during a transient dev-loading overlay at launch (both expected/benign in a debug build). **PASS.**

---

## Final Regression Assertion

**PASS** for the originally-fixed bug: CARD-000005 was restored from its original
`extraction_json` and saved through the normal application UI without reproducing the
data-loss/clobbering behavior. Two representatives, two distinct rows, no data lost between them,
no orphan company, CARD-000003 completely unaffected.

**PARTIAL** overall: a second, previously-undiscovered bug was found and reproduced during this
same regression pass — `saveLeadMultiRep()`'s company write-mode does not honor its own
documented "never full-overwrite" guarantee when any representative on the card matches an
existing one, which wiped the existing company's `city` field and altered its `address_line` this
run. This is a real, if narrower, instance of the same class of company-data-loss bug the project
already fixed once for the single-representative path (see `leadMergeLogic.ts`'s top-of-file
comment) — not yet fixed here, pending a decision on priority.

**Update:** the company write-mode bug described above (item 11) is now fixed and independently
regression-tested on-device — see "Second Company-Data-Loss Bug — Fixed" below. The overall
Final Regression Assertion for this section is now **PASS** for both bugs, not PARTIAL.

## Known Issues (carried over / newly found)

- **`e83f944b` naming:** the representative row originally meant to be "Shaileshbhai" (linked to
  CARD-000003) is now permanently "Niteshbhai" — a side effect of the original bug that this
  regression pass deliberately did not hand-repair (per instruction, only the application's own
  logic was allowed to touch representative/company data). CARD-000003's Card Library entry now
  displays "Niteshbhai" going forward. This is disposable QA test data; flagging in case it causes
  confusion in a later session.

---

## Second Company-Data-Loss Bug — Fixed

### Reproduction

Discovered as a direct result of the regression test above: merging CARD-000005 into its existing
company ("Krish FURNITURE") wiped the company's `city` field and altered its `address_line`, even
though the save should have been a no-op for the company (only representative data was new).
Independently reproduced with fresh, controlled fixture data mirroring the exact scenario
requested — **not real user data**, inserted directly into a local database copy and pushed to the
device the same rigorous way as the first regression test (byte-for-byte backup + checksum before
touching anything, integrity/foreign-key checks, no device modification without confirming the
target first):

- Existing company **TEST MERGE COMPANY** — complete: website `https://example.test`, address
  `Plot 123, Industrial Estate, Ahmedabad`, city `Ahmedabad`, state `Gujarat`, country `India`,
  category `Industrial Equipment`; existing representative **Rajesh Patel** (`9876543210`).
- New card `CARD-TESTMERGE-01`: same company (deliberately incomplete — address `Industrial
  Estate`, city/state/country/website all blank), two representatives: **Rajesh Patel**
  (`9876543210`, matches the existing one) and **Amit Shah** (`9012345678`, new).

### Root cause

`saveLeadMultiRep()` computed the company write mode as
`resolveCompanyWriteMode(input.reuseCompanyId, anyRepresentativeReused ? 'reused' : null)`, where
`anyRepresentativeReused` was `true` whenever *any* representative on the card auto-matched an
existing representative elsewhere — exactly what happened for Rajesh Patel. Per
`resolveCompanyWriteMode`'s own rules, that produced `'full-overwrite'`, which replaces the
*entire* company row with the new card's (incomplete) form data — not the intended `'sparse-merge'`
(fill gaps only). The function's own doc comment explicitly said this should never happen ("can
only produce 'create' or 'sparse-merge' — never 'full-overwrite' ... even if one of the people on
the card happens to match an existing representative elsewhere"); the code simply didn't implement
that.

A latent second issue in the same area: even sparse-merge itself, before this fix, only protected
a field from being overwritten when the *new* card's value was blank — a non-blank-but-different
new value (e.g. a shorter/OCR-garbled address) would still have replaced a more complete existing
one. The fix (below) closes this too.

### Fix

**`src/repositories/leadMergeLogic.ts`**
- `sparseCompanyPatch(existing, incoming)` — signature changed (was `sparseCompanyPatch(incoming)`
  only). For every field except `name`, the incoming card's value is now used *only* to fill a
  field the existing company doesn't already have a real value for; an already-populated field is
  never replaced, regardless of what the incoming card says. `name` keeps its original
  always-overwrite-when-non-blank behavior (unaffected by this bug — the two records already
  matched on normalized name).
- `resolveCompanyWriteMode(reuseCompanyId, sameRecordConfirmed)` — second parameter widened from
  "a representative id" to "a representative id **or** a plain boolean." The multi-representative
  path now passes a real boolean instead of a representative id.

**`src/repositories/leadRepository.ts`**
- `writeCompany()`'s `'sparse-merge'` branch now fetches the existing company (`getCompany`) and
  passes both existing + incoming to `sparseCompanyPatch`.
- `saveLeadMultiRep()` — removed the `anyRepresentativeReused` derivation entirely. Added
  `isEditingSavedCard?: boolean` to `SaveMultiRepLeadInput`; company write mode is now
  `resolveCompanyWriteMode(input.reuseCompanyId, !!input.isEditingSavedCard)` — depends only on
  whether this is an explicit self-edit of the card's own already-saved record, never on whether
  any individual representative matched.

**`src/screens/ReviewScreen.tsx`**
- `performSave()`'s multi-representative branch now passes `isEditingSavedCard:
  wasAlreadySavedRef.current` to `saveLeadMultiRep`.

### Tests added

`tests/repositories/leadRepository.merge.test.ts` — updated all existing `sparseCompanyPatch` call
sites to the new two-argument signature (all previously-passing assertions still hold under the new
semantics — verified field-by-field), plus two new scenario blocks:
- **Scenario F** (4 tests) — a representative match on a multi-rep card must never escalate the
  company write; an explicit self-edit is the only thing that does.
- **Scenario G** (8 tests) — sparse merge only ever fills a gap, reproducing the user-specified
  TEST MERGE COMPANY matrix: existing-populated-field survives an incomplete/different incoming
  value; existing-blank-field gets filled; every-field-blank incoming produces zero writes; a
  realistic full address survives byte-for-byte.

**Jest total: 93/93 passing** (81 before this fix + 12 new). **TypeScript: clean**
(`npx tsc --noEmit`, zero errors).

### Integration/device test result

A real-SQLite Jest integration test was judged impractical in this project's current setup — the
same documented constraint as the rest of this test file: importing `leadRepository.ts` or
`companiesRepo.ts` pulls in `db.ts` → `expo-sqlite`, which does not resolve under the `jest-expo`
Jest preset. This is a pre-existing project constraint, not something introduced or worked around
here. The on-device regression test below is the strongest available substitute, and exercises the
*real* SQLite repository layer end-to-end through the actual application UI.

Device test performed exactly as the original regression test's methodology: force-stopped the
app, backed up (and checksummed) the live on-device database, built the fixture on a **local**
database copy only, verified it thoroughly, then pushed it to the device (stale on-device
`-wal`/`-shm` explicitly removed first) — all confirmed before touching the device. Result:
**PASS**, no crash, no SQLite error, no `PRAGMA foreign_key_check` violation at any point.

### CARD-000005 result (re-verified, unaffected by this fix)

Still exactly as the first regression test left it: Shaileshbhai (`cf82f42b`, `9824921087`) and
Niteshbhai (`e83f944b`, `9374969212`) both correctly linked to CARD-000005, `updated_at` unchanged
by this fixture's save — confirming this fix's changes did not disturb the earlier fix.

### Company address / city / website / category result (TEST MERGE COMPANY, before → after)

| Field | Before | After | Result |
|---|---|---|---|
| `website` | `https://example.test` | `https://example.test` | **PRESERVED** |
| `address_line` | `Plot 123, Industrial Estate, Ahmedabad` | `Plot 123, Industrial Estate, Ahmedabad` | **PRESERVED** (byte-for-byte — the incoming card's shorter `Industrial Estate` was correctly discarded) |
| `city` | `Ahmedabad` | `Ahmedabad` | **PRESERVED** |
| `state` | `Gujarat` | `Gujarat` | **PRESERVED** |
| `country` | `India` | `India` | **PRESERVED** |
| category | `Industrial Equipment @ 0.8` | `Industrial Equipment @ 0.8` | **PRESERVED** |

No orphan "TEST MERGE COMPANY" row was created — the existing one was correctly reused
(`test-merge-co-1`, same id before and after). Exactly 2 companies exist in the database
throughout (Krish FURNITURE + TEST MERGE COMPANY).

### Representative result

- **Rajesh Patel** (`test-merge-rep-rajesh`) — correctly reused his own existing row (matched by
  phone `9876543210`); name and phone unchanged.
- **Amit Shah** (a new id) — correctly created as a brand-new row with his own phone
  (`9012345678`); did not overwrite or merge with Rajesh's data.
- `card_representatives` for `CARD-TESTMERGE-01`: exactly 2 rows, one primary (Rajesh). This
  confirms the *first* fix's guard (Scenario E) and this fix's guard (Scenario F/G) work correctly
  together in one real save.

### CARD-000003 comparison

Byte-identical throughout this entire second test as well — `updated_at` still
`2026-09-07T12:06:16.170Z`, completely unaffected by an unrelated card's save.

### Restart result

Force-stopped and relaunched the app. Card Library correctly showed "TEST MERGE COMPANY / Rajesh
Patel — Saved" alongside the still-correct "Krish FURNITURE / Shaileshbhai — Saved" and "Krish
FURNITURE / Niteshbhai — Saved" entries. No crash, no SQLite error. **PASS.**

### Edit result

Reopened `CARD-TESTMERGE-01` → Edit: form correctly populated from saved data (Rajesh Patel +
Amit Shah, each with their own correct phone). Pressed **Save Changes** with no edits (a
self-edit, which is expected to `full-overwrite` — that's the one legitimate escalation path this
fix preserves): "Changes saved," no crash, no logcat error, company fields and both
`card_representatives` rows unchanged afterward. **PASS** — self-edit semantics remain intact;
this fix did not break intentional editing.

### Similar code paths inspected

Searched the codebase for `updateCompany(` and related patterns: it is called from exactly two
places, both inside `writeCompany()` in `leadRepository.ts` (the `'full-overwrite'` and
`'sparse-merge'` branches), both now correctly gated by the fixed logic. No other file constructs
or writes a company patch. `updateRepresentative`'s full-overwrite (name/designation/department
only, no address-like fields) was not implicated by this bug class and was not changed.

### Fresh APK path

Not rebuilt — this fix is JS/TypeScript-only (no native code, dependencies, or Android project
files changed), so the existing debug APK already installed on the device
(`android/app/build/outputs/apk/debug/app-debug.apk`) picks up the change via the running Metro
bundler + app relaunch, exactly as used for this entire verification. A native rebuild would be
needed only if native code had changed, which it has not.

### Remaining risks

- None identified for this specific bug class after this fix. The two known, independently-fixed
  and cross-verified bugs (representative-collision clobbering, company full-overwrite escalation)
  do not interact with each other or reopen one another, per the combined on-device test above.
- The pre-existing "editing an already-saved card always full-overwrites the company" behavior
  (deliberate, per `leadMergeLogic.ts`'s original design) still applies — a user who intentionally
  clears a company field on a self-edit will still have that field cleared, which is correct,
  intended behavior, not a regression.

---

## ROI / Frame-Only OCR Fix

### Root cause

Verified by reading the actual implementation (not assumed): the on-screen scanning guide
(`CardGuideOverlay.tsx`) was a pure visual overlay — an SVG rectangle computed from
`Dimensions.get('window')` with no connection whatsoever to the camera's capture pipeline.
`ScannerScreen.tsx`'s `handleCapture()` called `cameraRef.current.takePictureAsync()` and passed
the **entire, uncropped photo** straight through to quality analysis, persistence, and (later, in
`finishCapture()`) OCR. Nothing in the codebase ever computed a mapping between the guide
rectangle's screen position and the captured photo's own pixel coordinates. Confirmed as a real,
reproducible problem via a live device test (below) — extraction genuinely picked up unrelated
background content, not merely a theoretical risk.

### Camera preview scaling behavior (verified, not assumed)

- `<CameraView style={StyleSheet.absoluteFill} facing="back" />` — no `resizeMode`/`ratio` prop
  set; expo-camera (`~57.0.4`) exposes no live-preview scale-mode prop at all. The preview surface
  fills the full screen using the platform default, which — like effectively every camera preview
  implementation — is a **cover** fill (fills the view completely, center-cropping whichever
  dimension of the sensor feed overflows; no letterbox/pillarbox bars).
- `takePictureAsync()`'s `ratio` prop was also left unset, so Android's default `CameraRatio`
  applies to the actual captured photo — confirmed empirically on-device: captures came back as
  **3072×4096** (a 3:4 ratio, i.e. the Android default `'4:3'`, reported in portrait orientation).
- This device's screen is **1080×2392** (~0.4515 aspect) — nothing close to the photo's 0.75
  aspect. So the live preview (cover-filling the tall, narrow screen) and the captured photo
  (4:3) are genuinely different shapes, exactly the "cover preview" scenario the task specified —
  not a simplification that could be skipped.
- EXIF rotation: not separately handled or needed — `photo.width`/`photo.height` from
  `takePictureAsync()` already reflect the photo in its final, already-corrected orientation
  (confirmed by the 3072×4096 portrait-shaped values matching the device's portrait holding
  orientation), so the crop coordinates work directly against those reported dimensions.

### Coordinate transformation

New pure, dependency-free module: `src/utils/cardGuideGeometry.ts`.

- `getGuideRect(screenWidth, screenHeight)` — the **single source of truth** for the guide
  rectangle's on-screen position (centered, 86% of screen width, 85.6:54 card aspect ratio).
  `CardGuideOverlay.tsx` was refactored to render from this same function instead of its own
  duplicate constants, so the visible guide and the actual crop can never drift apart.
- `screenRectToImageRect(screenRect, screenSize, imageSize)` — implements the cover-scale
  transform: `coverScale = max(screenW/imageW, screenH/imageH)`, centers the displayed (scaled)
  image over the screen, and converts the screen rectangle into native image pixel coordinates.
  Always clamped to the image's actual bounds (`clampRect`).

### Crop implementation

`ScannerScreen.tsx`'s `handleCapture()`: immediately after `takePictureAsync()`, computes
`roiRect = screenRectToImageRect(getGuideRect(...), screenSize, photoSize)` and crops via
`ImageManipulator.manipulateAsync(photo.uri, [{crop: {originX, originY, width, height}}], ...)` —
`expo-image-manipulator` was already a project dependency (used by the quality-check pipeline);
no new dependency was introduced. **No fallback**: if the crop throws, capture fails outright
(the existing outer `catch` shows "Capture failed") — it never silently proceeds with the
uncropped photo, which would reintroduce the exact bug being fixed.

### Original image preservation

Completely unchanged: `photo.uri` (the full, uncropped capture) is still what
`persistCapturedImage()` saves as `original_front.jpg`/`original_back.jpg`, and `photo.width`/
`photo.height` (the full photo's dimensions) are still what's recorded in `card_images`. Verified
on-device: CARD-000007's `card_images` rows show `width=3072, height=4096` for both sides —
the full original, not the 1590×1003 ROI crop. The ROI crop (`roi.uri`) exists only as a
short-lived `expo-image-manipulator` cache file, referenced solely via new in-memory refs
(`frontRoiUriRef`/`backRoiUriRef`) — it is never written to the app's permanent
`CardScanner/Cards/...` folder structure and never persisted to the database.

### OCR / quality-gate ROI behavior

- Quality analysis: `analyzeImageQuality(roi.uri, {width: roiRect.width, height: roiRect.height})`
  — now runs on the cropped ROI, not the full photo, so background objects outside the frame no
  longer influence the blur/brightness/contrast/content-coverage scoring.
- OCR: `finishCapture()`'s `recognizeCardSide()` calls now use `frontRoiUriRef.current`/
  `backRoiUriRef.current` (the ROI crops) instead of `frontUriRef.current`/`backUriRef.current`
  (the full originals). No fallback path to the full image exists if ROI OCR fails — a failure is
  reported as an OCR failure (existing `OcrUnavailableError`/`OcrTimeoutError`/generic-error
  handling), never silently retried against the uncropped photo.

### Debug capability (Phase 10)

Developer-only, logcat-only (`if (__DEV__) console.log(...)`) — logs `photoSize`, `roiRect`, and
both the original and ROI file URIs on every capture. No new UI, no screen, nothing reachable by a
production user. Used directly for the device verification below (pulled both files via
`adb ... run-as ... cat <path>` using the logged URIs).

### Tests added

`tests/utils/cardGuideGeometry.test.ts` — 14 new tests: `getGuideRect` (centering, aspect ratio,
width fraction, in-bounds for multiple screen sizes), `clampRect` (in-bounds passthrough, negative
clamping, overflow shrinking, fully-outside case), and `screenRectToImageRect` (identical
size/no-op, same-aspect-ratio uniform scaling, a wider image cropped left/right, a taller image
cropped top/bottom, the exact real-world portrait-screen/4:3-photo case with precise numeric
assertions, and oversized-input clamping).

**Jest total: 111/111 passing** (97 before this fix + 14 new). `npx tsc --noEmit`: clean.

### Device test — the critical evidence

Performed the outside-text exclusion test live on the connected Nothing A059P: a monitor
displaying a real business-card design ("SHREERAJ CORPORATION") inside a browser/Canva editor was
photographed with the card guide positioned over just the card design — everything else on screen
(browser tabs and URL bar, Canva's toolbar/sidebar, the desktop, a "BLAUPUNKT" speaker, a keyboard)
was visible in the frame but outside the guide rectangle.

**Before the fix (CARD-000006 — captured with the pre-fix code, no ROI log present in logcat for
this capture, confirming it predates the reload):** `raw_ocr_text` was a multi-hundred-word dump
of browser chrome and desktop UI — literal tab titles ("ChatGPT", "WhatsApp Web", "Telegram"),
Canva sidebar labels ("Templates", "Elements", "Brand", "Uploads", "Tools"), the speaker brand
**"BLAUPUNKT"**, and UI chrome like **"Ask Gemini"** and **"Share"**. Extraction then hallucinated
**six** representative sections from this noise, four of them nonsense: **"Ask Gemini"**, **"Fle
Nese"** (garbled "File"/"Resize" menu text), **"Notes Timer"**, **"Nbroch Shve"** (a garbled
browser tab title) — every one incorrectly carrying the card's real phone number. `department`
even got set to a full canva.com URL.

**After the fix (CARD-000007 — ROI log confirmed: `photoSize: {3072,4096}`,
`roiRect: {x:741, y:1546, width:1590, height:1003}`):** pulled both the original
(`cache/Camera/....jpg`, 3072×4096, 3.67MB) and the ROI crop (`cache/ImageManipulator/....jpg`,
1590×1003, 393KB) directly off the device and visually confirmed the crop contains **only** the
card design — no browser chrome, no monitor bezel, no speaker, no keyboard (one very minor
imperfection: a sliver of Canva's "Page 2 - Add page title" toolbar text at the extreme top edge,
a physical-framing precision artifact, not a coordinate-math error). `raw_ocr_text` dropped to
just the card's own content; `unclassifiedLines` dropped from 60+ garbage entries to 16, all
genuine card text. Extraction produced 2 representative sections (both derived from the card's own
tagline text being split oddly by the clustering heuristic — a separate, pre-existing,
lower-severity extraction nuance, not related to this fix) instead of the previous 6, with zero
hallucinated names and no browser/UI content anywhere in the result. Confirmed live in the Review
screen UI as well as the raw database rows.

This is the strongest possible evidence for this fix: an identical physical scene, captured before
and after the code change, with a dramatic, unambiguous difference in OCR/extraction quality.

### Performance impact

No cloud OCR, no duplicate OCR passes, no full-image OCR fallback. One additional
`ImageManipulator.manipulateAsync` crop call was added per capture (the pipeline already called
this library for the pre-existing quality-analysis downscale step, so this is not a new
dependency, just one more call to it) — negligible cost relative to the OCR call itself, and
strictly smaller/faster downstream: OCR now runs on a **1590×1003 ROI** instead of the full
**3072×4096** photo, so ML Kit processes roughly 5x fewer pixels than before, not more.

### Remaining limitations

- The extraction pipeline's company/person-name heuristics (which line becomes `companyName` vs
  `personName`) are unrelated to this fix and were not changed — CARD-000007 extracted
  `companyName: "CORPORATION"` rather than the full "SHREERAJ CORPORATION" because of how the
  OCR line order was classified, not because of the ROI crop. Worth a separate look if it recurs
  on real cards.
- The minor top-edge Canva-toolbar leak in the CARD-000007 crop reflects the physical test setup's
  imprecise alignment with the guide rectangle, not a flaw in the coordinate transform (confirmed
  correct via the 14 unit tests' exact numeric assertions and the logged `roiRect` matching the
  hand-calculated expected value for these exact dimensions). A user photographing a real physical
  card that fills the guide rectangle cleanly will not see this effect.
- The "cover" preview-scaling assumption is based on expo-camera's documented lack of a
  configurable preview resize mode and near-universal camera-preview convention, cross-checked
  against this device's real capture dimensions — not verified against expo-camera's native Android
  source directly. If a future device/OS update changes this default, the transform would need
  re-verification (the unit tests would still pass, since they test the math in isolation; only
  the "cover" assumption itself would need re-confirming empirically).

### Final success criteria

- [x] OCR processes ONLY frame ROI — verified via logged `roiRect` + pulled ROI image + before/after `raw_ocr_text` comparison
- [x] outside text is ignored — confirmed: no browser/desktop/UI text in the after-fix extraction
- [x] quality gate processes ROI — `analyzeImageQuality(roi.uri, ...)`
- [x] original image remains full-resolution — `card_images` rows confirm 3072x4096
- [x] original image is saved locally — unchanged `persistCapturedImage(photo.uri, ...)` path
- [x] ROI does not replace original — separate ref (`frontRoiUriRef`/`backRoiUriRef`), never written to the permanent folder or database
- [x] coordinate mapping works with actual preview scaling — verified against real device capture dimensions (3072x4096) and screen size (1080x2392)
- [x] portrait/landscape behavior works — `resizeActionForAnalysis` (prior fix) and this ROI crop both use actual reported width/height, no orientation assumption
- [x] no cloud service introduced — 100% on-device, `expo-image-manipulator` (already a dependency)
- [x] no duplicate OCR processing — OCR runs exactly once per side, on the ROI only
- [x] 111 tests passing (97 pre-existing/prior-fix + 14 new — the baseline grew from 93 to 97 during the company-data-loss fix earlier in this session, then to 111 here)
- [x] TypeScript clean
- [x] physical-device test passes — dramatic before/after improvement documented above
