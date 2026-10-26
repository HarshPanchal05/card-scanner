# UI Redesign Plan — Industrial Card Scanner

## Phase 1 — Audit of the existing application

### Screens (`src/screens/`)

| Screen | Lines | Role |
|---|---|---|
| `DashboardScreen.tsx` | 106 | Home tab — event banner, Scan Card CTA, 6-tile stat grid, 3 text-row quick links |
| `ScannerScreen.tsx` | 325 | Camera capture (front/back), guide overlay, ROI crop, quality gate, OCR trigger |
| `ReviewScreen.tsx` | 565 | Largest screen — edit extracted company/representative(s)/phones/emails/address/categories, save, save-to-contacts |
| `CardLibraryScreen.tsx` | 208 | Library tab — search, filter, list of `CardListItem` |
| `CardDetailScreen.tsx` | 256 | Saved card detail — image, company, all representatives, per-rep contact save, edit/delete |
| `ReportsScreen.tsx` | 173 | Excel generation + share |
| `SettingsScreen.tsx` | 60 | Settings tab — currently a short flat list of links |
| `StorageSettingsScreen.tsx` | 125 | Storage usage breakdown, delete-all |
| `BackupRestoreScreen.tsx` | 142 | Backup/restore actions |
| `EventsScreen.tsx` | 165 | Event switcher/creator |

### Reusable components (`src/components/`)

`Basics.tsx` (SectionHeader, EmptyState, StatTile, CategoryChip, Divider), `PrimaryButton.tsx`
(4 variants: primary/secondary/danger/outline, loading state, icon slot already supported),
`CardListItem.tsx` (thumbnail-based — already avoids loading full-res images in the list, good
existing practice to preserve), `CardGuideOverlay.tsx` (the ROI guide — geometry is
security-critical, see Phase 31 rule below), `CategoryPicker.tsx`, `DuplicateModal.tsx`,
`ImageViewer.tsx`, `PhoneListEditor.tsx`, `RepresentativeFormSection.tsx`.

### Navigation (`src/navigation/RootNavigator.tsx`)

Bottom tabs: Dashboard / Library / Reports / Settings, icons are **raw Unicode glyphs**
(`⌂ ▤ ▦ ⚙`) — no real icon system. Scanner/Review/CardDetail/Events/StorageSettings/BackupRestore
are stack screens pushed from within tabs (Scanner via Dashboard's "Scan Card" button), not tabs
themselves.

### Existing styling approach

Already a single, flat design-token file (`src/constants/theme.ts`): `colors`, `spacing`
(4/8/16/24/32/48), `radius` (6/10/16/pill), `typography` (h1/h2/h3/body/bodyBold/caption/button),
`touchTarget.minHeight=52`. This is a genuinely good foundation — no scattered magic numbers, every
screen already imports from it. The redesign extends this file rather than replacing it, so every
screen that already imports `colors`/`spacing`/`radius`/`typography` picks up the new system
automatically without being touched, and screens get a deeper visual pass where it matters most.

**Explicit existing design decision, documented in the theme file's own comment:** *"no theming
engine, no dark mode toggle: this app is used on a bright expo floor and always renders the same
high-contrast light theme."* This is a deliberate, reasoned decision for this specific use case
(outdoor/bright-venue readability), not an oversight. **Dark mode is out of scope for this
redesign** — implementing it would fight this existing, sound architectural choice for a
questionable benefit (the app is not intended to be used in a dark room). Flagging this explicitly
per the "STOP and explain" rule rather than silently skipping it.

No icon library is present anywhere in the app (`@expo/vector-icons` — bundled with Expo SDK
conceptually but not actually installed in this project — added this session as the one new,
well-justified, zero-native-config dependency; using `Ionicons`, whose visual language is the
closest first-party equivalent to SF Symbols).

### Existing UI problems (concrete, not aesthetic opinion)

1. Tab bar icons are literal text glyphs, not a real icon set — inconsistent weight/size/alignment
   by construction.
2. No shadow/elevation tokens — every surface uses a flat 1px border, which is fine but flat;
   nothing distinguishes "resting" from "elevated" (e.g. a modal vs. a list row).
3. Typography scale has no "Large Title" (iOS-style oversized header) — `h1` at 28pt is used for
   stat numbers, not screen titles, so there's no strong top-of-screen hierarchy anchor.
4. Dashboard's stat grid (6 tiles) is data-dense with no "Recent Cards" glanceable list — the
   brief's proposed simpler at-a-glance layout is a real improvement, not just decoration.
5. `SettingsScreen.tsx` is a flat, ungrouped list (only 60 lines) — no iOS-style grouped sections.
6. No toast/inline-feedback primitive exists — feedback is currently `Alert.alert()` (native
   blocking modal) for both minor confirmations ("Changes saved") and real errors. This is a
   correctness-preserving redesign target: replace *only* the presentation of non-blocking
   confirmations with a lightweight toast, while keeping `Alert.alert` for anything that truly
   needs the user to acknowledge (e.g. destructive-action confirmations) — no behavior change to
   *what* triggers feedback, only *how* low-stakes feedback is presented.
7. No micro-interaction/press-animation layer beyond `PrimaryButton`'s opacity/scale pressed state
   (which is already reasonable and preserved).

### Proposed new design system (summary — full tokens in Phase 2 below)

Extend `theme.ts` in place: add `elevatedSurface`, `secondaryBackground`, `tertiaryText`, `divider`
as explicit tokens (some already exist under different names — reconciled, not duplicated); add a
`largeTitle` typography step; add a `shadow` token object (2 subtle levels only, no heavy Android
elevation); extend `spacing` with the brief's 12/20/40 steps (4/8/12/16/20/24/32/40, superset of
the current scale — nothing existing breaks); extend `radius` with `xl`. Add `Ionicons` as the
single, consistent icon source across the whole app.

### What is explicitly NOT touched in this redesign

Every file under `src/repositories/`, `src/services/`, `src/database/`, `src/state/` — the entire
data/business-logic layer. `CardGuideOverlay.tsx`'s guide-rectangle **geometry** (`getGuideRect` in
`src/utils/cardGuideGeometry.ts`) is untouched; only its purely visual chrome (colors, animation)
may change, per the hard "visible frame == actual OCR ROI" requirement — see Phase 31 further down.
