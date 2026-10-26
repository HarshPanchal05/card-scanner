import { getDb, generateUuid, nowIso } from '../database/db';
import type { CompanyRow, CategoryRow } from '../types/models';
import { normalizeCompanyName } from '../utils/textNormalize';

function mapCompany(row: any): CompanyRow {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    website: row.website,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    country: row.country,
    categorySource: row.category_source ?? 'auto',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCompany(id: string): Promise<CompanyRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>('SELECT * FROM companies WHERE id = ?;', id);
  return row ? mapCompany(row) : null;
}

export async function findCompaniesByNormalizedName(normalizedName: string): Promise<CompanyRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM companies WHERE normalized_name = ?;',
    normalizedName
  );
  return rows.map(mapCompany);
}

export interface CompanyInput {
  name: string;
  website?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

/** Creates a new company row (does not attempt de-duplication — callers that want to reuse an
 *  existing company by name should call findCompaniesByNormalizedName first and let the user
 *  confirm via the duplicate-detection flow). */
export async function createCompany(input: CompanyInput): Promise<CompanyRow> {
  const db = await getDb();
  const id = generateUuid();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO companies (id, name, normalized_name, website, address_line, city, state, country, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    id,
    input.name,
    normalizeCompanyName(input.name),
    input.website ?? null,
    input.addressLine ?? null,
    input.city ?? null,
    input.state ?? null,
    input.country ?? null,
    now,
    now
  );
  const created = await getCompany(id);
  if (!created) throw new Error('Failed to create company');
  return created;
}

export async function updateCompany(id: string, input: Partial<CompanyInput>): Promise<void> {
  const db = await getDb();
  const existing = await getCompany(id);
  if (!existing) throw new Error('Company not found');
  const merged = { ...existing, ...input };
  await db.runAsync(
    `UPDATE companies SET name = ?, normalized_name = ?, website = ?, address_line = ?, city = ?, state = ?, country = ?, updated_at = ?
     WHERE id = ?;`,
    merged.name,
    normalizeCompanyName(merged.name),
    merged.website ?? null,
    merged.addressLine ?? null,
    merged.city ?? null,
    merged.state ?? null,
    merged.country ?? null,
    nowIso(),
    id
  );
}

export async function setCompanyCategories(
  companyId: string,
  categories: { categoryId: string; confidence: number }[]
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM company_categories WHERE company_id = ?;', companyId);
    for (const c of categories) {
      await db.runAsync(
        `INSERT INTO company_categories (company_id, category_id, confidence) VALUES (?, ?, ?)
         ON CONFLICT(company_id, category_id) DO UPDATE SET confidence = excluded.confidence;`,
        companyId,
        c.categoryId,
        c.confidence
      );
    }
  });
}

export async function getCompanyCategories(companyId: string): Promise<CategoryRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT c.* FROM categories c
     JOIN company_categories cc ON cc.category_id = c.id
     WHERE cc.company_id = ?
     ORDER BY cc.confidence DESC;`,
    companyId
  );
  return rows.map((row) => ({ id: row.id, name: row.name, isCustom: row.is_custom, createdAt: row.created_at }));
}

/** Records whether the company's current category assignment was auto-classified or explicitly
 *  chosen by the user — see leadRepository.ts's writeCompanyCategories and
 *  categoryManagementLogic.ts's resolveCategoryAssignment. */
export async function setCompanyCategorySource(companyId: string, source: CompanyRow['categorySource']): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE companies SET category_source = ? WHERE id = ?;', source, companyId);
}

export async function listRepresentativesForCompany(companyId: string) {
  const db = await getDb();
  return db.getAllAsync<any>('SELECT * FROM representatives WHERE company_id = ?;', companyId);
}
