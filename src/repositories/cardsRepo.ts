import { getDb, generateUuid, nowIso } from '../database/db';
import type {
  CardRow,
  CardImageRow,
  CardWithDetails,
  CardListItemView,
  ProcessingStatus,
  RepresentativeRow,
} from '../types/models';
import { nextCardDisplayId } from './settingsRepo';
import { getCompany, getCompanyCategories } from './companiesRepo';
import {
  getRepresentative,
  getPhonesForRepresentative,
  getEmailsForRepresentative,
  mapRep as mapRepresentativeRow,
} from './representativesRepo';
import { getEvent } from './eventsRepo';
import { PAGINATION_CONFIG } from '../constants/config';
import { buildCardSearchClause } from './cardSearchClause';

function mapCard(row: any): CardRow {
  return {
    id: row.id,
    displayId: row.display_id,
    eventId: row.event_id,
    companyId: row.company_id,
    representativeId: row.representative_id,
    status: row.status,
    rawOcrText: row.raw_ocr_text,
    extractionJson: row.extraction_json,
    confidenceJson: row.confidence_json,
    notes: row.notes,
    hasBack: row.has_back,
    isDuplicateOf: row.is_duplicate_of,
    contactSavedAt: row.contact_saved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapImage(row: any): CardImageRow {
  return {
    id: row.id,
    cardId: row.card_id,
    side: row.side,
    originalUri: row.original_uri,
    thumbnailUri: row.thumbnail_uri,
    width: row.width,
    height: row.height,
    qualityScore: row.quality_score,
    createdAt: row.created_at,
  };
}

export async function createCard(eventId: string): Promise<CardRow> {
  const db = await getDb();
  const id = generateUuid();
  const displayId = await nextCardDisplayId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO cards (id, display_id, event_id, status, has_back, created_at, updated_at)
     VALUES (?, ?, ?, 'captured', 0, ?, ?);`,
    id,
    displayId,
    eventId,
    now,
    now
  );
  const created = await getCard(id);
  if (!created) throw new Error('Failed to create card');
  return created;
}

export async function getCard(id: string): Promise<CardRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM cards WHERE id = ?;', id);
  return row ? mapCard(row) : null;
}

export async function addCardImage(input: {
  cardId: string;
  side: 'front' | 'back';
  originalUri: string;
  thumbnailUri: string | null;
  width: number | null;
  height: number | null;
  qualityScore: number | null;
}): Promise<CardImageRow> {
  const db = await getDb();
  const id = generateUuid();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    // A side can be recaptured (retake) — replace any existing image for that side.
    await db.runAsync('DELETE FROM card_images WHERE card_id = ? AND side = ?;', input.cardId, input.side);
    await db.runAsync(
      `INSERT INTO card_images (id, card_id, side, original_uri, thumbnail_uri, width, height, quality_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      id,
      input.cardId,
      input.side,
      input.originalUri,
      input.thumbnailUri,
      input.width,
      input.height,
      input.qualityScore,
      now
    );
    if (input.side === 'back') {
      await db.runAsync('UPDATE cards SET has_back = 1, updated_at = ? WHERE id = ?;', now, input.cardId);
    }
  });
  const row = await db.getFirstAsync<any>('SELECT * FROM card_images WHERE id = ?;', id);
  return mapImage(row);
}

export async function getCardImages(cardId: string): Promise<CardImageRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM card_images WHERE card_id = ? ORDER BY side ASC;",
    cardId
  );
  return rows.map(mapImage);
}

export async function updateCardStatus(cardId: string, status: ProcessingStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE cards SET status = ?, updated_at = ? WHERE id = ?;', status, nowIso(), cardId);
}

export async function updateCardOcrAndExtraction(
  cardId: string,
  input: { rawOcrText: string; extractionJson: string; confidenceJson: string; status: ProcessingStatus }
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cards SET raw_ocr_text = ?, extraction_json = ?, confidence_json = ?, status = ?, updated_at = ?
     WHERE id = ?;`,
    input.rawOcrText,
    input.extractionJson,
    input.confidenceJson,
    input.status,
    nowIso(),
    cardId
  );
}

export async function linkCardToLead(
  cardId: string,
  companyId: string,
  representativeId: string,
  notes: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE cards SET company_id = ?, representative_id = ?, notes = ?, status = 'saved', updated_at = ? WHERE id = ?;`,
    companyId,
    representativeId,
    notes,
    nowIso(),
    cardId
  );
}

/** Records which representatives came from this card, replacing any previous set (idempotent —
 *  safe to call again if a card is re-saved/edited). The first id in the array is marked primary.
 *  Called for every saved card, including ordinary single-representative ones, so this table is
 *  always the complete, canonical source for "which representatives does this card have" —
 *  callers that only need the primary can keep using `cards.representative_id` unchanged.
 *
 *  Uses UPSERT rather than delete-then-reinsert for representatives that are still part of the
 *  new set, so a representative's `contact_saved_at` (see markRepresentativeContactSaved) survives
 *  a re-save/edit of the card — a plain delete+reinsert would silently reset it to null, letting
 *  the user accidentally create a duplicate Android contact for someone whose contact was already
 *  saved. Only representatives no longer in the new set (removed during editing) are deleted. */
export async function linkCardRepresentatives(cardId: string, representativeIds: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (representativeIds.length > 0) {
      const placeholders = representativeIds.map(() => '?').join(', ');
      await db.runAsync(
        `DELETE FROM card_representatives WHERE card_id = ? AND representative_id NOT IN (${placeholders});`,
        cardId,
        ...representativeIds
      );
    } else {
      await db.runAsync('DELETE FROM card_representatives WHERE card_id = ?;', cardId);
    }
    for (let i = 0; i < representativeIds.length; i++) {
      await db.runAsync(
        `INSERT INTO card_representatives (card_id, representative_id, is_primary) VALUES (?, ?, ?)
         ON CONFLICT(card_id, representative_id) DO UPDATE SET is_primary = excluded.is_primary;`,
        cardId,
        representativeIds[i],
        i === 0 ? 1 : 0
      );
    }
  });
}

/** Every representative linked to this card (via card_representatives), primary first — the
 *  complete list for a card that may list multiple people, unlike the single `representativeId`
 *  on the CardRow itself. */
export async function getRepresentativesForCard(cardId: string): Promise<RepresentativeRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT r.* FROM representatives r
     JOIN card_representatives cr ON cr.representative_id = r.id
     WHERE cr.card_id = ?
     ORDER BY cr.is_primary DESC, r.created_at ASC;`,
    cardId
  );
  return rows.map(mapRepresentativeRow);
}

export interface CardRepresentativeLink {
  representative: RepresentativeRow;
  isPrimary: boolean;
  contactSavedAt: string | null;
}

/** Same as getRepresentativesForCard, but also carries each representative's own
 *  contact-saved status — needed by Card Detail so a card with multiple people can disable
 *  "Save to Contacts" independently per person instead of a single card-wide flag. */
export async function getCardRepresentativeLinks(cardId: string): Promise<CardRepresentativeLink[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT r.*, cr.is_primary as cr_is_primary, cr.contact_saved_at as cr_contact_saved_at
     FROM representatives r
     JOIN card_representatives cr ON cr.representative_id = r.id
     WHERE cr.card_id = ?
     ORDER BY cr.is_primary DESC, r.created_at ASC;`,
    cardId
  );
  return rows.map((row) => ({
    representative: mapRepresentativeRow(row),
    isPrimary: row.cr_is_primary === 1,
    contactSavedAt: row.cr_contact_saved_at,
  }));
}

/** Upserts rather than a plain UPDATE: a card saved before this join table existed (or before
 *  this representative was linked for any other reason) won't have a matching row yet — a plain
 *  UPDATE would silently affect zero rows, and the "already saved" state would never stick,
 *  letting the user accidentally create a duplicate contact on next visit. Inserting on conflict
 *  self-heals that case; `is_primary` defaults to 1 only for a freshly-inserted row and is left
 *  untouched for an existing one. */
export async function markRepresentativeContactSaved(cardId: string, representativeId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO card_representatives (card_id, representative_id, is_primary, contact_saved_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(card_id, representative_id) DO UPDATE SET contact_saved_at = excluded.contact_saved_at;`,
    cardId,
    representativeId,
    nowIso()
  );
}

export async function markContactSaved(cardId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE cards SET contact_saved_at = ? WHERE id = ?;', nowIso(), cardId);
}

export async function markDuplicateOf(cardId: string, otherCardId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE cards SET is_duplicate_of = ?, updated_at = ? WHERE id = ?;', otherCardId, nowIso(), cardId);
}

/** Finds another saved card already pointing at this representative (preferred) or company, to
 *  use as the "duplicate of" reference when the current card was saved via a duplicate merge. */
export async function findSiblingCardId(
  excludeCardId: string,
  companyId: string,
  representativeId: string
): Promise<string | null> {
  const db = await getDb();
  const byRep = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM cards WHERE representative_id = ? AND id != ? ORDER BY created_at ASC LIMIT 1;",
    representativeId,
    excludeCardId
  );
  if (byRep) return byRep.id;
  const byCompany = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM cards WHERE company_id = ? AND id != ? ORDER BY created_at ASC LIMIT 1;",
    companyId,
    excludeCardId
  );
  return byCompany?.id ?? null;
}

/** Deletes a card and, if this was the only card still referencing its representative/company,
 *  deletes those too (cascading to their phones/emails/category links) — otherwise they'd become
 *  invisible "phantom" rows that never appear in the Card Library again but still surface as
 *  possible-duplicate matches on future scans. Rows still referenced by another card are left
 *  untouched (a company/representative can legitimately be shared across many cards). */
export async function deleteCard(cardId: string): Promise<CardImageRow[]> {
  const db = await getDb();
  const images = await getCardImages(cardId);
  const card = await getCard(cardId);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM cards WHERE id = ?;', cardId);

    if (card?.representativeId) {
      const stillUsed = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) as n FROM cards WHERE representative_id = ?;',
        card.representativeId
      );
      if ((stillUsed?.n ?? 0) === 0) {
        await db.runAsync('DELETE FROM representatives WHERE id = ?;', card.representativeId);
      }
    }

    if (card?.companyId) {
      const stillUsed = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) as n FROM cards WHERE company_id = ?;',
        card.companyId
      );
      const hasReps = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) as n FROM representatives WHERE company_id = ?;',
        card.companyId
      );
      if ((stillUsed?.n ?? 0) === 0 && (hasReps?.n ?? 0) === 0) {
        await db.runAsync('DELETE FROM companies WHERE id = ?;', card.companyId);
      }
    }
  });

  return images; // caller deletes the physical files
}

export async function getCardWithDetails(cardId: string): Promise<CardWithDetails | null> {
  const card = await getCard(cardId);
  if (!card) return null;
  const [company, representative, images, event] = await Promise.all([
    card.companyId ? getCompany(card.companyId) : Promise.resolve(null),
    card.representativeId ? getRepresentative(card.representativeId) : Promise.resolve(null),
    getCardImages(cardId),
    getEvent(card.eventId),
  ]);
  const [phones, emails, categories] = await Promise.all([
    representative ? getPhonesForRepresentative(representative.id) : Promise.resolve([]),
    representative ? getEmailsForRepresentative(representative.id) : Promise.resolve([]),
    company ? getCompanyCategories(company.id) : Promise.resolve([]),
  ]);
  return { card, company, representative, phones, emails, categories, images, event };
}

export interface CardListFilters {
  search?: string;
  eventId?: string;
  categoryId?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export async function listCards(filters: CardListFilters): Promise<CardListItemView[]> {
  const db = await getDb();
  const limit = filters.limit ?? PAGINATION_CONFIG.cardLibraryPageSize;
  const offset = filters.offset ?? 0;

  const clauses: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.eventId) {
    clauses.push('c.event_id = ?');
    params.push(filters.eventId);
  }
  if (filters.companyId) {
    clauses.push('c.company_id = ?');
    params.push(filters.companyId);
  }
  if (filters.dateFrom) {
    clauses.push('c.created_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push('c.created_at <= ?');
    params.push(filters.dateTo);
  }
  if (filters.categoryId) {
    clauses.push('EXISTS (SELECT 1 FROM company_categories cc WHERE cc.company_id = c.company_id AND cc.category_id = ?)');
    params.push(filters.categoryId);
  }
  const searchClause = buildCardSearchClause(filters.search);
  if (searchClause) {
    clauses.push(searchClause.clause);
    params.push(...searchClause.params);
  }

  const sql = `
    SELECT c.*, co.name as company_name, r.name as rep_name
    FROM cards c
    LEFT JOIN companies co ON co.id = c.company_id
    LEFT JOIN representatives r ON r.id = c.representative_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?;
  `;
  params.push(limit, offset);

  const rows = await db.getAllAsync<any>(sql, ...params);

  const results: CardListItemView[] = [];
  for (const row of rows) {
    const images = await getCardImages(row.id);
    const front = images.find((i) => i.side === 'front');
    let categoryNames: string[] = [];
    if (row.company_id) {
      const cats = await getCompanyCategories(row.company_id);
      categoryNames = cats.map((c) => c.name);
    }
    results.push({
      cardId: row.id,
      displayId: row.display_id,
      companyName: row.company_name,
      representativeName: row.rep_name,
      categoryNames,
      thumbnailUri: front?.thumbnailUri ?? front?.originalUri ?? null,
      createdAt: row.created_at,
      status: row.status,
    });
  }
  return results;
}

function buildCardFilterClause(filters: CardListFilters): { clause: string; params: any[] } {
  const clauses: string[] = ['1=1'];
  const params: any[] = [];

  if (filters.eventId) {
    clauses.push('c.event_id = ?');
    params.push(filters.eventId);
  }
  if (filters.companyId) {
    clauses.push('c.company_id = ?');
    params.push(filters.companyId);
  }
  if (filters.dateFrom) {
    clauses.push('c.created_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push('c.created_at <= ?');
    params.push(filters.dateTo);
  }
  if (filters.categoryId) {
    clauses.push('EXISTS (SELECT 1 FROM company_categories cc WHERE cc.company_id = c.company_id AND cc.category_id = ?)');
    params.push(filters.categoryId);
  }
  const searchClause = buildCardSearchClause(filters.search);
  if (searchClause) {
    clauses.push(searchClause.clause);
    params.push(...searchClause.params);
  }

  return { clause: clauses.join(' AND '), params };
}

/** Every card id matching the given filters, with no pagination — used by report generation,
 *  which needs the complete matching set rather than a page of it. */
export async function listAllCardIdsMatching(filters: CardListFilters): Promise<string[]> {
  const db = await getDb();
  const { clause, params } = buildCardFilterClause(filters);
  const sql = `
    SELECT c.id
    FROM cards c
    LEFT JOIN companies co ON co.id = c.company_id
    LEFT JOIN representatives r ON r.id = c.representative_id
    WHERE ${clause} AND c.status = 'saved'
    ORDER BY c.created_at ASC;
  `;
  const rows = await db.getAllAsync<{ id: string }>(sql, ...params);
  return rows.map((r) => r.id);
}

export interface DashboardStats {
  totalCards: number;
  totalCompanies: number;
  totalRepresentatives: number;
  todayScans: number;
  totalCategories: number;
  potentialDuplicates: number;
}

export async function getDashboardStats(eventId?: string): Promise<DashboardStats> {
  const db = await getDb();
  const eventClause = eventId ? 'WHERE event_id = ?' : '';
  const eventParams = eventId ? [eventId] : [];

  const totalCards = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM cards ${eventClause};`,
    ...eventParams
  );
  const totalCompanies = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT company_id) as n FROM cards ${eventClause ? eventClause + ' AND' : 'WHERE'} company_id IS NOT NULL;`,
    ...eventParams
  );
  const totalRepresentatives = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT representative_id) as n FROM cards ${eventClause ? eventClause + ' AND' : 'WHERE'} representative_id IS NOT NULL;`,
    ...eventParams
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayScans = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM cards ${eventClause ? eventClause + ' AND' : 'WHERE'} created_at >= ?;`,
    ...eventParams,
    todayStart.toISOString()
  );
  const totalCategories = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM categories;');
  const potentialDuplicates = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM cards ${eventClause ? eventClause + ' AND' : 'WHERE'} is_duplicate_of IS NOT NULL;`,
    ...eventParams
  );

  return {
    totalCards: totalCards?.n ?? 0,
    totalCompanies: totalCompanies?.n ?? 0,
    totalRepresentatives: totalRepresentatives?.n ?? 0,
    todayScans: todayScans?.n ?? 0,
    totalCategories: totalCategories?.n ?? 0,
    potentialDuplicates: potentialDuplicates?.n ?? 0,
  };
}
