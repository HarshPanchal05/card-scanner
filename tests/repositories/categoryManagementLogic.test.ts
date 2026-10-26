import {
  validateNewCategoryName,
  validateRenameCategory,
  canDeleteCategory,
  resolveCategoryAssignment,
} from '../../src/repositories/categoryManagementLogic';
import { OTHER_CATEGORY_NAME } from '../../src/constants/categories';

describe('validateNewCategoryName', () => {
  const existing = [{ name: 'Furniture' }, { name: 'Electrical' }, { name: OTHER_CATEGORY_NAME }];

  it('accepts a new, non-duplicate name and returns it trimmed', () => {
    const result = validateNewCategoryName('  Real Estate  ', existing);
    expect(result).toEqual({ ok: true, trimmed: 'Real Estate' });
  });

  it('rejects an empty name', () => {
    const result = validateNewCategoryName('', existing);
    expect(result.ok).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    const result = validateNewCategoryName('   ', existing);
    expect(result.ok).toBe(false);
  });

  it('rejects a case-insensitive duplicate', () => {
    const result = validateNewCategoryName('furniture', existing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already exists/i);
  });

  it('rejects a duplicate with different surrounding whitespace', () => {
    const result = validateNewCategoryName('  FURNITURE ', existing);
    expect(result.ok).toBe(false);
  });
});

describe('validateRenameCategory', () => {
  const existing = [
    { id: '1', name: 'Furniture' },
    { id: '2', name: 'Electrical' },
    { id: '3', name: OTHER_CATEGORY_NAME },
  ];

  it('allows renaming a category to a genuinely new name', () => {
    const result = validateRenameCategory({ id: '1', name: 'Furniture' }, 'Furniture & Interior', existing);
    expect(result).toEqual({ ok: true, trimmed: 'Furniture & Interior' });
  });

  it('allows renaming a category to its own current name unchanged (no false self-collision)', () => {
    const result = validateRenameCategory({ id: '1', name: 'Furniture' }, 'Furniture', existing);
    expect(result.ok).toBe(true);
  });

  it('rejects renaming to another existing category name', () => {
    const result = validateRenameCategory({ id: '1', name: 'Furniture' }, 'Electrical', existing);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty new name', () => {
    const result = validateRenameCategory({ id: '1', name: 'Furniture' }, '   ', existing);
    expect(result.ok).toBe(false);
  });

  it('never allows renaming "Other"', () => {
    const result = validateRenameCategory({ id: '3', name: OTHER_CATEGORY_NAME }, 'Everything Else', existing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot be renamed/i);
  });
});

describe('canDeleteCategory', () => {
  it('allows deleting an ordinary category', () => {
    expect(canDeleteCategory({ name: 'Furniture' })).toEqual({ ok: true });
  });

  it('never allows deleting "Other"', () => {
    const result = canDeleteCategory({ name: OTHER_CATEGORY_NAME });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/cannot be deleted/i);
  });
});

describe('resolveCategoryAssignment', () => {
  it('applies a fresh auto-classification when there is no current assignment', () => {
    const result = resolveCategoryAssignment(null, { categoryName: 'Furniture', source: 'auto' });
    expect(result).toEqual({ categoryName: 'Furniture', source: 'auto' });
  });

  it('applies a fresh auto-classification over a previous auto assignment', () => {
    const current = { categoryName: OTHER_CATEGORY_NAME, source: 'auto' as const };
    const result = resolveCategoryAssignment(current, { categoryName: 'Electrical', source: 'auto' });
    expect(result).toEqual({ categoryName: 'Electrical', source: 'auto' });
  });

  it('an explicit manual choice always wins, even over a previous manual choice', () => {
    const current = { categoryName: 'Furniture', source: 'manual' as const };
    const result = resolveCategoryAssignment(current, { categoryName: 'Architecture', source: 'manual' });
    expect(result).toEqual({ categoryName: 'Architecture', source: 'manual' });
  });

  it('a later auto-classification does NOT override a prior manual choice (core requirement)', () => {
    // Task scenario: user manually corrects Other -> Furniture, then a later card for the same
    // company is auto-classified as something else (or Other) — the manual choice must stick.
    const current = { categoryName: 'Furniture', source: 'manual' as const };
    const result = resolveCategoryAssignment(current, { categoryName: OTHER_CATEGORY_NAME, source: 'auto' });
    expect(result).toEqual({ categoryName: 'Furniture', source: 'manual' });
  });

  it('an untouched auto re-save of an already-manual company preserves the manual category and source', () => {
    const current = { categoryName: 'Architecture', source: 'manual' as const };
    const result = resolveCategoryAssignment(current, { categoryName: 'Architecture', source: 'auto' });
    expect(result).toEqual({ categoryName: 'Architecture', source: 'manual' });
  });
});
