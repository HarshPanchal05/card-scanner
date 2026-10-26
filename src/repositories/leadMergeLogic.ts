/**
 * Pure decision logic for how a reviewed card's company/representative data gets written to the
 * database — no I/O, no database import. Deliberately kept in its own module (rather than living
 * directly in leadRepository.ts) so it can be unit tested without pulling in expo-sqlite: any
 * module that also imports `createCompany`/`updateCompany` etc. from companiesRepo.ts transitively
 * loads db.ts -> expo-sqlite, which isn't resolvable under Jest (see tests/repositories/
 * leadRepository.merge.test.ts). This file's only import is `type CompanyInput`, which TypeScript
 * erases entirely at compile time, so importing this module has zero runtime side effects.
 *
 * This is the fix for a real data-loss bug found during QA: merging a second representative into
 * an existing company (e.g. "TEST INDUSTRIAL SOLUTIONS / Amit Shah" scanned after "TEST INDUSTRIAL
 * SOLUTIONS / Rajesh Patel") was doing a full-overwrite of the company row with the *second*
 * card's form data, silently nulling out the company's already-known address/website whenever the
 * second card's OCR didn't happen to re-detect them.
 *
 * A second, related data-loss bug found later during multi-representative on-device QA:
 * `saveLeadMultiRep` was escalating the company write to 'full-overwrite' whenever *any* of the
 * card's several representatives happened to auto-match an existing representative elsewhere —
 * even though that match says nothing about whether *this* card's company data is trustworthy or
 * complete. That wiped a company's `city` and altered its `address_line` on a save that should
 * have been a no-op for the company. See `resolveCompanyWriteMode`'s doc comment and
 * `sparseCompanyPatch`'s "fill gaps, never replace" semantics below, which close both bugs.
 */
import type { CompanyInput } from './companiesRepo';
export type { CompanyInput };

export function orFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** Builds the patch applied to an EXISTING company when a card is merged into it automatically —
 *  without the user explicitly confirming "this is the same record" (i.e. a new/different person
 *  at that company, the "multiple representatives, one company" case). For every field except
 *  `name`, the new card's value is used ONLY to fill a field the existing company doesn't have a
 *  real value for yet; a field the existing company already has non-blank data for is NEVER
 *  touched, no matter what the new card says — automatic merging only ever adds information it
 *  didn't have before, it never lets one card's guess second-guess another card's. `name` is kept
 *  at its original always-overwrite-when-non-blank behavior (unaffected by this bug/fix): the two
 *  cards matched on normalized name in the first place, so a differently-cased/spaced raw name is
 *  expected and harmless to take from the latest scan.
 *
 *  This is the core data-loss-prevention unit: `updateCompany()` merges whatever this returns as
 *  `{...existing, ...patch}`, so a key that's absent here is a key that's left untouched — the
 *  entire "never overwrite good data with blank OR merely-different data" guarantee lives in which
 *  keys this function chooses to include. */
export function sparseCompanyPatch(existing: CompanyInput, incoming: CompanyInput): Partial<CompanyInput> {
  const patch: Partial<CompanyInput> = {};
  const name = incoming.name.trim();
  if (name.length > 0) patch.name = name;

  const fillableKeys = ['website', 'addressLine', 'city', 'state', 'country'] as const;
  for (const key of fillableKeys) {
    if (isBlank(existing[key]) && !isBlank(incoming[key])) {
      patch[key] = incoming[key];
    }
  }
  return patch;
}

export type CompanyWriteMode = 'create' | 'full-overwrite' | 'sparse-merge';
export type RepresentativeWriteMode = 'create' | 'full-overwrite';

/** Decides how the company row should be written for a given save — no I/O, no database access.
 *  This is the exact decision responsible for the data-loss bugs this module fixes:
 *   - no reuseCompanyId                 -> 'create'          a brand-new company
 *   - reuseCompanyId, no confirmation   -> 'sparse-merge'     a NEW/different representative is
 *                                                              being attached to an EXISTING
 *                                                              company (or a fresh multi-rep
 *                                                              card is adding people to one);
 *                                                              that company's already-known
 *                                                              fields must never be blanked out
 *                                                              or replaced by this card
 *   - reuseCompanyId AND confirmation   -> 'full-overwrite'   the caller has an EXPLICIT "this is
 *                                                              the same record" confirmation —
 *                                                              writing the form's current values
 *                                                              is the correct, intended behavior
 *
 *  `sameRecordConfirmed` truthiness is the confirmation signal: in the single-representative path
 *  (`saveLead`) it's the matched representative's id (a specific phone/email match, or the card's
 *  own representative id on a self-edit). In the multi-representative path (`saveLeadMultiRep`) a
 *  representative id is NOT a valid signal here — one of several people on a card auto-matching an
 *  existing representative elsewhere says nothing about whether *this* card's company data should
 *  be trusted, so that path must pass a plain `boolean`: `true` only when the whole card is a
 *  self-edit of its own already-saved record (an explicit, deliberate edit), never merely because a
 *  representative matched. Passing a representative id there was exactly the second data-loss bug
 *  this module fixes — see the module doc comment above. */
export function resolveCompanyWriteMode(
  reuseCompanyId: string | null | undefined,
  sameRecordConfirmed: string | boolean | null | undefined
): CompanyWriteMode {
  if (!reuseCompanyId) return 'create';
  return sameRecordConfirmed ? 'full-overwrite' : 'sparse-merge';
}

/** Decides how the representative row should be written — reusing an id means "update this exact
 *  person's record" (an explicit merge/self-edit confirmation); no id means a brand-new
 *  representative row, which by construction never touches any other representative's data. */
export function resolveRepresentativeWriteMode(
  reuseRepresentativeId: string | null | undefined
): RepresentativeWriteMode {
  return reuseRepresentativeId ? 'full-overwrite' : 'create';
}

/** Guards against two different people on the same multi-representative card independently
 *  matching the same existing representative row — e.g. an older single-representative save had
 *  attributed every phone number found on the card to the one person it knew about, so today a
 *  second, previously-unrecorded person's phone number can still exact-match that same row. This
 *  is the fix for a real data-loss bug found during QA: saving a two-representative card
 *  ("Shaileshbhai" + "Niteshbhai") where both independently matched one pre-existing representative
 *  row caused the second person's full-overwrite to silently clobber the first's name and phone
 *  number, and the card ended up linked to only one representative instead of two.
 *
 *  The first person to reach a given candidate id keeps it (full-overwrite, as intended); anyone
 *  else falls back to `null` (create a fresh row instead of overwriting the first match again). */
export function resolveClaimedRepresentativeId(
  candidateId: string | null,
  alreadyClaimed: ReadonlySet<string>
): string | null {
  if (candidateId && alreadyClaimed.has(candidateId)) return null;
  return candidateId;
}
