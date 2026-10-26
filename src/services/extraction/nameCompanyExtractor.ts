import type { ExtractedPhone } from '../../types/extraction';
import {
  DESIGNATION_KEYWORDS,
  DEPARTMENT_KEYWORDS,
  COMPANY_SUFFIX_KEYWORDS,
  STRONG_COMPANY_SUFFIX_KEYWORDS,
  ALL_COMPANY_SUFFIX_KEYWORDS,
  BUSINESS_DOMAIN_KEYWORDS,
  NAME_SALUTATIONS,
} from '../../constants/designations';

export interface NameCompanyResult {
  companyName: string | null;
  personName: string | null;
  designation: string | null;
  department: string | null;
  companyConfidence: number;
  personConfidence: number;
}

export function wordBoundaryIncludes(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

function stripKnownSubstrings(line: string, substrings: string[]): string {
  let result = line;
  for (const s of substrings) {
    if (!s) continue;
    result = result.split(s).join(' ');
  }
  return result;
}

function isMostlyConsumed(residual: string): boolean {
  return residual.replace(/[^a-zA-Z]/g, '').length < 3;
}

/** The two "shape" signals that suggest a line genuinely IS a company name, independent of where
 *  the line sits on the card. Deliberately excludes position — used on its own (not via
 *  companyScore) wherever a caller needs to ask "does this line look company-shaped at all?"
 *  without position noise, e.g. deciding whether a candidate line is eligible to be merged as a
 *  brand-name prefix (see the stacked-line merge below). */
function hasCompanyShapeSignal(line: string): boolean {
  const hasSuffixKeyword = ALL_COMPANY_SUFFIX_KEYWORDS.some((kw) => wordBoundaryIncludes(line, kw));
  const letters = line.replace(/[^a-zA-Z]/g, '');
  const isAllCaps = letters.length > 6 && letters === letters.toUpperCase();
  return hasSuffixKeyword || isAllCaps;
}

function companyScore(line: string, index: number): number {
  let score = 0;
  // Legal-entity markers ("Pvt Ltd", "LLP", ...) are near-definitive proof a line is the company —
  // weighted well above the broader organizational vocabulary below, which can just as easily
  // describe a department/division within a company ("Research", "Laboratory", "Services") rather
  // than being the company's own name.
  for (const kw of STRONG_COMPANY_SUFFIX_KEYWORDS) {
    if (wordBoundaryIncludes(line, kw)) score += 5;
  }
  for (const kw of COMPANY_SUFFIX_KEYWORDS) {
    if (wordBoundaryIncludes(line, kw)) score += 2;
  }
  // Small-business/retail domain words ("Mobile", "Hardware", ...) — individually as weak as the
  // broader organizational vocabulary above, but see the brand+domain line bonus just below: a
  // short two-word line combining one of these with a distinct brand/proprietor word is much
  // stronger evidence than the bare keyword hit alone (without it, a longer descriptive phrase
  // using the same word, e.g. "All Kind Of Mobile Accessories", could outscore the real trade name
  // purely by repeating the domain word more often).
  for (const kw of BUSINESS_DOMAIN_KEYWORDS) {
    if (wordBoundaryIncludes(line, kw)) score += 2;
  }
  if (isBrandPlusDomainLine(line)) score += 3;
  const letters = line.replace(/[^a-zA-Z]/g, '');
  const isAllCaps = letters.length > 6 && letters === letters.toUpperCase();
  // Weighted above the top-of-card position bonus below: an ALL-CAPS, business-shaped line is a
  // much stronger signal that a line IS the company than merely appearing near the top of the
  // card. Many real cards (especially small/regional businesses) lead with a decorative greeting,
  // slogan, or blessing phrase before the actual brand line — if position and shape carried equal
  // weight, a tie between such a phrase and the real ALL-CAPS company line resolves to "whichever
  // line came first" (array order), which is exactly backwards. Found via QA: a real card with
  // "Il Jay Mataj l" (a garbled decorative phrase) at line 3 and "FURNITURE" at line 7 tied under
  // the old 1-point weighting and the decorative phrase won purely by appearing first.
  if (isAllCaps) score += 2;
  // Kept as a smaller, secondary tie-breaker — still useful when two candidates are otherwise
  // equally shaped, just no longer strong enough to let bare position alone win.
  if (index <= 2) score += 1;
  return score;
}

export function hasDesignationKeyword(line: string): boolean {
  return DESIGNATION_KEYWORDS.some((kw) => wordBoundaryIncludes(line, kw));
}

export function hasDepartmentKeyword(line: string): boolean {
  return DEPARTMENT_KEYWORDS.some((kw) => wordBoundaryIncludes(line, kw));
}

/** True when a line contains one of the legal/organizational suffix words used to score company
 *  names (see companyScore below) — "Systems", "Laboratory"-adjacent "Industries", etc. Exported
 *  for multiRepresentative.ts, which needs the same "this line reads as organizational, not
 *  personal" signal to avoid miscounting a department/lab/product-line line as a second person. */
export function hasCompanySuffixKeyword(line: string): boolean {
  return ALL_COMPANY_SUFFIX_KEYWORDS.some((kw) => wordBoundaryIncludes(line, kw));
}

/** True when a line carries small-business/retail domain vocabulary ("Mobile", "Hardware",
 *  "Repairing", ...) — see BUSINESS_DOMAIN_KEYWORDS's doc comment for why this is kept separate
 *  from the broader/legal company vocabulary above. */
export function hasBusinessDomainKeyword(line: string): boolean {
  return BUSINESS_DOMAIN_KEYWORDS.some((kw) => wordBoundaryIncludes(line, kw));
}

/** Words that appear alongside a genuine domain word in purely descriptive product/service phrases
 *  ("All Kind Of Mobile Accessories") rather than in an actual two-word trade name ("Mahi
 *  Mobile") — excluded from the brand+domain line-shape check below so a descriptive phrase can't
 *  masquerade as a brand name merely by being trimmed to two tokens. */
const BRAND_PATTERN_FILLER_WORDS = new Set(['all', 'kind', 'of', 'and', 'the', 'for', 'with', 'type', 'a', 'an', '&']);

/** True for a short, two-word line that reads exactly like a small business's trade name: one word
 *  is business-domain vocabulary (from ALL_COMPANY_SUFFIX_KEYWORDS or BUSINESS_DOMAIN_KEYWORDS,
 *  e.g. "Mobile", "Electronics", "Hardware") and the other is a distinct, capitalized, non-filler
 *  word that reads as the brand/proprietor word (e.g. "Mahi", "Patel", "Modern"). This is the same
 *  kind of evidence the existing bare-ALL-CAPS "Krish" + "FURNITURE" stacked-line merge already
 *  relies on (see the merge logic below) — just for a business name printed as ONE line instead of
 *  two. Deliberately narrow (exactly two words, no filler words) so it doesn't fire on longer
 *  descriptive product/service phrases like "All Kind Of Mobile" or "Accessories & Reparing". */
function isBrandPlusDomainLine(line: string): boolean {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length !== 2) return false;
  const isDomainWord = (w: string) =>
    ALL_COMPANY_SUFFIX_KEYWORDS.some((kw) => wordBoundaryIncludes(w, kw)) ||
    BUSINESS_DOMAIN_KEYWORDS.some((kw) => wordBoundaryIncludes(w, kw));
  const isBrandFragment = (w: string) => /^[A-Za-z]{2,}$/.test(w) && !BRAND_PATTERN_FILLER_WORDS.has(w.toLowerCase());
  const [first, second] = words;
  return (isDomainWord(first) && isBrandFragment(second)) || (isDomainWord(second) && isBrandFragment(first));
}

/** Loose Title-Case person-name pattern: by default 2-4 words, each starting with a capital
 *  letter, no digits, not a fully-uppercase acronym-style line (which is more often a
 *  company/branding line on business cards).
 *
 *  With `allowSingleWord`, also accepts a single Title-Case word — used only as a fallback when
 *  no multi-word candidate exists on the card at all. Many small-business cards (particularly
 *  common in India) list a proprietor by a single informal name rather than a first+last pair —
 *  e.g. "Shaileshbhai" (a first name plus the "-bhai"/brother honorific, with no surname given).
 *  Requiring 2+ words unconditionally meant such cards never got a person name at all. Restricting
 *  this to a fallback (rather than always allowing single words) keeps the stricter 2-4-word check
 *  as the default so a lone company/brand word doesn't get misread as a person's name whenever a
 *  proper multi-word name is actually present elsewhere on the card.
 *
 *  Two additional guards, both found via real device QA where this shape check produced false
 *  positives that outranked a card's actual (single-word) names:
 *   - A line containing a comma is excluded. Printed names on a business card essentially never
 *     contain an internal comma, while multi-part addresses very commonly do ("Bapunagar,
 *     Ahmedabad.") — a comma is a strong signal a line is an address fragment, not a name, and
 *     without this guard an address fragment can coincidentally match the Title-Case-2-words shape
 *     and get picked as the person's name ahead of the card's real (single-word) names.
 *   - Each word must be at least 3 characters. OCR noise from decorative borders/symbols
 *     frequently reads out as short 1-2 letter fragments that otherwise satisfy the Title-Case
 *     shape (e.g. a garbled "Il Jay Mataji Il" from a misread decorative phrase) — real name parts
 *     are essentially always 3+ letters. */
export function looksLikePersonName(line: string, allowSingleWord = false): boolean {
  if (line.includes(',')) return false;
  const cleaned = line.replace(/[,.]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const stripped = words.filter((w) => !NAME_SALUTATIONS.includes(w.toLowerCase().replace('.', '')));
  const minWords = allowSingleWord ? 1 : 2;
  if (stripped.length < minWords || stripped.length > 4) return false;
  if (/\d/.test(cleaned)) return false;
  return stripped.every((w) => w.length >= 3 && /^[A-Z][a-zA-Z'.-]*$/.test(w) && w !== w.toUpperCase());
}

/** Scores how confidently a line that already passed the person-name SHAPE check
 *  (looksLikePersonName — a required gate, not re-checked here) is actually the card's
 *  representative, using contextual evidence rather than shape alone. Mirrors companyScore's
 *  weighting style so the two are comparable: a line that is merely Title-Case-shaped but is
 *  really a company (e.g. "Rahul Sharma Enterprises") gets penalized here via its suffix keyword,
 *  while a genuine person's name sitting directly next to a designation or a phone/email gets
 *  boosted — the same adjacency evidence a human reader would use. */
export function personScore(
  candidate: { line: string; index: number },
  designationIndex: number | null,
  contactLineIndexes: Set<number>
): number {
  let score = 1; // base: already shape-eligible
  // A line that also carries company/organizational vocabulary is still evidence AGAINST it being
  // a person, even after passing the Title-Case shape check — "Rahul Sharma Enterprises" looks
  // name-shaped, but "Enterprises" is a strong signal it's really the company line.
  if (hasCompanySuffixKeyword(candidate.line)) score -= 4;
  if (designationIndex !== null && Math.abs(candidate.index - designationIndex) === 1) score += 3;
  if (contactLineIndexes.has(candidate.index - 1) || contactLineIndexes.has(candidate.index + 1)) score += 1;
  const firstWord = candidate.line.trim().split(/\s+/)[0]?.toLowerCase().replace(/\./g, '');
  if (firstWord && NAME_SALUTATIONS.includes(firstWord)) score += 1;
  return score;
}

/** Indexes of every line that is, or contains, a known phone/email/website value — used both to
 *  decide a person candidate sits next to their own contact details (personScore) and, symmetrically,
 *  to withhold a bare person-shaped line from company candidacy when nothing else backs it up (see
 *  the company-selection loop below). Exported so multiRepresentative.ts's anchor-corroboration
 *  check (a reusable extension of the same "phone/email proximity is human evidence" idea) doesn't
 *  have to re-derive this independently. */
export function computeContactLineIndexes(lines: string[], phones: ExtractedPhone[], emails: string[], website: string | null = null): Set<number> {
  const knownSubstrings = [...phones.map((p) => p.raw), ...emails, website ?? ''].filter(Boolean);
  return new Set(
    lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => knownSubstrings.some((s) => s && line.includes(s)))
      .map(({ index }) => index)
  );
}

export function extractNameCompanyDesignation(
  lines: string[],
  phones: ExtractedPhone[],
  emails: string[],
  website: string | null
): NameCompanyResult {
  const knownSubstrings = [...phones.map((p) => p.raw), ...emails, website ?? ''].filter(Boolean);
  const contactLineIndexes = computeContactLineIndexes(lines, phones, emails, website);

  const candidates = lines
    .map((line, index) => ({ line, index, residual: stripKnownSubstrings(line, knownSubstrings) }))
    .filter((c) => !isMostlyConsumed(c.residual));

  // --- Designation ---
  const designationCandidate = candidates.find((c) => hasDesignationKeyword(c.line));
  const designation = designationCandidate ? cleanupLine(designationCandidate.line) : null;

  // --- Company ---
  let bestCompany: { line: string; index: number; score: number } | null = null;
  for (const c of candidates) {
    if (designationCandidate && c.index === designationCandidate.index) continue;
    // A line that strongly reads as a human name — no company/business vocabulary of its own —
    // sitting immediately next to a phone or email is much more plausibly a proprietor next to
    // their own contact details than a business name (task finding: "Mahendra Modi" directly above
    // a phone number was being picked as the company purely for appearing near the top of the
    // card). Withheld from company candidacy entirely rather than merely penalized, since nothing
    // about position or shape should be able to outweigh this combination of evidence.
    const isBareHumanNameNextToContact =
      looksLikePersonName(c.line) &&
      !hasCompanySuffixKeyword(c.line) &&
      !hasBusinessDomainKeyword(c.line) &&
      (contactLineIndexes.has(c.index - 1) || contactLineIndexes.has(c.index + 1));
    if (isBareHumanNameNextToContact) continue;
    const score = companyScore(c.line, c.index);
    if (score > 0 && (!bestCompany || score > bestCompany.score)) {
      bestCompany = { line: c.line, index: c.index, score };
    }
  }
  // Fallback: no suffix/caps match found — assume the longest of the first three lines that
  // isn't the designation and doesn't look like a person's name is the company (common on
  // minimalist card layouts that just print "Acme Engineering" with no legal suffix at all).
  if (!bestCompany) {
    const fallback = candidates
      .filter((c) => c.index <= 2 && (!designationCandidate || c.index !== designationCandidate.index) && !looksLikePersonName(c.line))
      .sort((a, b) => b.line.length - a.line.length)[0];
    if (fallback) bestCompany = { ...fallback, score: 0 };
  }

  // Small businesses often print a short brand word on one line and the business type as a
  // second, larger ALL-CAPS line directly below it (e.g. "Krish" / "FURNITURE") — together they
  // form the actual trade name; the bare ALL-CAPS word alone ("Furniture") is a generic noun, not
  // a distinctive company name. Detect this narrowly: the winning candidate is a single bare
  // ALL-CAPS word, and the line immediately above it is short (<=2 words), plain (no digits), not
  // the designation, and doesn't itself already look like a strong company candidate — merge them.
  let mergedPrecedingIndex: number | null = null;
  if (bestCompany) {
    const companyWords = bestCompany.line.trim().split(/\s+/);
    const companyLetters = bestCompany.line.replace(/[^a-zA-Z]/g, '');
    const isBareAllCapsWord =
      companyWords.length === 1 && companyLetters.length > 6 && companyLetters === companyLetters.toUpperCase();
    if (isBareAllCapsWord) {
      const preceding = candidates.find((c) => c.index === bestCompany!.index - 1);
      if (
        preceding &&
        preceding.line.trim().split(/\s+/).length <= 2 &&
        !/\d/.test(preceding.line) &&
        (!designationCandidate || preceding.index !== designationCandidate.index) &&
        !hasCompanyShapeSignal(preceding.line)
      ) {
        bestCompany = { line: `${preceding.line} ${bestCompany.line}`, index: bestCompany.index, score: bestCompany.score };
        mergedPrecedingIndex = preceding.index;
      }
    }
  }

  const companyName = bestCompany ? cleanupLine(bestCompany.line) : null;
  const companyConfidence = bestCompany ? Math.min(1, 0.5 + bestCompany.score * 0.12) : 0;

  // --- Person name ---
  // contactLineIndexes (computed above) is reused here as personScore's "sits next to contact
  // details" signal — checked against the full original `lines`, not just the remaining
  // candidates, since a line that's entirely a phone/email number is itself filtered out of
  // `candidates` by isMostlyConsumed above but is still a real, adjacent neighbor in the layout.
  const designationIndex = designationCandidate ? designationCandidate.index : null;

  let nameCandidates = candidates.filter(
    (c) =>
      (!bestCompany || c.index !== bestCompany.index) &&
      c.index !== mergedPrecedingIndex &&
      (!designationCandidate || c.index !== designationCandidate.index) &&
      looksLikePersonName(c.line)
  );
  // Fallback to single-word informal names only when the card has no properly-shaped multi-word
  // name candidate at all (see looksLikePersonName's allowSingleWord doc comment).
  if (nameCandidates.length === 0) {
    nameCandidates = candidates.filter(
      (c) =>
        (!bestCompany || c.index !== bestCompany.index) &&
        c.index !== mergedPrecedingIndex &&
        (!designationCandidate || c.index !== designationCandidate.index) &&
        looksLikePersonName(c.line, true)
    );
  }
  // Among every shape-eligible candidate, the highest-scoring one wins — generalizes the previous
  // "only the designation-adjacent one wins, and only when there were 2+ candidates" special case
  // into a proper comparable score (adjacency to designation, adjacency to phone/email, salutation
  // prefix, and a penalty for still carrying company vocabulary despite passing the shape check —
  // see personScore). Ties keep the earliest-appearing candidate, matching the previous default.
  let personLine: (typeof nameCandidates)[number] | null = null;
  for (const c of nameCandidates) {
    if (!personLine || personScore(c, designationIndex, contactLineIndexes) > personScore(personLine, designationIndex, contactLineIndexes)) {
      personLine = c;
    }
  }
  const personName = personLine ? cleanupLine(stripSalutation(personLine.line)) : null;
  const personConfidence = personLine ? Math.min(1, 0.5 + personScore(personLine, designationIndex, contactLineIndexes) * 0.12) : 0;

  // --- Department ---
  let department: string | null = null;
  const designationLower = designation?.toLowerCase() ?? '';
  const deptInDesignation = DEPARTMENT_KEYWORDS.find((kw) => designationLower.includes(kw));
  if (deptInDesignation) {
    department = capitalize(deptInDesignation);
  } else {
    const deptLine = candidates.find(
      (c) =>
        (!designationCandidate || c.index !== designationCandidate.index) &&
        (!bestCompany || c.index !== bestCompany.index) &&
        DEPARTMENT_KEYWORDS.some((kw) => wordBoundaryIncludes(c.line, kw)) &&
        c.line.split(/\s+/).length <= 4
    );
    if (deptLine) department = cleanupLine(deptLine.line);
  }

  return { companyName, personName, designation, department, companyConfidence, personConfidence };
}

export function stripSalutation(line: string): string {
  const words = line.split(/\s+/);
  if (words.length > 0 && NAME_SALUTATIONS.includes(words[0].toLowerCase().replace('.', ''))) {
    return words.slice(1).join(' ');
  }
  return line;
}

export function cleanupLine(line: string): string {
  return line.replace(/[|:;,]+$/, '').trim();
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
