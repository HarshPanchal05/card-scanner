import {
  createCompany,
  updateCompany,
  getCompany,
  setCompanyCategories,
  getCompanyCategories,
  setCompanyCategorySource,
  type CompanyInput,
} from './companiesRepo';
import {
  createRepresentative,
  updateRepresentative,
  replacePhoneNumbers,
  replaceEmails,
  type RepresentativeInput,
} from './representativesRepo';
import { getOrCreateCategory } from './categoriesRepo';
import { linkCardToLead, linkCardRepresentatives, findSiblingCardId, markDuplicateOf } from './cardsRepo';
import type { PhoneKind, CategorySource } from '../types/models';
import {
  orFallback,
  sparseCompanyPatch,
  resolveCompanyWriteMode,
  resolveRepresentativeWriteMode,
  resolveClaimedRepresentativeId,
  type CompanyWriteMode,
} from './leadMergeLogic';
import { resolveCategoryAssignment } from './categoryManagementLogic';

// Re-exported for convenience/documentation continuity — the actual implementations (and their
// unit tests) live in leadMergeLogic.ts, which has no database import so it can be tested without
// a real SQLite connection. Import directly from leadMergeLogic.ts in new test/JS code.
export {
  orFallback,
  sparseCompanyPatch,
  resolveCompanyWriteMode,
  resolveRepresentativeWriteMode,
  resolveClaimedRepresentativeId,
};
export type { CompanyWriteMode, RepresentativeWriteMode } from './leadMergeLogic';

export interface SaveLeadInput {
  cardId: string;
  /** Raw, un-defaulted values from the review form — may be empty strings. Fallback sentinels
   *  ("Unknown Company"/"Unknown Contact") are applied here only when creating a brand-new row,
   *  never written over an existing company/representative's real data (see note below). */
  company: CompanyInput;
  representative: Omit<RepresentativeInput, 'companyId'>;
  phones: { rawValue: string; kind: PhoneKind }[];
  emails: string[];
  /** Single authoritative category for this card's company — the Review screen always resolves
   *  to exactly one name (falling back to "Other"), never a list. */
  categoryName: string;
  /** 'manual' when the user explicitly picked/changed it on the Review screen, 'auto' when it's
   *  simply carrying forward the classifier's suggestion untouched — see
   *  categoryManagementLogic.ts's resolveCategoryAssignment for why this distinction matters. */
  categorySource: CategorySource;
  notes: string | null;
  /** When the user confirmed a duplicate match, reuse these instead of creating new rows. */
  reuseCompanyId?: string | null;
  reuseRepresentativeId?: string | null;
}

async function writeCompany(
  company: CompanyInput,
  reuseCompanyId: string | null | undefined,
  mode: CompanyWriteMode
): Promise<string> {
  switch (mode) {
    case 'create': {
      const created = await createCompany({ ...company, name: orFallback(company.name, 'Unknown Company') });
      return created.id;
    }
    case 'full-overwrite':
      await updateCompany(reuseCompanyId!, { ...company, name: orFallback(company.name, 'Unknown Company') });
      return reuseCompanyId!;
    case 'sparse-merge': {
      const existing = await getCompany(reuseCompanyId!);
      if (!existing) throw new Error('Company not found');
      await updateCompany(reuseCompanyId!, sparseCompanyPatch(existing, company));
      return reuseCompanyId!;
    }
  }
}

async function writeRepresentative(
  companyId: string,
  representative: Omit<RepresentativeInput, 'companyId'>,
  phones: { rawValue: string; kind: PhoneKind }[],
  emails: string[],
  reuseRepresentativeId?: string | null
): Promise<string> {
  const mode = resolveRepresentativeWriteMode(reuseRepresentativeId);
  let representativeId: string;
  if (mode === 'full-overwrite') {
    await updateRepresentative(reuseRepresentativeId!, {
      ...representative,
      name: orFallback(representative.name, 'Unknown Contact'),
    });
    representativeId = reuseRepresentativeId!;
  } else {
    const rep = await createRepresentative({
      ...representative,
      name: orFallback(representative.name, 'Unknown Contact'),
      companyId,
    });
    representativeId = rep.id;
  }
  await replacePhoneNumbers(representativeId, phones);
  await replaceEmails(
    representativeId,
    emails.filter(Boolean).map((address) => ({ address }))
  );
  return representativeId;
}

/** Resolves and persists a company's single authoritative category. Compares the incoming
 *  assignment against the company's current one (only meaningful for an already-existing company —
 *  a brand-new company has nothing to preserve) via resolveCategoryAssignment, so a prior manual
 *  correction is never silently reverted by a fresh auto-classification on the next card for the
 *  same company. */
async function writeCompanyCategories(
  companyId: string,
  categoryName: string,
  categorySource: CategorySource,
  isExistingCompany: boolean
): Promise<void> {
  let current: { categoryName: string; source: CategorySource } | null = null;
  if (isExistingCompany) {
    const [existingCategories, company] = await Promise.all([getCompanyCategories(companyId), getCompany(companyId)]);
    if (existingCategories[0] && company) {
      current = { categoryName: existingCategories[0].name, source: company.categorySource };
    }
  }

  const resolved = resolveCategoryAssignment(current, { categoryName, source: categorySource });
  const categoryRow = await getOrCreateCategory(resolved.categoryName, false);
  await setCompanyCategories(companyId, [{ categoryId: categoryRow.id, confidence: resolved.source === 'manual' ? 1 : 0.8 }]);
  await setCompanyCategorySource(companyId, resolved.source);
}

/** Persists a reviewed card as a lead: upserts the company + representative + their contact
 *  methods + category tags, then links the card row to the result and marks it 'saved'.
 *  This is the write path used by the Review screen's "Save Lead" button for an ordinary
 *  single-representative card. For a card where multiple representatives were detected, see
 *  `saveLeadMultiRep` below. */
export async function saveLead(input: SaveLeadInput): Promise<{ companyId: string; representativeId: string }> {
  const companyWriteMode = resolveCompanyWriteMode(input.reuseCompanyId, input.reuseRepresentativeId);
  const companyId = await writeCompany(input.company, input.reuseCompanyId, companyWriteMode);

  const representativeId = await writeRepresentative(
    companyId,
    input.representative,
    input.phones,
    input.emails,
    input.reuseRepresentativeId
  );

  await writeCompanyCategories(companyId, input.categoryName, input.categorySource, !!input.reuseCompanyId);
  await linkCardToLead(input.cardId, companyId, representativeId, input.notes);
  await linkCardRepresentatives(input.cardId, [representativeId]);

  // If the user merged into an existing company/representative (via the duplicate-match prompt),
  // record which existing card this one duplicates — this is what powers the Dashboard's
  // "Potential Duplicates" count. A brand-new company+representative is never a duplicate.
  if (input.reuseCompanyId || input.reuseRepresentativeId) {
    const siblingCardId = await findSiblingCardId(input.cardId, companyId, representativeId);
    if (siblingCardId) await markDuplicateOf(input.cardId, siblingCardId);
  }

  return { companyId, representativeId };
}

export interface RepresentativeSaveInput {
  representative: Omit<RepresentativeInput, 'companyId'>;
  phones: { rawValue: string; kind: PhoneKind }[];
  emails: string[];
  /** Set only if this specific person was independently matched to an existing representative via
   *  duplicate detection (e.g. same phone/email as someone already in the database). */
  reuseRepresentativeId?: string | null;
}

export interface SaveMultiRepLeadInput {
  cardId: string;
  company: CompanyInput;
  representatives: RepresentativeSaveInput[];
  categoryName: string;
  categorySource: CategorySource;
  notes: string | null;
  reuseCompanyId?: string | null;
  /** True only when this save is the user editing a card that was already saved (ReviewScreen's
   *  `wasAlreadySavedRef.current`) — an explicit, deliberate re-save of the card's own record,
   *  which should fully apply the form's current values to the company (including clearing a
   *  field), exactly like a self-edit in the single-representative `saveLead` path. Must NOT be
   *  derived from whether any individual representative auto-matched an existing one elsewhere —
   *  see `resolveCompanyWriteMode`'s doc comment for why that was a real data-loss bug. */
  isEditingSavedCard?: boolean;
}

/** Persists a card that lists multiple representatives (see
 *  services/extraction/multiRepresentative.ts) — one company, several people, each with their own
 *  phones/emails. Requires at least 2 representatives; for the ordinary single-representative
 *  case use `saveLead` above.
 *
 *  Company write mode depends ONLY on `reuseCompanyId` and `isEditingSavedCard` — NEVER on whether
 *  any individual representative happened to auto-match an existing one (see
 *  `resolveCompanyWriteMode`'s doc comment). A fresh multi-person card is, by construction, adding
 *  at least one representative that's new to the system, which is exactly the "protect the
 *  existing company's already-known data" case (sparse-merge) — even if one of the people on the
 *  card happens to match an existing representative elsewhere. Only an explicit self-edit of the
 *  card's own already-saved record escalates to a full overwrite. */
export async function saveLeadMultiRep(
  input: SaveMultiRepLeadInput
): Promise<{ companyId: string; representativeIds: string[] }> {
  if (input.representatives.length < 2) {
    throw new Error('saveLeadMultiRep requires at least 2 representatives — use saveLead for a single representative.');
  }

  const companyWriteMode = resolveCompanyWriteMode(input.reuseCompanyId, !!input.isEditingSavedCard);
  const companyId = await writeCompany(input.company, input.reuseCompanyId, companyWriteMode);

  const representativeIds: string[] = [];
  for (const rep of input.representatives) {
    const representativeId = await writeRepresentative(
      companyId,
      rep.representative,
      rep.phones,
      rep.emails,
      rep.reuseRepresentativeId
    );
    representativeIds.push(representativeId);
  }

  await writeCompanyCategories(companyId, input.categoryName, input.categorySource, !!input.reuseCompanyId);
  await linkCardToLead(input.cardId, companyId, representativeIds[0], input.notes);
  await linkCardRepresentatives(input.cardId, representativeIds);

  for (let i = 0; i < input.representatives.length; i++) {
    const rep = input.representatives[i];
    if (input.reuseCompanyId || rep.reuseRepresentativeId) {
      const siblingCardId = await findSiblingCardId(input.cardId, companyId, representativeIds[i]);
      if (siblingCardId) {
        await markDuplicateOf(input.cardId, siblingCardId);
        break; // one duplicate flag on the card is enough to surface it on the Dashboard
      }
    }
  }

  return { companyId, representativeIds };
}
