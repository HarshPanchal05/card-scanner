/**
 * Pure, DB-free decision logic for category management — mirrors the split already established by
 * leadMergeLogic.ts (DB-touching orchestration lives in categoriesRepo.ts/leadRepository.ts;
 * everything decidable from plain data lives here so it can be unit-tested without a real SQLite
 * connection, which expo-sqlite doesn't provide under Jest).
 */
import { OTHER_CATEGORY_NAME } from '../constants/categories';
import type { CategorySource } from '../types/models';

export type { CategorySource };

export function normalizeCategoryNameForCompare(name: string): string {
  return name.trim().toLowerCase();
}

export type NameValidationResult = { ok: true; trimmed: string } | { ok: false; error: string };

/** Validates a brand-new category name against the app's rules: non-empty after trimming, and no
 *  case-insensitive duplicate among existing categories. */
export function validateNewCategoryName(
  name: string,
  existing: { name: string }[]
): NameValidationResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Category name cannot be empty.' };
  const isDuplicate = existing.some(
    (c) => normalizeCategoryNameForCompare(c.name) === normalizeCategoryNameForCompare(trimmed)
  );
  if (isDuplicate) return { ok: false, error: 'A category with this name already exists.' };
  return { ok: true, trimmed };
}

/** Validates renaming an existing category: "Other" can never be renamed, the new name must be
 *  non-empty, and it must not collide (case-insensitively) with any *other* existing category. */
export function validateRenameCategory(
  category: { id: string; name: string },
  newName: string,
  existing: { id: string; name: string }[]
): NameValidationResult {
  if (category.name === OTHER_CATEGORY_NAME) {
    return { ok: false, error: `"${OTHER_CATEGORY_NAME}" cannot be renamed.` };
  }
  const trimmed = newName.trim();
  if (!trimmed) return { ok: false, error: 'Category name cannot be empty.' };
  const isDuplicate = existing.some(
    (c) => c.id !== category.id && normalizeCategoryNameForCompare(c.name) === normalizeCategoryNameForCompare(trimmed)
  );
  if (isDuplicate) return { ok: false, error: 'A category with this name already exists.' };
  return { ok: true, trimmed };
}

export type DeleteCheckResult = { ok: true } | { ok: false; error: string };

/** "Other" is the permanent fallback bucket and can never be deleted. */
export function canDeleteCategory(category: { name: string }): DeleteCheckResult {
  if (category.name === OTHER_CATEGORY_NAME) {
    return { ok: false, error: `"${OTHER_CATEGORY_NAME}" cannot be deleted.` };
  }
  return { ok: true };
}

export interface CategoryAssignment {
  categoryName: string;
  source: CategorySource;
}

/** Decides what a company's category assignment should become given its current state and an
 *  incoming assignment (either a fresh auto-classification result, or an explicit user choice).
 *
 *  - An explicit user choice (`incoming.source === 'manual'`) always wins and becomes the new
 *    authoritative assignment.
 *  - An incoming auto-classification is applied UNLESS the company's current assignment was
 *    itself manually chosen — in which case the manual choice is preserved untouched. This is
 *    what stops a later automatic classification pass (e.g. from a new card for the same company)
 *    from silently reverting a correction the user already made (task requirement: manual
 *    override must persist across re-scans/edits).
 *  - A company with no current assignment always takes the incoming one, whatever its source. */
export function resolveCategoryAssignment(
  current: CategoryAssignment | null,
  incoming: CategoryAssignment
): CategoryAssignment {
  if (incoming.source === 'manual') return incoming;
  if (current?.source === 'manual') return current;
  return incoming;
}
