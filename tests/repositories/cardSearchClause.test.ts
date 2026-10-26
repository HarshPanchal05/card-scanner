/**
 * Regression tests for the release-blocking search bug: Dashboard/Card Library search returned
 * unrelated results for any non-numeric query (e.g. "Krisha" and "zzznonexistentxyz" both
 * returned the full card list).
 *
 * Root cause: the phone-number LIKE term was built as
 * `%${search.replace(/[^\d]/g, '')}%`. For a query with no digits, the digit-only string is
 * empty, so the pattern collapses to `%%` — and `LIKE '%%'` matches every non-null phone number,
 * making the `EXISTS (... phone_numbers ...)` branch of the OR true for almost any saved card.
 *
 * Fix: `buildCardSearchClause()` (extracted from the two previously-duplicated inline
 * implementations in cardsRepo.ts's `listCards()` and `buildCardFilterClause()`) only appends the
 * phone EXISTS branch when the query contains at least one digit.
 *
 * This is tested as a pure function rather than through cardsRepo.ts directly because
 * repositories/* import expo-sqlite via database/db.ts, which doesn't resolve under the
 * jest-expo preset (see docs/TESTING.md) — the same reason leadMergeLogic.ts's pure functions are
 * tested in isolation from leadRepository.ts. End-to-end confirmation that non-numeric queries
 * return zero/correct results against real saved cards is done on-device (see the QA report).
 */
import { buildCardSearchClause } from '../../src/repositories/cardSearchClause';

describe('buildCardSearchClause — non-numeric queries must not open a phone %% wildcard', () => {
  it('"Krisha" omits the phone EXISTS clause entirely', () => {
    const result = buildCardSearchClause('Krisha');
    expect(result).not.toBeNull();
    expect(result!.clause).not.toContain('phone_numbers');
    expect(result!.params).not.toContain('%%');
  });

  it('"Purvesh" omits the phone EXISTS clause entirely', () => {
    const result = buildCardSearchClause('Purvesh');
    expect(result!.clause).not.toContain('phone_numbers');
    expect(result!.params).not.toContain('%%');
  });

  it('"zzznonexistentxyz" omits the phone EXISTS clause and only searches text fields', () => {
    const result = buildCardSearchClause('zzznonexistentxyz');
    expect(result!.clause).not.toContain('phone_numbers');
    expect(result!.clause).toContain('co.name');
    expect(result!.clause).toContain('r.name');
    expect(result!.clause).toContain('r.designation');
    expect(result!.clause).toContain('e.address');
    // Every text param carries the actual query, never a bare wildcard that would match anything.
    for (const p of result!.params) {
      expect(p).toBe('%zzznonexistentxyz%');
    }
  });

  it('no non-numeric query anywhere in the two originally-duplicated call sites can produce a bare "%%" param', () => {
    for (const q of ['Krisha', 'Purvesh', 'zzznonexistentxyz', 'Acme Corp', 'CEO']) {
      const result = buildCardSearchClause(q);
      expect(result!.params).not.toContain('%%');
    }
  });
});

describe('buildCardSearchClause — numeric and mixed queries keep the existing phone-search behavior', () => {
  it('a real phone number includes the phone EXISTS clause with the digits-only term', () => {
    const result = buildCardSearchClause('9824921087');
    expect(result!.clause).toContain('phone_numbers');
    expect(result!.params).toContain('%9824921087%');
  });

  it('a partially formatted phone number strips punctuation down to digits, same as before the fix', () => {
    const result = buildCardSearchClause('+91 98249-21087');
    expect(result!.clause).toContain('phone_numbers');
    // The digit-stripped term must contain exactly the digits from the input, in order.
    expect(result!.params).toContain('%919824921087%');
  });

  it('a mixed letters+digits query still runs a phone search on the embedded digits alongside the text search', () => {
    const result = buildCardSearchClause('John 1234');
    expect(result!.clause).toContain('phone_numbers');
    expect(result!.params).toContain('%1234%');
    expect(result!.params).toContain('%john 1234%');
  });
});

describe('buildCardSearchClause — empty query preserves the existing unfiltered behavior', () => {
  it('an empty string returns null (no search clause added, filters unaffected)', () => {
    expect(buildCardSearchClause('')).toBeNull();
  });

  it('a whitespace-only string also returns null', () => {
    expect(buildCardSearchClause('   ')).toBeNull();
  });

  it('undefined returns null', () => {
    expect(buildCardSearchClause(undefined)).toBeNull();
  });
});
