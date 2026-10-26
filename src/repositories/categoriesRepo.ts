import { getDb, generateUuid, nowIso } from '../database/db';
import type { CategoryRow } from '../types/models';
import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME } from '../constants/categories';
import { validateNewCategoryName, validateRenameCategory, canDeleteCategory } from './categoryManagementLogic';

function mapCategory(row: any): CategoryRow {
  return { id: row.id, name: row.name, isCustom: row.is_custom, createdAt: row.created_at };
}

/** Idempotently inserts "Other" (the permanent fallback bucket, seeded first so it always exists)
 *  plus the built-in category master list. Safe to call on every app start. */
export async function seedDefaultCategories(): Promise<void> {
  const db = await getDb();
  const createdAt = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO categories (id, name, is_custom, created_at) VALUES (?, ?, 0, ?)
       ON CONFLICT(name) DO NOTHING;`,
      generateUuid(),
      OTHER_CATEGORY_NAME,
      createdAt
    );
    for (const def of DEFAULT_CATEGORIES) {
      await db.runAsync(
        `INSERT INTO categories (id, name, is_custom, created_at) VALUES (?, ?, 0, ?)
         ON CONFLICT(name) DO NOTHING;`,
        generateUuid(),
        def.name,
        createdAt
      );
    }
  });
}

export async function listCategories(): Promise<CategoryRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>('SELECT * FROM categories ORDER BY name ASC;');
  return rows.map(mapCategory);
}

export async function findCategoryByName(name: string): Promise<CategoryRow | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM categories WHERE name = ? COLLATE NOCASE;',
    name
  );
  return row ? mapCategory(row) : null;
}

/** Finds an existing category by name (case-insensitive) or creates a custom one. */
export async function getOrCreateCategory(name: string, isCustom = false): Promise<CategoryRow> {
  const existing = await findCategoryByName(name);
  if (existing) return existing;

  const db = await getDb();
  const id = generateUuid();
  await db.runAsync(
    `INSERT INTO categories (id, name, is_custom, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO NOTHING;`,
    id,
    name,
    isCustom ? 1 : 0,
    nowIso()
  );
  const created = await findCategoryByName(name);
  if (!created) throw new Error('Failed to create category');
  return created;
}

/** Explicit "add a category" entry point for Settings → Categories: unlike getOrCreateCategory
 *  (which silently reuses an existing row — used by the classifier/save path where that's exactly
 *  what's wanted), this throws a user-facing error on an empty or case-insensitive-duplicate name
 *  so the Add Category modal can surface clear validation feedback. */
export async function createCategory(name: string): Promise<CategoryRow> {
  const existing = await listCategories();
  const result = validateNewCategoryName(name, existing);
  if (!result.ok) throw new Error(result.error);
  return getOrCreateCategory(result.trimmed, true);
}

/** Renames a user-created category in place. Because every reference to a category elsewhere
 *  (company_categories) is by id, not name, renaming needs no data migration — every card/company
 *  already tagged with this category keeps working, now showing the new name. "Other" cannot be
 *  renamed (enforced by validateRenameCategory). */
export async function renameCategory(id: string, newName: string): Promise<CategoryRow> {
  const existing = await listCategories();
  const category = existing.find((c) => c.id === id);
  if (!category) throw new Error('Category not found.');
  const result = validateRenameCategory(category, newName, existing);
  if (!result.ok) throw new Error(result.error);

  const db = await getDb();
  await db.runAsync('UPDATE categories SET name = ? WHERE id = ?;', result.trimmed, id);
  const updated = await db.getFirstAsync<any>('SELECT * FROM categories WHERE id = ?;', id);
  if (!updated) throw new Error('Failed to rename category');
  return mapCategory(updated);
}

/** Deletes a user-created category, first moving every company currently tagged with it over to
 *  "Other" (never deleting the cards/companies/representatives themselves — only the category
 *  link). "Other" itself can never be deleted (enforced by canDeleteCategory). */
export async function deleteCategory(id: string): Promise<void> {
  const existing = await listCategories();
  const category = existing.find((c) => c.id === id);
  if (!category) throw new Error('Category not found.');
  const check = canDeleteCategory(category);
  if (!check.ok) throw new Error(check.error);

  const other = await getOrCreateCategory(OTHER_CATEGORY_NAME, false);
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const linkedCompanies = await db.getAllAsync<{ company_id: string }>(
      'SELECT company_id FROM company_categories WHERE category_id = ?;',
      id
    );
    for (const row of linkedCompanies) {
      await db.runAsync(
        `INSERT INTO company_categories (company_id, category_id, confidence) VALUES (?, ?, 1)
         ON CONFLICT(company_id, category_id) DO UPDATE SET confidence = excluded.confidence;`,
        row.company_id,
        other.id
      );
    }
    // Cascades the now-superseded company_categories rows for this category id (every affected
    // company already has an "Other" link inserted above, so nothing loses its category).
    await db.runAsync('DELETE FROM categories WHERE id = ?;', id);
  });
}

/** Number of distinct cards currently under each category, keyed by category id — powers the
 *  "24 cards" counts on Settings → Categories. A card counts toward a category when its company is
 *  linked to that category via company_categories; cards with no company yet (never finished
 *  saving) aren't counted anywhere, matching how they're excluded from category filtering too. */
export async function getCategoryCardCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category_id: string; n: number }>(
    `SELECT cc.category_id as category_id, COUNT(DISTINCT c.id) as n
     FROM company_categories cc
     JOIN cards c ON c.company_id = cc.company_id
     GROUP BY cc.category_id;`
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.category_id] = row.n;
  return counts;
}
