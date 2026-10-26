/**
 * Core domain models. These mirror the SQLite schema in src/database/schema.ts.
 * IDs are stored as TEXT (UUID) primary keys; `displayId` is the human-readable
 * sequential code (CARD-000124) shown in the UI.
 */

export type ProcessingStatus =
  | 'captured' // image(s) captured, not yet OCR'd
  | 'processing' // OCR/extraction running
  | 'needs_review' // extraction done, low confidence or user hasn't confirmed
  | 'saved' // user pressed Save Lead
  | 'failed'; // OCR or extraction failed hard

export interface EventRow {
  id: string;
  name: string;
  location: string | null;
  startDate: string | null; // ISO date
  endDate: string | null; // ISO date
  isArchived: 0 | 1;
  isDefault: 0 | 1;
  createdAt: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  isCustom: 0 | 1;
  createdAt: string;
}

/** 'auto' = current category was set by the offline classifier and may still be revised by a
 *  future classification pass; 'manual' = a user explicitly chose/confirmed it on the Review
 *  screen and it must never be silently overwritten by auto-classification again. */
export type CategorySource = 'auto' | 'manual';

export interface CompanyRow {
  id: string;
  name: string;
  normalizedName: string; // lowercase, punctuation-stripped, for duplicate matching
  website: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  categorySource: CategorySource;
  createdAt: string;
  updatedAt: string;
}

export interface RepresentativeRow {
  id: string;
  companyId: string;
  name: string;
  designation: string | null;
  department: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PhoneKind = 'mobile' | 'office' | 'landline' | 'whatsapp' | 'fax' | 'other';

export interface PhoneNumberRow {
  id: string;
  representativeId: string;
  rawValue: string;
  normalizedValue: string; // digits only, for matching/duplicate detection
  kind: PhoneKind;
  isPrimary: 0 | 1;
}

export interface EmailRow {
  id: string;
  representativeId: string;
  address: string;
  isPrimary: 0 | 1;
}

export interface CompanyCategoryRow {
  companyId: string;
  categoryId: string;
  confidence: number; // 0..1
}

export interface CardImageRow {
  id: string;
  cardId: string;
  side: 'front' | 'back';
  originalUri: string;
  thumbnailUri: string | null;
  width: number | null;
  height: number | null;
  qualityScore: number | null;
  createdAt: string;
}

export interface CardRow {
  id: string;
  displayId: string; // CARD-000124
  eventId: string;
  companyId: string | null;
  representativeId: string | null;
  status: ProcessingStatus;
  rawOcrText: string | null; // combined front+back OCR text, for debugging/reprocessing
  extractionJson: string | null; // last structured extraction result, JSON-encoded
  confidenceJson: string | null; // per-field confidence scores, JSON-encoded
  notes: string | null;
  hasBack: 0 | 1;
  isDuplicateOf: string | null; // cardId this was flagged (and kept) as duplicate of
  contactSavedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettingRow {
  key: string;
  value: string;
}

// ---- Composite / view models used across the UI ----

export interface CardWithDetails {
  card: CardRow;
  company: CompanyRow | null;
  representative: RepresentativeRow | null;
  phones: PhoneNumberRow[];
  emails: EmailRow[];
  categories: CategoryRow[];
  images: CardImageRow[];
  event: EventRow | null;
}

export interface CardListItemView {
  cardId: string;
  displayId: string;
  companyName: string | null;
  representativeName: string | null;
  categoryNames: string[];
  thumbnailUri: string | null;
  createdAt: string;
  status: ProcessingStatus;
}
