import { findCompaniesByNormalizedName } from '../../repositories/companiesRepo';
import { findRepresentativesByPhone, findRepresentativesByEmail } from '../../repositories/representativesRepo';
import { getCompany } from '../../repositories/companiesRepo';
import { normalizeCompanyName, normalizePhone, normalizeEmail } from '../../utils/textNormalize';
import type { CompanyRow, RepresentativeRow } from '../../types/models';

export interface DuplicateMatch {
  company: CompanyRow;
  representative: RepresentativeRow | null;
  reason: 'company_name' | 'phone' | 'email';
}

/** Looks for an existing company/representative that plausibly matches the data just extracted
 *  from a new card. Never deletes or merges anything itself — callers present this to the user
 *  as "Possible duplicate found" and let them choose Save as new / Merge / Cancel. */
export async function findPossibleDuplicates(input: {
  companyName: string | null;
  personName: string | null;
  phones: string[];
  emails: string[];
}): Promise<DuplicateMatch[]> {
  const matches = new Map<string, DuplicateMatch>();

  for (const phone of input.phones) {
    const normalized = normalizePhone(phone);
    if (normalized.length < 6) continue; // too short to be a meaningful match
    const reps = await findRepresentativesByPhone(normalized);
    for (const rep of reps) {
      const company = await getCompany(rep.companyId);
      if (company) matches.set(`${company.id}:${rep.id}`, { company, representative: rep, reason: 'phone' });
    }
  }

  for (const email of input.emails) {
    if (!email) continue;
    const reps = await findRepresentativesByEmail(normalizeEmail(email));
    for (const rep of reps) {
      const company = await getCompany(rep.companyId);
      if (company) matches.set(`${company.id}:${rep.id}`, { company, representative: rep, reason: 'email' });
    }
  }

  if (input.companyName) {
    const normalized = normalizeCompanyName(input.companyName);
    if (normalized.length >= 3) {
      const companies = await findCompaniesByNormalizedName(normalized);
      for (const company of companies) {
        const key = `${company.id}:name`;
        if (!matches.has(key)) matches.set(key, { company, representative: null, reason: 'company_name' });
      }
    }
  }

  return Array.from(matches.values());
}

/** Exact-match lookup for a single representative's own phones/emails, used when saving a card
 *  that lists multiple people (see leadRepository.ts#saveLeadMultiRep). A shared phone/email
 *  match is unambiguous enough to auto-merge without a modal prompt — unlike the fuzzier
 *  company-name-only match in findPossibleDuplicates, which still needs the user's confirmation.
 *  Without this, saving a fresh multi-representative scan where one person's number is already
 *  known would silently create a duplicate representative row for that same real person instead
 *  of recognizing them. */
export async function findExactRepresentativeMatch(
  phones: string[],
  emails: string[]
): Promise<RepresentativeRow | null> {
  for (const phone of phones) {
    const normalized = normalizePhone(phone);
    if (normalized.length < 6) continue;
    const reps = await findRepresentativesByPhone(normalized);
    if (reps.length > 0) return reps[0];
  }
  for (const email of emails) {
    if (!email) continue;
    const reps = await findRepresentativesByEmail(normalizeEmail(email));
    if (reps.length > 0) return reps[0];
  }
  return null;
}
