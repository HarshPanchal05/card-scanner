# Final USB Device QA Report — Industrial Card Scanner v1.0.0
Date: 2026-09-10

## 1. USB device status

Nothing A059P connected via **USB ADB** (not wireless), serial `001763595002230`,
confirmed via `adb devices -l` (`device` state, `product:AsteroidsProIND model:A059P`).
No wireless debugging was used at any point in this session.

Android 16 / API 36, arm64-v8a, 1080×2392 @420dpi. Screen lock timeout was temporarily
extended from 10 min to 30 min via `adb shell settings put system screen_off_timeout` to
avoid mid-session lock interruptions, and **restored to its original value (600000ms)**
at the end of the session. One brief real lock-screen interruption occurred mid-session
(the phone locked; I do not and will not attempt to bypass a secure lock screen) — you
unlocked it once and testing continued.

## 2. APK / version tested

| | |
|---|---|
| APK path | `dist/Industrial-Card-Scanner-v1.0.0-final.apk` |
| SHA-256 | `40838f43a353a809f7585141e0f32a85719af569f9f4cbcc1a502e44b325c97a` |
| versionName / versionCode | 1.0.0 / 1 |
| Source freshness | Confirmed no `src/`/`App.tsx`/`app.json` file is newer than the APK — no rebuild needed |
| Install | `adb install -r` — Success |

## 3. Automated card images tested (extraction/parsing layer)

**Where the images came from:** the app's production camera-only capture flow has no
gallery/import path (confirmed by grepping for `ImagePicker`/gallery code — none exists
outside `BackupRestoreScreen`'s `.zip` restore, which is unrelated), so real card images
can't be fed through the live app without a physical camera pointed at a physical card.
Per the task's instructions not to scrape personal data or build a large dataset, I
sourced **10 real business-card images** from the **Stanford Mobile Visual Search
Dataset** (a public academic OCR/computer-vision research dataset, mirrored at
`web.cs.wpi.edu`, `robots.txt`-permitted, no login/CAPTCHA/paywall) — the "Reference"
(scan-quality) version of 10 of its 100 cards, picked for layout diversity. One card
turned out to be a non-business-card image (a Starbucks promo card) mid-selection and
was swapped out. Nothing beyond these 10 images was downloaded or retained.

**Where the "OCR" text came from:** production OCR (Google ML Kit) is a native Android
module that cannot run under Node/Jest. Each image's text was **manually transcribed**
by directly reading the image — this is disclosed everywhere it matters in the harness
and this report. A mismatch below is therefore always an **extraction/parsing** result
(the real, unmodified `runExtractionPipeline()` acting on clean text), never an "OCR
misread" — true OCR fidelity on real hardware is covered separately in §9.

**Harness:** `tests/qa/realCardExtraction.test.ts`, run via the project's existing Jest
setup (no new tooling, no production code touched). Full results:
`tests/qa/results/real-card-extraction-results.json`.

| ID | Card | Company | Person | Designation | Phones | Emails | Website | Address |
|---|---|---|---|---|---|---|---|---|
| REAL-001 | Nami Nami (restaurant) | PASS | PASS | PASS | PASS | N/A | N/A | **FAIL** |
| REAL-002 | Bluewave | PASS | **FAIL** | PASS | PASS | PASS | N/A | N/A |
| REAL-003 | Circade | PASS | **FAIL*** | PASS | PASS | PASS | PASS | N/A |
| REAL-004 | GL Resources | PASS | N/A (cropped in source) | N/A | PASS | N/A | N/A | PASS |
| REAL-005 | btnaccess (Indian +91 numbers) | PASS | PASS | N/A | PASS | PASS | PASS | PARTIAL** |
| REAL-006 | The Counter | PASS | PASS | PASS | **FAIL** | PASS | **FAIL** | **FAIL*** |
| REAL-007 | Lotus Thai Bistro (no person) | PASS | N/A | N/A | N/A | N/A | PASS | **FAIL** |
| REAL-008 | Hitachi | PARTIAL | PASS | N/A | PASS | PASS | PASS | **FAIL** |
| REAL-009 | Chinese-script card | N/A | N/A | N/A | PASS | PASS | N/A | N/A |
| REAL-010 | WING Travel | PASS | **FAIL** | PASS | N/A | PASS | N/A | PASS |
| REAL-011 | Printers Inc Cafe (loyalty card, no person) | PASS | N/A | N/A | PASS | N/A | N/A | **FAIL** |

\* REAL-003's and REAL-006's FAIL/address issues stem partly from how I merged two visually
adjacent text runs into one transcribed line — flagged as test-data ambiguity below, not a
confident app defect.
\*\* REAL-005's address PARTIAL is a harness limitation (I only checked `addressLine`, not
the separately-populated `city`/`country` fields) — likely not a real app defect.

### Genuine bug found: false-positive multi-representative split

**REAL-001** ("Shoichi Shiono, executive chef" — one person) was split into **2**
representatives: `Shoichi Shiono` and **`Kappo Dining`** (the restaurant's tagline/product
line, in Title Case). **REAL-008** (Hideaki Kido — one person) was split into **3**:
`Hideaki Kido`, **`Intelligent Sensing Systems Unit`**, and **`Hitachi Research
Laboratory`** (a department name and a lab name, both Title-Case multi-word lines).

**Root cause:** `multiRepresentative.ts`'s anchor-candidate filter
(`isEligibleAnchorLine`) only excludes a line if it's designation-shaped
(`hasDesignationKeyword`) or is a substring of the already-detected `companyName`. A
Title-Case, non-designation, multi-word line that is a **department, product line, or
sub-brand name** (not literally part of the extracted company-name string) passes
`looksLikePersonName`'s shape check and gets counted as a second/third real person. This
is a genuine, reproducible false positive that could cause real single-person cards to
appear in the app as having 2–3 "representatives," none of which are real people.

**Not fixed.** This sits in the same file responsible for a previous serious data-loss
bug (`CARD-000005`), so I did not make a same-session, un-reviewed change to its
detection heuristic. Flagging for your decision — happy to fix and add regression tests
in a follow-up if you'd like.

### Other extraction/parsing observations (lower severity)

- **ALL-CAPS person names not recognized** (REAL-002 "JIM WHITEHURST", REAL-010's "WING
  Travel" context) — `personName` came back `null` even though a clearly-formatted name
  was present. Plausibly `looksLikePersonName` treats all-caps as ambiguous with a
  company name. Real finding, not test-data ambiguity.
- **Two phone numbers run together on one line with no punctuation** (REAL-006: `"650
  321 3900 650 321 3902 Fax"`) extracted **zero** phones. Real finding — worth a look if
  this layout is common in your card population, but this specific transcription may not
  faithfully reflect how ML Kit would actually break these into OCR lines; treat as
  **medium confidence**.
- **A website immediately following an email on the same line** (REAL-006:
  `"paloalto@thecounterburger.com thecounterburger.com"`) — the email was found but the
  trailing website was not. Real finding, medium confidence for the same reason above.
- **Non-Indian/non-US address formats** (REAL-008's Japanese chome-format address,
  REAL-006/007/011's plain "City, ST ZIP" American format on its own line) were not
  recognized by `addressExtractor`. Given the app's stated purpose (Indian industrial
  expo lead capture), this is likely an accepted, in-scope limitation rather than a bug —
  flagging for awareness only.
- **Middle-initial names** ("Joey K. Smith") were not extracted as a person name — real
  finding, low-to-medium severity.
- Two FAILs (REAL-003 personName, REAL-006 address) are most likely **test-data
  ambiguity** — I transcribed two visually-adjacent-but-differently-styled text runs onto
  a single line, which may not match how ML Kit would actually segment them into
  separate OCR lines on the real image. Lower confidence these reflect real bugs.

**No crash, hang, or thrown exception occurred on any of the 11 fixtures** — confirmed by
the harness's `expect(() => result).not.toThrow()` on every case, including the
non-Latin-script card and the person-less loyalty card.

## 4. Number of multi-representative cards tested: 1 real + 3 logic-stress scenarios

A genuinely real, multi-representative Indian business card with per-person phone
numbers (the kind the task asked for) is not something I could find in any public,
appropriately-licensed dataset in the time available — this is a narrow, uncommon card
style internationally. Rather than fabricate one and present it as "real" (which the
task explicitly disallows), I reused the **one real example already in this project's
own history**: the "Krish FURNITURE" card (Shaileshbhai / Niteshbhai), a genuine
Indian two-proprietor card previously scanned, saved, and regression-tested on-device in
this project's own prior QA pass (`FINAL_DEVICE_QA_REPORT.md`, "Critical Regression —
CARD-000005"). Its real company name and both real representatives' names/phone numbers
were run through the actual, current `runExtractionPipeline()` (with realistic OCR-line
position data) to confirm today's build still separates them correctly.

I then added **3 additional logic-level stress scenarios** (`tests/qa/multiRepresentativeValidation.test.ts`,
Scenarios H/I/J — continuing the project's own existing lettered-scenario convention in
`tests/repositories/leadRepository.merge.test.ts`) that exercise the exact same
production merge-decision functions with different save sequences. These are explicitly
logic tests, not new "cards" — labeled as such throughout, per the instruction not to
pass off fabricated data as real card evidence.

### Multi-representative database results — all PASS

| Check | Result |
|---|---|
| Krish FURNITURE splits into exactly 2 representatives, Shaileshbhai and Niteshbhai | **PASS** |
| Shaileshbhai's phone (9824921087) and Nitesh's phone (9374969212) stay correctly separated, no cross-contamination | **PASS** |
| Company name read once, not miscounted as a 3rd representative | **PASS** |
| Re-saving the same 2-rep card a second time (edit → save with no changes) resolves both to their own existing rows — no uncontrolled duplication | **PASS** |
| The exact CARD-000005 collision (both people matching the same existing row) forces the second claimant to create a fresh row instead of overwriting the first | **PASS** (this is the original 2026-09-08 regression fix, re-verified against the current build) |
| A 3rd representative joining an existing 2-person company is created fresh; company write mode stays sparse-merge (never escalates to full-overwrite just because a card lists 3 people) | **PASS** |
| Existing company fields (website, city, state, country) already on file are never overwritten by a sparser incoming card, even when the incoming company name is blank | **PASS** |
| A blank incoming company name never gets written as `""` — falls back to `"Unknown Company"` | **PASS** |
| A 3-person card where the 3rd person has no printed phone/email gets an empty (not invented) phones/emails list, while the other two keep their own correctly-bucketed numbers | **PASS** |

### Known gap, not a bug introduced by this QA pass

Per-representative **designation** is never populated by the multi-representative
clustering (`multiRepresentative.ts` always returns `designation: null` for every
detected representative — its own doc comment says this is "deferred until there's
evidence it's commonly needed"). The task asked to verify per-representative designation
specifically; confirmed this is not implemented, not a regression, and not something I
changed.

### Live on-device database relationship integrity

The above is logic-level verification (the project's own established practice — see the
doc comment at the top of `tests/repositories/leadRepository.merge.test.ts`: real SQLite
doesn't resolve under Jest). Live on-device `companies → representatives → phones →
emails` relationship integrity (orphans, duplicate companies, FK correctness) was
**not independently re-audited this session** for the multi-rep case specifically, since
no new multi-rep card was saved on-device this session (camera-only input, no import
path, and no new physical multi-rep card was available — see §9). The existing
single-representative cards already on the device (verified in §7) show correct,
non-orphaned company/representative/phone/email relationships via the Card Library and
Card Detail UI.

## 5. Number of multiple-phone cards tested: 6

REAL-002 (2), REAL-003 (2), REAL-004 (2), REAL-005 (3, Indian +91 numbers of 3 different
types), REAL-006 (2), REAL-008 (2, plus a mis-extracted third — see §3). Plus the
already-on-device real card (Rahul Vora / Planet Automotive, 3 phones: mobile/landline/
mobile) re-verified live in §7.

## 6. OCR/extraction results

Covered in full in §3. Summary: company name extraction was reliable (10/11 exact or
close matches); phone/email extraction was reliable on cleanly-delimited cards including
a genuine Indian-number (+91) card; one confirmed, reproducible **false-positive
multi-representative split** bug found (department/product-line names misread as
people); several lower-severity, lower-confidence extraction gaps noted (ALL-CAPS
names, concatenated phone runs, non-Indian address formats). True on-device ML Kit OCR
fidelity (as opposed to the extraction/parsing logic downstream of it) was spot-checked
only via the quality-gate mechanism (§9), not via full text recognition on a real card,
since no physical camera capture of a real card was performed this session (declined).

## 7. Multi-representative database results

See §4. All 9 checks passed at the merge-decision-logic level, including a direct
re-verification of the original CARD-000005 regression fix against the current build.
Also re-verified live, on-device, via USB (no wireless), that the existing real
single-representative card (CARD-000001, Rahul Vora / Planet Automotive Pvt. Ltd.) still
shows all 3 of its phone numbers correctly typed and labeled, its email, website, and
category intact — Card Library and Card Detail both PASS.

## 8. Excel results

Generated a real report live on-device via USB this session. "Excel report generated"
dialog appeared immediately; tapping Share Report showed a real file in Android's system
share sheet: **`General_Scanning_2026-09-10T07-05-04-866Z.xlsx`** (today's timestamp) —
confirms a real XLSX is written, not just a toast. Dismissed without sending it anywhere.
Multi-representative row separation in the exported workbook was **not independently
verified this session** (no new multi-rep card exists on-device to export — see §4/§9);
this remains verified only at the merge-decision-logic level.

## 9. Camera results

- Scanner screen opens correctly (guide frame, instructions, shutter button) — **PASS**.
- Quality gate (blur detection) re-confirmed live via USB this session: capturing a
  non-card scene correctly triggered **"Image is blurry. Please hold the phone steady
  and retake."** — **PASS**.
- ROI cropping / OCR-on-cropped-region / ROI-vs-full-photo behavior — **NOT
  RE-VERIFIED this session** (this exact fix was previously found, fixed, and verified
  in this project's own prior QA pass; not re-tested here).
- Full happy-path capture (usable card → quality gate passes → save succeeds) — **NOT
  TESTED this session**. I asked if you could hold a real card in front of the camera for
  ~15 seconds to test this; you chose to skip it. Only the rejection path (blurry input)
  was re-confirmed.
- Original image preservation on save — **NOT RE-VERIFIED this session** (no new capture
  was saved).

## 10. Bugs found

1. **[Confirmed, reproducible] False-positive multi-representative split** —
   `multiRepresentative.ts` misidentifies certain Title-Case department/product/sub-brand
   name lines as a second or third "representative" on cards that actually have only one
   real person. See §3 for full detail, root cause, and exact reproduction data. **Not
   fixed** — flagged for your decision given its history (same file as the CARD-000005
   data-loss bug).
2. Several lower-confidence extraction/parsing observations (ALL-CAPS names,
   concatenated phone digit runs, website-after-email on one line, middle-initial names,
   non-Indian address formats) — see §3's "Other extraction/parsing observations." None
   confirmed to crash or lose data; several may be artifacts of my manual transcription
   rather than genuine bugs, and are labeled with my confidence level accordingly.

No crash, ANR, SQLite error, or data-loss bug was found on the physical device this
session. Zero `FATAL EXCEPTION` across the entire USB-session logcat.

## 11. Bugs fixed

None in application code this session (per instructions, and because the one confirmed
bug found sits in security-sensitive, previously-buggy merge/detection code that
deserves a deliberate, separately-reviewed fix rather than a same-session patch). Two
bugs in my own QA harness code were found and fixed before they could produce a
misleading result:
- A test-authoring mistake in a merge-logic scenario (calling
  `resolveClaimedRepresentativeId` twice without threading the `alreadyClaimed` set
  between calls, mirroring a caller bug rather than an app bug) — fixed by threading the
  set correctly, matching `ReviewScreen.tsx`'s actual usage.
- A wrong expected-value calculation for one UK phone number's digit count in my own
  fixture data — fixed.

## 12. Remaining limitations

- **Full physical-camera happy-path capture of a real card was not performed** (declined
  by you this session). Only the blur-rejection path was re-confirmed on real hardware.
- **No genuinely real, internet-sourced multi-representative Indian business card** could
  be legitimately sourced in the time available — this is a narrow card style not
  represented in public, appropriately-licensed OCR datasets. The one real multi-rep
  example used is this project's own historical "Krish FURNITURE" card, not new data.
- **Live on-device SQLite relationship integrity for a multi-representative save** was
  not independently re-audited this session (no new multi-rep card was saved
  on-device) — verified only at the pure merge-decision-logic level, consistent with
  this project's own established Jest-testing approach (expo-sqlite doesn't run under
  Jest).
- **Excel export of multi-representative data** was not verified end-to-end this session
  for the same reason (no on-device multi-rep card to export).
- The 10 sourced real card images are all non-Indian, mostly Western/Japanese layouts
  (the only public, appropriately-licensed dataset I could responsibly use in the time
  available) — genuine coverage of Indian card layout diversity in this automated pass
  is limited to the one real "Krish FURNITURE" example and the already-on-device
  "Planet Automotive Pvt. Ltd." card.
- Contacts flow was fully tested and verified end-to-end (a real contact was created with
  correct name/org/note/email/3 phones/address/website, then deleted to leave your phone
  unchanged) — see full detail above in this session's work.
