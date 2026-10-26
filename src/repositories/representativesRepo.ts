import { getDb, generateUuid, nowIso } from '../database/db';
import type { RepresentativeRow, PhoneNumberRow, EmailRow, PhoneKind } from '../types/models';
import { normalizePhone, normalizeEmail } from '../utils/textNormalize';

export function mapRep(row: any): RepresentativeRow {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    designation: row.designation,
    department: row.department,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPhone(row: any): PhoneNumberRow {
  return {
    id: row.id,
    representativeId: row.representative_id,
    rawValue: row.raw_value,
    normalizedValue: row.normalized_value,
    kind: row.kind,
    isPrimary: row.is_primary,
  };
}

function mapEmail(row: any): EmailRow {
  return { id: row.id, representativeId: row.representative_id, address: row.address, isPrimary: row.is_primary };
}

export async function getRepresentative(id: string): Promise<RepresentativeRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM representatives WHERE id = ?;', id);
  return row ? mapRep(row) : null;
}

export interface RepresentativeInput {
  companyId: string;
  name: string;
  designation?: string | null;
  department?: string | null;
}

export async function createRepresentative(input: RepresentativeInput): Promise<RepresentativeRow> {
  const db = await getDb();
  const id = generateUuid();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO representatives (id, company_id, name, designation, department, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    id,
    input.companyId,
    input.name,
    input.designation ?? null,
    input.department ?? null,
    now,
    now
  );
  const created = await getRepresentative(id);
  if (!created) throw new Error('Failed to create representative');
  return created;
}

export async function updateRepresentative(id: string, input: Partial<RepresentativeInput>): Promise<void> {
  const db = await getDb();
  const existing = await getRepresentative(id);
  if (!existing) throw new Error('Representative not found');
  const merged = { ...existing, ...input };
  await db.runAsync(
    `UPDATE representatives SET name = ?, designation = ?, department = ?, updated_at = ? WHERE id = ?;`,
    merged.name,
    merged.designation ?? null,
    merged.department ?? null,
    nowIso(),
    id
  );
}

export async function replacePhoneNumbers(
  representativeId: string,
  phones: { rawValue: string; kind: PhoneKind; isPrimary?: boolean }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM phone_numbers WHERE representative_id = ?;', representativeId);
    for (let i = 0; i < phones.length; i++) {
      const p = phones[i];
      await db.runAsync(
        `INSERT INTO phone_numbers (id, representative_id, raw_value, normalized_value, kind, is_primary)
         VALUES (?, ?, ?, ?, ?, ?);`,
        generateUuid(),
        representativeId,
        p.rawValue,
        normalizePhone(p.rawValue),
        p.kind,
        p.isPrimary || i === 0 ? 1 : 0
      );
    }
  });
}

export async function replaceEmails(
  representativeId: string,
  emails: { address: string; isPrimary?: boolean }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM emails WHERE representative_id = ?;', representativeId);
    for (let i = 0; i < emails.length; i++) {
      const e = emails[i];
      await db.runAsync(
        `INSERT INTO emails (id, representative_id, address, is_primary) VALUES (?, ?, ?, ?);`,
        generateUuid(),
        representativeId,
        normalizeEmail(e.address),
        e.isPrimary || i === 0 ? 1 : 0
      );
    }
  });
}

export async function getPhonesForRepresentative(representativeId: string): Promise<PhoneNumberRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM phone_numbers WHERE representative_id = ? ORDER BY is_primary DESC;',
    representativeId
  );
  return rows.map(mapPhone);
}

export async function getEmailsForRepresentative(representativeId: string): Promise<EmailRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM emails WHERE representative_id = ? ORDER BY is_primary DESC;',
    representativeId
  );
  return rows.map(mapEmail);
}

export async function findRepresentativesByPhone(normalizedValue: string): Promise<RepresentativeRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT r.* FROM representatives r
     JOIN phone_numbers p ON p.representative_id = r.id
     WHERE p.normalized_value = ? AND p.normalized_value != '';`,
    normalizedValue
  );
  return rows.map(mapRep);
}

export async function findRepresentativesByEmail(address: string): Promise<RepresentativeRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT r.* FROM representatives r
     JOIN emails e ON e.representative_id = r.id
     WHERE e.address = ?;`,
    normalizeEmail(address)
  );
  return rows.map(mapRep);
}
