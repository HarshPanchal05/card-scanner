/** SQLite schema, applied via PRAGMA user_version-gated migrations in db.ts.
 *  Add new migrations by appending to MIGRATIONS — never edit an already-shipped migration. */

export const DB_NAME = 'cardscanner.db';

const MIGRATION_1 = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  website TEXT,
  address_line TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_normalized_name ON companies(normalized_name);

CREATE TABLE IF NOT EXISTS representatives (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_representatives_company_id ON representatives(company_id);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id TEXT PRIMARY KEY NOT NULL,
  representative_id TEXT NOT NULL REFERENCES representatives(id) ON DELETE CASCADE,
  raw_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  is_primary INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_rep_id ON phone_numbers(representative_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_normalized ON phone_numbers(normalized_value);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY NOT NULL,
  representative_id TEXT NOT NULL REFERENCES representatives(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_emails_rep_id ON emails(representative_id);
CREATE INDEX IF NOT EXISTS idx_emails_address ON emails(address);

CREATE TABLE IF NOT EXISTS company_categories (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, category_id)
);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL,
  display_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  representative_id TEXT REFERENCES representatives(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'captured',
  raw_ocr_text TEXT,
  extraction_json TEXT,
  confidence_json TEXT,
  notes TEXT,
  has_back INTEGER NOT NULL DEFAULT 0,
  is_duplicate_of TEXT REFERENCES cards(id) ON DELETE SET NULL,
  contact_saved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_event_id ON cards(event_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_company_id ON cards(company_id);

CREATE TABLE IF NOT EXISTS card_images (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  original_uri TEXT NOT NULL,
  thumbnail_uri TEXT,
  width INTEGER,
  height INTEGER,
  quality_score REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card_images_card_id ON card_images(card_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS id_counters (
  name TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL DEFAULT 0
);
`;

// Additive: supports a card listing multiple representatives (e.g. two proprietors, each with
// their own phone number, detected on one scan — see services/extraction/multiRepresentative.ts).
// cards.representative_id/company_id are untouched and keep pointing at the first/primary
// representative, so every existing query that only cares about "the" representative for a card
// (Dashboard stats, duplicate lookups, etc.) needs no changes. Every card — including ordinary
// single-representative ones — gets exactly one row here (is_primary = 1), so this table is the
// single canonical source for "which representatives came from this card" wherever the full list
// is needed (Card Detail, Excel export).
const MIGRATION_2 = `
CREATE TABLE IF NOT EXISTS card_representatives (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  representative_id TEXT NOT NULL REFERENCES representatives(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, representative_id)
);
CREATE INDEX IF NOT EXISTS idx_card_representatives_card ON card_representatives(card_id);
CREATE INDEX IF NOT EXISTS idx_card_representatives_rep ON card_representatives(representative_id);
`;

// Adds per-representative contact-save tracking so a card with multiple people can disable
// "Save to Contacts" independently per person instead of one card-wide flag (see
// cardsRepo.ts#markRepresentativeContactSaved). Deliberately a separate migration rather than
// folding this column into MIGRATION_2 above: MIGRATION_2 had already executed against a real
// device (Metro's Fast Refresh re-triggered the migration runner mid-edit, before this column was
// added to it) by the time the gap was found, so `CREATE TABLE IF NOT EXISTS` in MIGRATION_2
// silently no-op'd on that device once the column was added there instead — a concrete
// demonstration of why an already-applied migration must never be edited, only appended to.
const MIGRATION_3 = `
ALTER TABLE card_representatives ADD COLUMN contact_saved_at TEXT;
`;

// Tracks whether a company's current category assignment came from the offline auto-classifier
// ('auto') or was explicitly chosen/confirmed by the user on the Review screen ('manual'). Needed
// so a manual correction (e.g. Other -> Furniture) is never silently reverted by a later automatic
// classification pass on the same company — see leadRepository.ts's writeCompanyCategories and
// repositories/categoryManagementLogic.ts's resolveCategoryAssignment. Defaults to 'auto' so every
// pre-existing company (categorized under the old multi-tag system) behaves exactly as before —
// its categories remain freely re-classifiable until a user explicitly picks one.
const MIGRATION_4 = `
ALTER TABLE companies ADD COLUMN category_source TEXT NOT NULL DEFAULT 'auto';
`;

/** Ordered list of migrations. Index 0 == user_version 1, etc. Never edit an already-shipped
 *  migration — append a new one instead. */
export const MIGRATIONS: string[] = [MIGRATION_1, MIGRATION_2, MIGRATION_3, MIGRATION_4];
