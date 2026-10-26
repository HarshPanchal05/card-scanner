# Storage

## Where data lives

All app data lives in the app's private document storage
(`expo-file-system`'s `Paths.document`, i.e. Android's app-specific external/internal storage —
not the public Photos gallery, not `MediaStore`). This is a deliberate choice, not an oversight:

- Business cards are sensitive company/contact data (brief §30) — there's no reason for scanned
  card photos to appear in the user's public Photos gallery or be readable by other apps.
- It avoids `READ_MEDIA_IMAGES`/`READ_EXTERNAL_STORAGE` runtime permissions entirely, which is
  both simpler and more in line with modern Android scoped-storage guidance (avoid broad storage
  permissions when they aren't needed).
- Getting data *off* the device is instead an explicit, user-invoked action: generate + share an
  Excel report, or export + share a full backup zip. Nothing leaves the device automatically.

The app-private root is cleared if the user uninstalls the app (standard Android behavior for any
app's private storage) — which is exactly why Backup/Restore exists (see below) and why it's
surfaced prominently in Settings.

## Folder layout

```
<app private storage>/CardScanner/
  Cards/
    2026/
      09-September/
        07/
          CARD-000124/
            original_front.jpg    ← byte-for-byte copy of the camera capture, never re-encoded
            original_back.jpg     ← only present if the card had a back side
            thumb_front.jpg       ← small, compressed, generated for list views
            thumb_back.jpg
  Reports/
    <EventName>_<timestamp>.xlsx
  Backups/
    CardScanner_Backup_<date>.zip
  Temp/
    (scratch space for capture-time downscaling; cleared by "Clear Temporary Files" in Settings)
```

`Cards/<year>/<month>/<day>/<CARD-ID>/` mirrors the structure suggested in the brief, sorted so
that browsing the raw filesystem (e.g. via a file manager, or during a support investigation)
stays chronologically navigable even with thousands of cards.

## Originals are never overwritten

`services/storage/fileStorage.ts#persistCapturedImage` copies the camera's output file directly
into `original_<side>.jpg` and only re-encodes a *separate* thumbnail file from that copy. Retaking
a photo for the same side replaces `original_<side>.jpg`+`thumb_<side>.jpg` together (a deliberate
retake, not a silent background mutation) — the pre-retake image is never partially overwritten,
and nothing else in the app writes to `original_*.jpg` after capture.

## Card IDs

Every card gets both a UUID (`cards.id`, used for all foreign keys and joins) and a sequential,
human-readable `display_id` like `CARD-000124` (`repositories/settingsRepo.ts#nextCardDisplayId`,
backed by an atomic `id_counters` table so concurrent scans never collide). The display ID is what
users see in the UI and what report rows reference.

## Database

SQLite via `expo-sqlite`, WAL journal mode for concurrent-read performance, full schema in
`src/database/schema.ts`. Migrations are gated on `PRAGMA user_version` (`src/database/db.ts`) —
each shipped schema change is a new entry appended to `MIGRATIONS`, applied in order exactly once.

## Storage management (Settings → Storage)

- **Usage breakdown**: bytes used by card photos, reports, and backups separately, plus a total
  (`services/storage/fileStorage.ts#getStorageUsage`).
- **Clear Temporary Files**: wipes the `Temp/` scratch folder only — never touches saved cards.
- **Delete All Cards**: a destructive, confirmation-gated action that clears the database tables
  (cards, images, companies, representatives, phones, emails, category links). The confirmation
  dialog explicitly suggests exporting a backup first. Deleting an individual card
  (Card Detail → Delete Card) removes just that card's DB rows and image files.

## Backup & Restore (Settings → Backup & Restore)

`services/backup/backupService.ts` bundles:

- `database.json` — every table dumped as-is (`database/backupIO.ts#dumpDatabase`)
- `manifest.json` — a version tag + row counts, checked before any restore is attempted
- `images/` — every file under `Cards/`, preserving its relative folder path

...into one zip written to `Backups/CardScanner_Backup_<date>.zip`, via `jszip` (pure JS, no
native dependency). Reports are intentionally excluded — they're regenerable from the database at
any time, so omitting them keeps backup files smaller.

Restore is **additive/merging**, not destructive: `restoreDatabase` uses `INSERT OR REPLACE`
keyed by each table's primary key, and image extraction never deletes files that aren't in the
backup. The Restore screen shows the backup's export date and row counts and asks for explicit
confirmation before touching anything (brief §27: "Never overwrite current data without explicit
confirmation").

## Performance notes

- Card Library lists are paginated (`PAGINATION_CONFIG.cardLibraryPageSize`, default 30) and
  query SQLite directly with `LIMIT`/`OFFSET` — thousands of cards are never loaded into memory at
  once (brief §28).
- List rows render the small pre-generated thumbnail, not the full-resolution original; the
  original is only decoded when the user opens a card's image viewer.
- Report generation currently loads full details for every *matching* (filtered) card via one
  query per card (`getCardWithDetails`). For an event with a few hundred to low thousands of
  cards this completes in a few seconds; if that becomes a bottleneck at very large scale, the
  next step would be a single batched join query instead of N+1 lookups — noted here rather than
  fixed pre-emptively, per the brief's "don't design for hypothetical requirements" guidance.
