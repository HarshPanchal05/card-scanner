# UI Redesign Report — Industrial Card Scanner

> **Application functionality was intentionally not modified in either pass documented in this
> file.** Every change across both sessions is visual/styling only — colors, spacing, typography,
> icons, layout, and static assets (app icon, splash, favicon). No screen's business logic,
> navigation behavior, database schema, or extraction/OCR/backup/contacts pipeline was touched.

## 2026-09-09 — Branding pass (app icon, splash, remaining screens, brand color)

Continuation of the redesign below, scoped specifically to: a new original app identity
(icon/splash/favicon), the 5 screens/components the prior pass explicitly left untouched, and
extending the existing design system's primary color to match the new brand. No functional QA
campaign was re-run for this pass, per instruction — see "Build verification" below for what was
actually checked.

### App icon, splash screen, favicon (new — never done before this session)

Previously the app shipped Expo's **unmodified default template assets** — a generic gray
target/bullseye graphic on the OS's default white window background for the splash, and a
placeholder icon. Neither had ever been replaced in any prior session.

Designed an original identity (not copied from any reference — an independently designed visual
in a similar language): a rounded-square icon, brand teal background (`#0E8A80`), with a simple
white geometric symbol — four viewfinder corner brackets framing a small rounded-rectangle "card",
deliberately echoing the in-app Scanner screen's own corner-bracket guide overlay
(`CardGuideOverlay.tsx`) so the app icon and the product's actual scanning UI share one visual
language rather than being unrelated marks.

Built as SVG, rasterized with `sharp` (installed as a one-off scratch-directory tool, not added to
the project's `package.json` — no new project dependency) to every required size:

- `assets/icon.png` (1024×1024), `assets/android-icon-foreground.png`,
  `assets/android-icon-background.png`, `assets/android-icon-monochrome.png` (Android 13+ themed
  icon support — already wired in `app.json`, just needed real artwork), `assets/splash-icon.png`,
  `assets/favicon.png` — the exact files `app.json` already referenced.
- Native Android launcher icons regenerated at all 5 densities (`mdpi`→`xxxhdpi`) as PNG:
  `ic_launcher`, `ic_launcher_round` (legacy/pre-Android-8 fallback) and `ic_launcher_foreground` /
  `ic_launcher_background` / `ic_launcher_monochrome` (the adaptive-icon layers the existing
  `mipmap-anydpi-v26/ic_launcher.xml` already references). The old placeholder `.webp` files at
  each density were deleted when replaced, to avoid an Android duplicate-resource build error from
  having both a `.webp` and a `.png` with the same resource name.
- **Splash screen**: found the actual native mechanism (`Theme.App.SplashScreen` in `styles.xml`
  sets `android:windowBackground` directly to `@drawable/splashscreen_logo`) — the existing
  per-density `splashscreen_logo.png` files were a small icon on a **transparent** canvas, relying
  on the OS's default white window background showing through, which is why the splash looked like
  a plain white screen with a small gray graphic rather than a branded splash. Replaced with a
  fully opaque, brand-teal composite (background + centered white symbol baked into one image) at
  each of the same 5 exact pixel dimensions the originals used (288/432/576/864/1152), so the
  splash now genuinely matches the new icon rather than depending on an unrelated theme default.
- No animation, no new dependency, no added startup delay — same static-drawable mechanism as
  before, just correct artwork.

### Primary brand color extended into the app itself

The existing design system (`src/constants/theme.ts`) already centralizes every color as a single
token used everywhere — confirmed via a full `src/` grep for hardcoded hex colors: **zero** in any
screen, one intentional exception in `CardGuideOverlay.tsx` (a plain white camera-overlay
constant, deliberately left untouched — that file's exact pixel geometry is explicitly
QA-verified and out of scope). Given that discipline was already in place, retinting the whole app
to match the new brand teal was a single low-risk token change:

- `colors.primary`: `#0B3D66` (navy) → `#0E8A80` (the new brand teal, matching the icon exactly)
- `colors.primaryDark`: `#082C4A` → `#0A6960`
- Added `colors.primaryLight` (`#E3F3F1`) — a new token for light-tint states (e.g. a selected-row
  background), used in the Events screen's "currently selected" row treatment.
- `android/app/src/main/res/values/colors.xml`: `iconBackground` and `colorPrimary` updated to the
  same teal, so the Android theme's own accent color (task switcher, etc.) matches too.

Every screen already redesigned in the prior pass (Dashboard, Scanner, Settings, Review, Card
Library, Card Detail, Reports, Storage, Backup & Restore) picks up the new brand color
automatically through this one shared token — no per-screen edits needed or made.

### The 5 previously-untouched screens/components — now polished

The prior pass's own "Remaining issues" section named these explicitly as not having received a
bespoke pass. Each got the same treatment already applied elsewhere (shadowed cards over flat
borders, `touchTarget.minHeight`-compliant tap targets, icons from the existing
`src/constants/icons.ts` mapping, consistent radius/spacing) — **JSX structure and all handlers/
state/logic left untouched**, styling and icon additions only:

- **`EventsScreen.tsx`** — event rows are now shadowed cards (was flat-bordered); the "current
  event" indicator is a small filled checkmark badge instead of an inline `✓` character;
  Rename/Archive are now real pill-shaped icon+text buttons with adequate touch targets instead of
  bare `Text` links; added an `EmptyState` for the zero-events case (there wasn't one before); both
  modals gained a shadow and consistent input/button padding. Two new icons added to the shared
  map (`archive`, `checkmark`) — nothing invented outside that centralized file.
- **`DuplicateModal.tsx`** — added a warning-icon header treatment (matches the "errors/warnings
  should be visually distinct" brief); match rows switched from a flat bordered list to shadowed
  cards with a pressed state and truncation (`numberOfLines`) on company/representative names that
  could otherwise overflow.
- **`CategoryPicker.tsx`** — chips and the custom-category input/Add button now meet the 44–48dp
  touch-target minimum (previously relying on small implicit padding); Add button gained an icon.
- **`PhoneListEditor.tsx`** — this was the exact component a mis-tap landed on during the prior
  session's device QA (an "Add phone number" link sitting close to a "Remove" text link with a
  small hit area). Remove is now a fixed 52×52 icon button (trash icon, danger-colored, clearly
  destructive per the brief's own requirement) with real spacing from the phone-type pill, directly
  closing that exact class of mis-tap risk as a side effect of the general touch-target fix — not
  a functional change, the remove/add/cycle-type logic is byte-for-byte identical.
- **`ImageViewer.tsx`** (fullscreen pinch-zoom photo viewer) — Close changed from a text label to a
  standard circular icon button (matches the "minimal, not gaming-UI" direction for a fullscreen
  photo viewer) with a proper touch target; front/back tabs gained `accessibilityState` and a
  guaranteed minimum height.

### Build verification

`npx tsc --noEmit`: clean. `npm test`: **115/115 passing** (unchanged — no test needed updating,
since no logic changed). All 5 icon-related source assets plus all 25 generated native density
files (5 densities × 5 files) plus the 5 new splash composites — 36 files total — were validated as
well-formed, correctly-sized PNGs (re-read via `sharp` metadata, zero failures). Checked for
duplicate Android resources (the old `.webp` launcher files were removed when replaced — confirmed
no `.webp`/`.png` name collisions remain in any `mipmap-*` folder, which would otherwise be a hard
Gradle build error).

**A full `gradlew assembleRelease` was not run in this pass.** This machine's available RAM was
critically low (under 1 GB free) because the user had independently restarted their own unrelated
project's dev/test processes for active work of their own during this session — unlike the earlier
release-build session, interrupting that again wasn't warranted for a lower-stakes verification
build. Since this pass changed only static PNG assets and existing, already-well-formed XML color
values (no Kotlin/Java/Gradle/manifest changes), and every check above passed, the risk of a build
failure is low — but this is explicitly flagged rather than silently claimed as build-verified.
Recommend a real `assembleRelease` (or `expo run:android`) before the next physical-device release
pass, whenever the machine has headroom, to see the new icon/splash actually rendered on-device.

### Reference image

The task referenced an attached style-reference image; none was actually present in the message
received. Proceeded from the detailed text description alone (turquoise/teal, rounded-square,
simple white geometric symbol, minimal, high-contrast) — flagged to the user rather than guessing
silently, per instruction to create an original design in a *similar* language regardless.

---

# UI Redesign Report — Industrial Card Scanner

**UI REDESIGN STATUS: COMPLETE FOR HIGH-PRIORITY SCREENS / PARTIAL FOR THE REST** — see "Screens
redesigned" below for the honest per-screen breakdown. This was not a small task; it was scoped
pragmatically to deliver a genuinely thorough redesign of the screens used dozens of times per day
during a scan session, plus a consistent, real (not shallow) visual upgrade everywhere else via a
shared, extended design system — rather than a shallow pass across all 10 screens.

**FUNCTIONAL REGRESSION: NONE FOUND** — 111/111 Jest tests passing throughout every step, `npx tsc
--noEmit` clean throughout, and live device verification (below) exercised the real capture → OCR
→ extraction → save → library → detail → edit → report-generation path with real data and found
no behavioral change anywhere.

**VISUAL QA: PASS** — every touched screen inspected live on the connected device.

**DEVICE QA: PASS** — no crashes, no logcat errors, across a full relaunch-and-navigate pass.

---

## Original UI problems (from `docs/UI_REDESIGN_PLAN.md`'s audit)

1. Tab bar icons were literal Unicode text glyphs (`⌂ ▤ ▦ ⚙`), not a real icon set.
2. No shadow/elevation tokens anywhere — every surface used a flat 1px border only.
3. No "Large Title"-style typography step for strong top-of-screen hierarchy.
4. Dashboard had no glanceable "Recent Cards" list, just a dense 6-tile stat grid.
5. Settings was a flat, ungrouped list — no iOS-style grouped sections.
6. Dangerous actions (Delete Card, Delete All Cards) had no visual separation from safe actions.
7. No accessibility labels on primary actions (Scan, Capture, Save, Edit, Delete, Save to Contacts).

## New design system

Extended `src/constants/theme.ts` **in place** — every original key kept its exact original value
(zero breaking changes for any of the 8 screens/9 components that already import from it):

- **Colors:** added `secondaryBackground`, `elevatedSurface`, `divider`, `tertiaryText` — filled
  real gaps in the existing palette rather than replacing it.
- **Spacing:** added `ms` (12) and `ml` (20) between the existing steps — now 4/8/12/16/20/24/32/48.
- **Radius:** the one deliberate value change — `sm/md/lg` softened from 6/10/16 to 10/14/18 (plus
  a new `xl`=24). This is the single highest-leverage change in the whole redesign: every rounded
  surface in the entire app — including every screen not otherwise touched — picked up a visibly
  softer, more premium corner radius automatically, with zero risk (pure visual constant).
- **Typography:** added `largeTitle` (34/700), `title`, `headline`, `secondary`, `navLabel` —
  the brief's requested hierarchy — alongside (not replacing) the original `h1/h2/h3/body/caption`.
- **Shadow:** new `shadow.low`/`shadow.medium` — two restrained elevation levels (Android
  `elevation` + matching iOS shadow props), used to replace flat borders on primary surfaces
  (stat tiles, card rows, action bars, representative cards) — deliberately not stacked or heavy.
- **Icons:** `@expo/vector-icons` added as the one new, well-justified dependency (zero native
  config — bundled as a font, works in the existing Expo dev-client setup) — `Ionicons` specifically
  for its close visual kinship to SF Symbols. `src/constants/icons.ts` centralizes every icon
  choice in one place so the same concept (a phone, a company, a delete action) always gets the
  same glyph everywhere it appears.
- **Dark mode: explicitly out of scope.** The theme file's own pre-existing comment documents a
  deliberate decision — this app is used on a bright expo floor and always renders one
  high-contrast light theme. Implementing a dark variant would fight that existing, reasoned
  architectural choice for no real benefit to the stated use case. Flagged rather than silently
  skipped, per the task's own "STOP and explain" rule for exactly this kind of judgment call.

## Screens redesigned

**Full redesign** (new layout, new components, not just re-skinned styles):
- **Dashboard** — `Text` greeting → real `largeTitle`; stat grid rebuilt with icons + shadowed
  elevated tiles; new **Recent Cards** list (reuses the existing `listCards({limit: 5})` repository
  query — no new data-layer code); quick links got icons + chevrons.
- **Scanner (camera)** — the guide overlay was rebuilt from a plain rectangle outline into
  iOS-style animated corner brackets, with a state-aware pulse animation and a secondary hint line
  ("Keep the card steady and well lit"). **The guide's bounding box (`getGuideRect()`) was never
  touched** — see "ROI regression" below for the verification. Permission screens got an icon
  treatment; the processing screen got a real `ActivityIndicator` instead of static text.
- **Settings** — rebuilt from a flat list into iOS-Settings-style grouped sections (`DATA` / `ABOUT`
  labels, one rounded card per group, icon + chevron per row, hairline dividers between rows).

**Styles-only redesign** (JSX structure/logic untouched, visual treatment upgraded via the new
tokens — deliberately lower-risk for screens with complex state):
- **Review** (565 lines, the most complex screen — company/representative(s)/phone/email/address
  editing, save, duplicate handling) — input fields, the card-ID badge, and the action bar were
  restyled; **`RepresentativeFormSection`** (used by Review) got a real card treatment (elevated
  surface, shadow, small avatar icon) specifically for the multi-representative case, while
  staying byte-for-byte unwrapped/flat for the single-representative case — preserving the
  existing, explicitly-documented "visually identical to the previous flat form" guarantee.
- **Card Library** — search bar and filter button got icons; `CardListItem` moved from a flat
  bordered row to an elevated shadowed card with colored status pills (green "Saved", amber
  "Needs Review"); the filter modal got a larger corner radius and shadow.
- **Card Detail** — hero image/company name typography upgraded; representative cards elevated;
  Website/Address/Notes sections got matching icons; **Delete Card is now visually separated from
  Edit** by a hairline divider and extra spacing (Phase 12's explicit requirement).
- **Reports** — Generate/Share buttons got icons; the result card got a green checkmark + shadow.
- **Storage** — usage card elevated; **Delete All Cards now has an explicit red warning row**
  ("This action cannot be undone. Consider a backup first.") visually separated from the safe
  "Clear Temporary Files" action above it, matching Phase 17's explicit requirement.
- **Backup & Restore** — added a "what's included" checklist (Card information / Company
  information / Representatives / Original card photos — Phase 18's explicit example) above the
  Export button; result card elevated with a success icon.

**Not touched this pass** (inherits the global token improvements — softer radius, richer palette
— automatically, since every screen already imports from the shared theme, but did not get a
bespoke layout/component pass): `EventsScreen.tsx`, `DuplicateModal.tsx`, `CategoryPicker.tsx`,
`PhoneListEditor.tsx`, `ImageViewer.tsx`. Flagging this honestly rather than claiming a complete
36-phase pass — these are lower-traffic screens (Events is opened rarely; the others are
sub-components already reasonably designed) and were deprioritized in favor of doing the
high-traffic screens thoroughly within a realistic scope.

## Components created/extended

`PrimaryButton` — added `accessibilityLabel`/`accessibilityRole`/`accessibilityState` (every
button in the app that uses this component — the large majority — gained proper accessibility
support from this one change). `Basics.tsx`'s `SectionHeader` gained an optional `icon` prop;
`EmptyState` gained optional `icon`/`action` props — both purely additive, every existing caller
unaffected. No new component files were created beyond `src/constants/icons.ts` (a data module,
not a component) — the brief's suggested component list (`AppHeader`, `Screen`, `ListRow`, etc.)
was judged unnecessary overhead for the actual number of unique layouts in this app; extending the
existing, already-used `Basics.tsx` primitives served the same goal with less new surface area.

## Navigation changes

Tab bar icons replaced with real `Ionicons` (filled when active, outline when inactive — the
standard iOS pattern), tab bar given a divider line and slightly taller touch area. The
Scanner-as-a-stack-push-from-a-prominent-Dashboard-button architecture was **deliberately kept**
rather than restructured into a 5th "Scan" tab as the brief's example layout suggested — Scan
already has strong visual priority (a full-width primary button, first thing below the greeting),
and folding the camera screen's front/back/processing state machine into the tab navigator would
have been a real navigation-architecture change with no clear benefit over the existing, working
approach. Documented here as the one structural recommendation not adopted, with reasoning, rather
than silently doing something different from what was asked.

## Accessibility improvements

`PrimaryButton` (used for nearly every primary action app-wide) now sets `accessibilityRole="button"`,
a real `accessibilityLabel` (falls back to the visible label text), and `accessibilityState`
reflecting disabled/loading. Explicit labels added to: Scan Card, Capture card photo, Grant Camera
Access/Open Settings, Edit card, Delete card, Save Changes/Save Lead, Save to Contacts, search
input, filter button, and each card-library row (announces company + representative together).
Touch targets were not shrunk anywhere; `touchTarget.minHeight=52` is unchanged.

## Performance considerations

No new list-rendering approach was introduced (`CardListItem` already used thumbnails, not full
originals — verified during the audit and preserved). No heavy animation library was added — the
Scanner frame's idle-state pulse uses React Native's built-in `Animated` API with
`useNativeDriver: true` (already how the codebase's other animations work). `@expo/vector-icons`
is a single font-based icon set, not a per-icon image asset — negligible bundle/runtime cost.
Dashboard's new "Recent Cards" list is capped at `limit: 5` via the existing `listCards()` query's
own pagination parameter — no unbounded query added.

## Device testing (Nothing A059P, physical)

Performed live, with real app data (not mocked): relaunched the app fresh after each major batch
of changes; confirmed no crash and no logcat error (`FATAL`/`AndroidRuntime`/`TypeError`/
`cannot read propert*`/`undefined is not*` — all searched, none found) at each checkpoint.
Screenshots captured and visually inspected for: Dashboard (stat tiles, Recent Cards populated
with real "Planet Automotive Pvt. Ltd." / "Unknown Company" entries, event banner), Scanner (the
new corner-bracket frame, confirmed occupying the identical position/size as the pre-redesign
screenshots on this same device), Card Library (elevated rows, colored status pills, real card
photos), Card Detail (elevated representative card, separated danger zone), Settings (grouped
DATA/ABOUT sections), Storage (separated red warning + Delete All Cards), Reports (generated a
real Excel report through the actual `generateExcelReport()` pipeline — confirmed a real file path
under `CardScanner/Reports/...` and a working "Share Report" button, proving report generation
itself is completely unaffected), Review (both the single-representative flat layout and, from
earlier in the session, the multi-representative card layout).

### ROI regression check (Phase 31's hard requirement)

`src/utils/cardGuideGeometry.ts`'s `getGuideRect()` — the function that defines both what the user
sees and what gets cropped for OCR — was **not modified** in this redesign; only
`CardGuideOverlay.tsx`'s rendering of that same rectangle changed (a full stroked rectangle →
corner brackets, same bounding box). Verified three ways:
1. **Code-level:** `CardGuideOverlay.tsx` still computes `GUIDE_RECT = getGuideRect(SCREEN_WIDTH,
   SCREEN_HEIGHT)` identically and renders all four corner brackets within that exact
   `GUIDE_WIDTH x GUIDE_HEIGHT` box — no new offset/inset was introduced beyond the brackets' own
   stroke thickness (a cosmetic detail, same as the original rectangle's existing 2px inset).
2. **Automated:** all 111 tests still pass, including the 14 `cardGuideGeometry.test.ts` tests
   added earlier this session that assert exact pixel values for `getGuideRect`/
   `screenRectToImageRect` — none of that math was touched, so these remain valid, current proof.
3. **Visual, on-device:** the corner-bracket frame screenshot (`.qa_shots/91_redesign_scanner.png`)
   shows the frame at the identical screen position/size as every pre-redesign Scanner screenshot
   taken earlier this session on this same device — a direct visual confirmation the crop
   geometry did not shift.

## TypeScript / Jest result

`npx tsc --noEmit`: **clean** at every checkpoint throughout this redesign (verified after each
file change, not just once at the end). `npm test`: **111/111 passing** throughout — unchanged
from the pre-redesign baseline (no test needed updating, since no business logic changed).

## Remaining issues / honest limitations

- **EventsScreen, DuplicateModal, CategoryPicker, PhoneListEditor, ImageViewer** did not get a
  bespoke visual pass — they render with the improved global tokens (softer radius, richer
  palette) but not custom layouts. Reasonable next candidates if further design work is wanted.
- **No dark mode** — deliberate, see "New design system" above.
- **No micro-interaction layer beyond what existed** (button press states, the Scanner's idle
  pulse) — list-item insertion animations, screen-transition customization, and haptic feedback on
  save/capture (Phase 24) were not added; `expo-haptics` is already a dependency and already used
  for capture success/failure, so this would be a natural, low-risk follow-up if wanted, but was
  not undertaken here to keep this pass focused on structural/visual clarity first.
- **Toast/inline-feedback primitive** (Phase 22) was not built — `Alert.alert()` is still used for
  all confirmations and errors, unchanged from before. Flagged in the Phase 1 audit as a real,
  identified problem, but not fixed in this pass; doing it properly (a non-blocking toast queue)
  is a self-contained follow-up that didn't need to block the higher-priority screen work.
- **Report Preview screen** (Phase 15) doesn't exist as a separate screen in the current
  architecture (Reports generates directly, no intermediate preview step) — nothing was added
  here since it would be a genuine new feature, not a redesign of something existing, and the task
  explicitly scoped this as a UI redesign of existing functionality.
