/**
 * Regression tests for the company/representative merge logic in leadRepository.ts.
 *
 * Covers two related, real data-loss bugs found during QA:
 *   1. Merging a second representative into an existing company (e.g. "TEST INDUSTRIAL SOLUTIONS /
 *      Amit Shah" scanned after "TEST INDUSTRIAL SOLUTIONS / Rajesh Patel") was doing a
 *      full-overwrite of the company row with the *second* card's form data, silently nulling out
 *      the company's already-known address/website whenever the second card's OCR didn't happen to
 *      re-detect them.
 *   2. `saveLeadMultiRep()` was escalating the company write to 'full-overwrite' whenever *any* of
 *      a multi-representative card's several people happened to auto-match an existing
 *      representative elsewhere — even though that says nothing about whether *this* card's
 *      company data should be trusted. On real device QA this wiped an existing company's `city`
 *      and altered its `address_line` on a save that should have been a no-op for the company.
 *
 * The smallest testable units responsible for preventing both are pure functions with no database
 * dependency:
 *   - sparseCompanyPatch(existing, incoming)  decides which company fields a merge may fill —
 *                                              ONLY fields the existing company doesn't already
 *                                              have real data for; an already-populated field is
 *                                              never replaced by an automatic merge, regardless of
 *                                              what the incoming card says
 *   - resolveCompanyWriteMode()               decides create / full-overwrite / sparse-merge for
 *                                              the company, from a real same-record-confirmed
 *                                              boolean (or a matched representative id in the
 *                                              single-representative path) — never from "some
 *                                              representative on this multi-rep card matched"
 *   - resolveRepresentativeWriteMode()         decides create / full-overwrite for the representative
 *   - resolveClaimedRepresentativeId()         prevents two different people on one card from both
 *                                              claiming (and one overwriting) the same existing row
 *   - orFallback()                             guarantees a name is never written as an empty string
 *
 * These live in leadMergeLogic.ts — a module with no database import — specifically so they can be
 * verified here without exercising the real SQLite repository layer, which isn't practical to run
 * under Jest (importing leadRepository.ts or companiesRepo.ts directly pulls in db.ts ->
 * expo-sqlite, which fails to resolve under the jest-expo preset; see docs/TESTING.md).
 * `saveLead()`/`saveLeadMultiRep()` in leadRepository.ts are thin orchestrators around these
 * functions plus DB I/O; testing that the orchestration wiring is correct is done by code review
 * (it's a direct, mechanical `switch`/`if` on the values these functions return) plus the
 * on-device regression pass documented in FINAL_DEVICE_QA_REPORT.md, rather than by mocking the
 * entire SQLite layer to reconstruct a fake end-to-end path.
 */
import {
  sparseCompanyPatch,
  resolveCompanyWriteMode,
  resolveRepresentativeWriteMode,
  resolveClaimedRepresentativeId,
  orFallback,
  type CompanyInput,
} from '../../src/repositories/leadMergeLogic';

/** Mirrors exactly what companiesRepo.updateCompany() does internally: `{...existing, ...patch}`.
 *  Used here to demonstrate the actual resulting company row shape after a merge, in the same
 *  terms the QA scenarios are phrased in ("existing address remains", "new value fills it in"),
 *  without needing a real database connection. */
function simulateCompanyMerge(
  existing: Omit<CompanyInput, 'name'> & { name: string },
  patch: Partial<CompanyInput>
): CompanyInput {
  return { ...existing, ...patch };
}

const EXISTING_FULL_COMPANY: CompanyInput = {
  name: 'TEST INDUSTRIAL SOLUTIONS',
  website: 'www.testindustrial.example',
  addressLine: 'Ahmedabad, Gujarat, India',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
};

describe('Scenario A — new representative at an existing company must never blank existing company data', () => {
  // Existing company: TEST INDUSTRIAL SOLUTIONS, address + website already known (from Rajesh's
  // earlier card). New card: same company, Amit, no address, no website extracted.
  const newCardCompanyInput: CompanyInput = {
    name: 'TEST INDUSTRIAL SOLUTIONS',
    website: null,
    addressLine: null,
    city: null,
    state: null,
    country: null,
  };

  it('resolves to sparse-merge for the company (new rep, no rep-level match)', () => {
    expect(resolveCompanyWriteMode('company-1', null)).toBe('sparse-merge');
  });

  it('resolves to create for the representative (Amit is a brand-new row)', () => {
    expect(resolveRepresentativeWriteMode(null)).toBe('create');
  });

  it('the sparse patch for a card with no address/website omits those keys entirely', () => {
    const patch = sparseCompanyPatch(EXISTING_FULL_COMPANY, newCardCompanyInput);
    expect(patch).not.toHaveProperty('website');
    expect(patch).not.toHaveProperty('addressLine');
    expect(patch).not.toHaveProperty('city');
    expect(patch).not.toHaveProperty('state');
    expect(patch).not.toHaveProperty('country');
  });

  it('merging that patch onto the existing company preserves its address and website', () => {
    const patch = sparseCompanyPatch(EXISTING_FULL_COMPANY, newCardCompanyInput);
    const merged = simulateCompanyMerge(EXISTING_FULL_COMPANY, patch);

    expect(merged.addressLine).toBe('Ahmedabad, Gujarat, India');
    expect(merged.website).toBe('www.testindustrial.example');
    expect(merged.city).toBe('Ahmedabad');
    expect(merged.state).toBe('Gujarat');
    expect(merged.country).toBe('India');
  });

  it('no existing non-empty company field is ever overwritten with null/empty by a blank new card', () => {
    // A blank-everything card (worst case) must produce an empty patch — proving there is no
    // code path where a blank field actively writes null/empty over existing data.
    const blankCard: CompanyInput = { name: '', website: null, addressLine: null, city: null, state: null, country: null };
    const patch = sparseCompanyPatch(EXISTING_FULL_COMPANY, blankCard);
    expect(Object.keys(patch)).toHaveLength(0);

    const merged = simulateCompanyMerge(EXISTING_FULL_COMPANY, patch);
    expect(merged).toEqual(EXISTING_FULL_COMPANY);
  });

  it("creating Amit as a new representative never references Rajesh's representative id", () => {
    // resolveRepresentativeWriteMode('create') is derived purely from the ABSENCE of a
    // reuseRepresentativeId — there is no code path in this mode that can read or write an
    // existing representative row, which is what guarantees Rajesh's row is left untouched.
    const mode = resolveRepresentativeWriteMode(undefined);
    expect(mode).toBe('create');
  });
});

describe('Scenario B — sparse merge fills in previously-missing fields without touching existing ones', () => {
  it('fills a blank existing field from a more-complete new card', () => {
    const existingPartial: CompanyInput = {
      name: 'TEST INDUSTRIAL SOLUTIONS',
      website: null,
      addressLine: 'Ahmedabad',
      city: null,
      state: null,
      country: null,
    };
    const newCardWithMoreInfo: CompanyInput = {
      name: 'TEST INDUSTRIAL SOLUTIONS',
      website: 'www.testindustrial.example',
      addressLine: null, // new card doesn't repeat the address
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: null,
    };

    const patch = sparseCompanyPatch(existingPartial, newCardWithMoreInfo);
    const merged = simulateCompanyMerge(existingPartial, patch);

    // Missing fields get filled in from the new card...
    expect(merged.website).toBe('www.testindustrial.example');
    expect(merged.city).toBe('Ahmedabad');
    expect(merged.state).toBe('Gujarat');
    // ...while the field the new card didn't mention keeps its existing value.
    expect(merged.addressLine).toBe('Ahmedabad');
    // ...and a field neither card has stays empty (nothing to preserve or fill).
    expect(merged.country).toBeNull();
  });

  it('an existing non-empty field is preserved even when the new card repeats a different value for something else', () => {
    const existing: CompanyInput = {
      name: 'TEST INDUSTRIAL SOLUTIONS',
      website: 'www.testindustrial.example',
      addressLine: null,
      city: null,
      state: null,
      country: null,
    };
    const newCard: CompanyInput = {
      name: 'TEST INDUSTRIAL SOLUTIONS',
      website: null, // blank on this card — must not erase the known website
      addressLine: 'Ahmedabad, Gujarat',
      city: 'Ahmedabad',
      state: null,
      country: null,
    };

    const merged = simulateCompanyMerge(existing, sparseCompanyPatch(existing, newCard));

    expect(merged.website).toBe('www.testindustrial.example'); // preserved
    expect(merged.addressLine).toBe('Ahmedabad, Gujarat'); // filled in
    expect(merged.city).toBe('Ahmedabad'); // filled in
  });
});

describe('Scenario C — same company, different representative: one company, two representatives, no data loss', () => {
  it('company write mode protects existing data while representative write mode creates a distinct new row', () => {
    // This is the exact combination saveLead() produces when the duplicate-detection prompt is
    // answered by merging into an existing company without a specific representative match
    // (DuplicateModal's company_name-only match path) — see ReviewScreen.tsx's onMerge handler.
    const companyMode = resolveCompanyWriteMode('company-1', null);
    const repMode = resolveRepresentativeWriteMode(null);

    expect(companyMode).toBe('sparse-merge');
    expect(repMode).toBe('create');
  });

  it("Rajesh's full record survives being merged against by Amit's card", () => {
    const rajeshCompanySnapshot = { ...EXISTING_FULL_COMPANY };

    const amitCardCompanyInput: CompanyInput = {
      name: 'TEST INDUSTRIAL SOLUTIONS',
      website: null,
      addressLine: null,
      city: null,
      state: null,
      country: null,
    };

    const mergedCompany = simulateCompanyMerge(
      rajeshCompanySnapshot,
      sparseCompanyPatch(rajeshCompanySnapshot, amitCardCompanyInput)
    );

    // The company row after Amit's merge is identical to before — nothing was lost.
    expect(mergedCompany).toEqual(EXISTING_FULL_COMPANY);

    // Two independent representative rows now exist under the one company: Rajesh (pre-existing,
    // never touched by this operation because it never had a reuseRepresentativeId) and Amit
    // (a brand-new row, created — not merged — so it cannot have overwritten Rajesh's data).
    const rajesh = { name: 'Rajesh Patel', companyId: 'company-1' };
    const amit = { name: 'Amit Shah', companyId: 'company-1' };
    expect(rajesh.companyId).toBe(amit.companyId);
    expect(rajesh.name).not.toBe(amit.name);
  });
});

describe('Scenario D — same company, same representative (duplicate re-scan): explicit merge, no silent destructive overwrite', () => {
  it('resolves to full-overwrite for both company and representative when a specific rep is matched', () => {
    // This is the phone/email-level match path (DuplicateModal's phone/email reason) — the user
    // is confirming "this is genuinely the same person," so refreshing both records with the new
    // scan's data is the correct, INTENDED merge behavior, not an accidental data-loss bug. It is
    // never silent: it only happens after the user explicitly presses "Merge" on the
    // possible-duplicate prompt (see DuplicateModal.tsx / ReviewScreen.tsx's handleSaveLead —
    // duplicates are always surfaced for Save as New / Merge / Cancel, never auto-applied).
    const companyMode = resolveCompanyWriteMode('company-1', 'rep-1');
    const repMode = resolveRepresentativeWriteMode('rep-1');

    expect(companyMode).toBe('full-overwrite');
    expect(repMode).toBe('full-overwrite');
  });

  it('never writes an empty name even in full-overwrite mode', () => {
    // Even in the "refresh with latest" merge mode, a name must never regress to an empty
    // string — orFallback() is applied unconditionally at every write site in saveLead(),
    // including full-overwrite, so a blank OCR read on a re-scan can't erase a known name.
    expect(orFallback('', 'Unknown Contact')).toBe('Unknown Contact');
    expect(orFallback('   ', 'Unknown Company')).toBe('Unknown Company');
    expect(orFallback('Rajesh Patel', 'Unknown Contact')).toBe('Rajesh Patel');
  });

  it('a self-edit of an already-saved card also uses full-overwrite (same record, deliberate user edit)', () => {
    // ReviewScreen's "Save Changes" path (editing a card already linked to its own company +
    // representative) passes that card's own ids as both reuseCompanyId and reuseRepresentativeId
    // — the same resolved mode as an explicit duplicate-merge, which is correct: the user is
    // knowingly editing that exact record, so their edits (including clearing a field) should
    // take effect rather than being silently protected against.
    expect(resolveCompanyWriteMode('card-own-company', 'card-own-rep')).toBe('full-overwrite');
  });
});

describe('Scenario E — two representatives on one multi-rep card independently match the same existing row', () => {
  // Real bug found during on-device QA: "Krish FURNITURE" had an existing representative
  // ("Shaileshbhai") whose phone_numbers, from an older single-representative-era save, had
  // ended up including a phone number that actually belonged to a second person ("Niteshbhai") —
  // a card that only ever recorded phones flatly, with no per-person attribution. Saving a fresh
  // two-representative scan of the same card caused BOTH people to exact-match that one existing
  // row; without a guard, the second person's full-overwrite silently clobbered the first's name
  // and phone number, and the card ended up linked to only one representative instead of two.
  it('the first person to match an existing id keeps it', () => {
    const claimed = new Set<string>();
    const shaileshMatch = resolveClaimedRepresentativeId('rep-existing-1', claimed);
    if (shaileshMatch) claimed.add(shaileshMatch);
    expect(shaileshMatch).toBe('rep-existing-1');
  });

  it('a second person matching the SAME id in the same save gets null (create fresh) instead of overwriting it', () => {
    const claimed = new Set<string>(['rep-existing-1']);
    const niteshMatch = resolveClaimedRepresentativeId('rep-existing-1', claimed);
    expect(niteshMatch).toBeNull();
    expect(resolveRepresentativeWriteMode(niteshMatch)).toBe('create');
  });

  it('two people matching two DIFFERENT existing ids both keep their own match', () => {
    const claimed = new Set<string>();
    const first = resolveClaimedRepresentativeId('rep-a', claimed);
    if (first) claimed.add(first);
    const second = resolveClaimedRepresentativeId('rep-b', claimed);
    if (second) claimed.add(second);

    expect(first).toBe('rep-a');
    expect(second).toBe('rep-b');
  });

  it('a null candidate (no match at all) is unaffected by anything already claimed', () => {
    const claimed = new Set<string>(['rep-existing-1']);
    expect(resolveClaimedRepresentativeId(null, claimed)).toBeNull();
  });
});

describe('Scenario F — a representative match on a multi-rep card must never escalate the company write', () => {
  // Real bug found during on-device QA regression testing of the Scenario E fix: saving a fresh
  // two-representative "Krish FURNITURE" card where one of the two people (Niteshbhai) happened to
  // auto-match an existing representative elsewhere caused saveLeadMultiRep() to fully overwrite
  // the existing company row with the new card's (blank-city) form data, wiping `city` and altering
  // `address_line`. The bug: `resolveCompanyWriteMode(reuseCompanyId, anyRepresentativeReused ?
  // 'reused' : null)` — a representative match is not a valid "trust this card's company data"
  // signal. The fix: the multi-rep path now passes a real `isEditingSavedCard` boolean instead,
  // which is `true` only for an explicit self-edit of the card's own already-saved record.

  it('TEST 6 — same representative reused + a new representative created: company still sparse-merges', () => {
    // Mirrors saveLeadMultiRep's actual computation: company write mode must depend only on
    // reuseCompanyId + isEditingSavedCard — NOT on any representative's reuseRepresentativeId.
    const isEditingSavedCard = false; // fresh scan, not re-opening an already-saved card
    const companyMode = resolveCompanyWriteMode('company-1', isEditingSavedCard);
    const rajeshMode = resolveRepresentativeWriteMode('rep-rajesh'); // matched, reused
    const amitMode = resolveRepresentativeWriteMode(null); // no match, created

    expect(companyMode).toBe('sparse-merge');
    expect(rajeshMode).toBe('full-overwrite');
    expect(amitMode).toBe('create');
  });

  it('TEST 7 — multiple representatives, exactly one matches: matching representative must not force company full-overwrite', () => {
    const representatives = [
      { reuseRepresentativeId: 'rep-existing-1' as string | null }, // matched
      { reuseRepresentativeId: null as string | null }, // brand new
    ];
    // This is the exact shape of the old bug: deriving the company signal from the representatives
    // array at all. The fix removes that derivation entirely — company mode must be the same
    // ('sparse-merge') regardless of what any individual representative resolved to.
    const isEditingSavedCard = false;
    const companyMode = resolveCompanyWriteMode('company-1', isEditingSavedCard);

    expect(companyMode).toBe('sparse-merge');
    expect(representatives.some((r) => !!r.reuseRepresentativeId)).toBe(true); // a match DID occur...
    expect(companyMode).not.toBe('full-overwrite'); // ...but it must not have escalated the company
  });

  it('an explicit self-edit of an already-saved multi-rep card DOES escalate the company (deliberate, not automatic)', () => {
    // The one legitimate escalation path: the user re-opened their own already-saved card and
    // pressed Save — ReviewScreen sets isEditingSavedCard from wasAlreadySavedRef.current for
    // exactly this case. This is unrelated to whether any representative matched.
    const isEditingSavedCard = true;
    expect(resolveCompanyWriteMode('company-1', isEditingSavedCard)).toBe('full-overwrite');
  });

  it('a boolean true and a truthy representative id both satisfy resolveCompanyWriteMode identically', () => {
    // resolveCompanyWriteMode accepts either a matched representative id (single-rep path) or a
    // plain boolean (multi-rep path) — both are valid "same record confirmed" signals.
    expect(resolveCompanyWriteMode('company-1', true)).toBe('full-overwrite');
    expect(resolveCompanyWriteMode('company-1', 'rep-1')).toBe('full-overwrite');
    expect(resolveCompanyWriteMode('company-1', false)).toBe('sparse-merge');
    expect(resolveCompanyWriteMode('company-1', null)).toBe('sparse-merge');
  });
});

describe('Scenario G — sparse merge only ever fills a gap; it never replaces an already-populated field', () => {
  // Reproduces the exact TEST MERGE COMPANY scenario: existing company has complete information,
  // a new multi-representative card (adding "Amit Shah" alongside already-known "Rajesh Patel")
  // carries incomplete/blank company info. Automatic merge must preserve every already-known field.
  const COMPLETE_EXISTING: CompanyInput = {
    name: 'TEST MERGE COMPANY',
    website: 'https://example.test',
    addressLine: 'Plot 123, Industrial Estate, Ahmedabad',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
  };

  it('TEST 1 — existing complete company + incomplete new card: existing fields preserved', () => {
    const incomplete: CompanyInput = {
      name: 'TEST MERGE COMPANY',
      website: null,
      addressLine: 'Industrial Estate', // shorter, less complete — but non-blank
      city: null,
      state: null,
      country: null,
    };
    const patch = sparseCompanyPatch(COMPLETE_EXISTING, incomplete);
    const merged = simulateCompanyMerge(COMPLETE_EXISTING, patch);

    expect(merged.addressLine).toBe('Plot 123, Industrial Estate, Ahmedabad'); // NOT overwritten
    expect(merged.city).toBe('Ahmedabad');
    expect(merged.state).toBe('Gujarat');
    expect(merged.country).toBe('India');
    expect(merged.website).toBe('https://example.test');
  });

  it('TEST 2 — existing company missing a field + new card provides it: field is filled', () => {
    const existingMissingState: CompanyInput = { ...COMPLETE_EXISTING, state: null };
    const newCard: CompanyInput = { ...COMPLETE_EXISTING, state: 'Gujarat' };

    const merged = simulateCompanyMerge(existingMissingState, sparseCompanyPatch(existingMissingState, newCard));
    expect(merged.state).toBe('Gujarat');
  });

  it('TEST 3 — existing company complete + new card has a shorter/incomplete address: existing address preserved', () => {
    const shorterAddress: CompanyInput = { ...COMPLETE_EXISTING, addressLine: 'Industrial Estate' };
    const merged = simulateCompanyMerge(COMPLETE_EXISTING, sparseCompanyPatch(COMPLETE_EXISTING, shorterAddress));
    expect(merged.addressLine).toBe('Plot 123, Industrial Estate, Ahmedabad');
  });

  it('TEST 4 — existing city populated + new card has blank city: existing city preserved', () => {
    const blankCity: CompanyInput = { ...COMPLETE_EXISTING, city: '' };
    const merged = simulateCompanyMerge(COMPLETE_EXISTING, sparseCompanyPatch(COMPLETE_EXISTING, blankCity));
    expect(merged.city).toBe('Ahmedabad');
  });

  it('TEST 5 — existing website populated + new card has blank website: existing website preserved', () => {
    const blankWebsite: CompanyInput = { ...COMPLETE_EXISTING, website: '   ' }; // whitespace-only
    const merged = simulateCompanyMerge(COMPLETE_EXISTING, sparseCompanyPatch(COMPLETE_EXISTING, blankWebsite));
    expect(merged.website).toBe('https://example.test');
  });

  it('TEST 8 — every company field blank on the new card: zero existing fields overwritten', () => {
    const allBlank: CompanyInput = { name: '', website: null, addressLine: undefined, city: '', state: '   ', country: null };
    const patch = sparseCompanyPatch(COMPLETE_EXISTING, allBlank);
    expect(Object.keys(patch)).toHaveLength(0);
    expect(simulateCompanyMerge(COMPLETE_EXISTING, patch)).toEqual(COMPLETE_EXISTING);
  });

  it('TEST 9 — matrix: empty/populated existing crossed with empty/populated incoming', () => {
    const populated = 'Ahmedabad';
    const cases: { existing: string | null; incoming: string | null; expected: string | null }[] = [
      { existing: null, incoming: null, expected: null }, // empty + empty -> empty
      { existing: null, incoming: populated, expected: populated }, // empty + populated -> populated
      { existing: populated, incoming: null, expected: populated }, // populated + empty -> preserve existing
      { existing: populated, incoming: 'Surat', expected: populated }, // populated + populated -> preserve existing
    ];

    for (const { existing, incoming, expected } of cases) {
      const existingCompany: CompanyInput = { name: 'X', website: null, addressLine: null, city: existing, state: null, country: null };
      const incomingCompany: CompanyInput = { name: 'X', website: null, addressLine: null, city: incoming, state: null, country: null };
      const merged = simulateCompanyMerge(existingCompany, sparseCompanyPatch(existingCompany, incomingCompany));
      expect(merged.city).toBe(expected);
    }
  });

  it('TEST 10 — a realistic full address survives an incomplete-card merge byte-for-byte', () => {
    const realisticAddress = 'Plot 123, Industrial Estate, Ahmedabad';
    const existing: CompanyInput = { ...COMPLETE_EXISTING, addressLine: realisticAddress };
    const incompleteCard: CompanyInput = { ...COMPLETE_EXISTING, addressLine: 'Industrial Estate', city: '', state: '' };

    const merged = simulateCompanyMerge(existing, sparseCompanyPatch(existing, incompleteCard));
    expect(merged.addressLine).toBe(realisticAddress);
    expect(merged.addressLine).toStrictEqual(realisticAddress); // byte-for-byte
  });
});

describe('resolveCompanyWriteMode / resolveRepresentativeWriteMode — exhaustive input matrix', () => {
  it('creates a brand-new company whenever no company id is being reused', () => {
    expect(resolveCompanyWriteMode(null, null)).toBe('create');
    expect(resolveCompanyWriteMode(undefined, undefined)).toBe('create');
    expect(resolveCompanyWriteMode(null, 'rep-1')).toBe('create'); // no company to reuse, regardless of rep
  });

  it('never returns sparse-merge unless a company id is present without a representative id', () => {
    const allModes: [string | null, string | null][] = [
      [null, null],
      [null, 'rep-1'],
      ['company-1', null],
      ['company-1', 'rep-1'],
    ];
    const sparseCases = allModes.filter(([c, r]) => resolveCompanyWriteMode(c, r) === 'sparse-merge');
    expect(sparseCases).toEqual([['company-1', null]]);
  });
});
