import type { ExtractionResult, OcrLine } from '../../types/extraction';
import type { CategoryDefinition } from '../../constants/categories';
import { toLines, isLikelyNoiseLine } from './normalize';
import { extractPhones } from './phoneExtractor';
import { extractEmails } from './emailExtractor';
import { extractWebsite } from './websiteExtractor';
import { extractNameCompanyDesignation } from './nameCompanyExtractor';
import { extractAddress } from './addressExtractor';
import { suggestCategoryNames, decidePrimaryCategory } from './categoryExtractor';
import { detectMultipleRepresentatives } from './multiRepresentative';

/**
 * Layered offline extraction pipeline:
 *   normalize -> phones -> emails -> website -> name/company/designation -> address -> category
 *   -> multi-representative clustering (only when 2+ people are detected on the card)
 * Every stage is pure regex/heuristic/dictionary logic — no network call and no LLM is required
 * for the pipeline to produce a usable result. See docs/OCR.md for why this was judged sufficient
 * without adding a local LLM.
 *
 * `ocrLines` (optional) carries the OCR's per-line position data, needed only for splitting a
 * card that lists multiple representatives into separate people with their own phone numbers —
 * see multiRepresentative.ts. Every existing caller that omits it gets byte-for-byte the same
 * result as before this parameter existed.
 */
export function runExtractionPipeline(
  rawOcrText: string,
  extraCategoryDictionary: CategoryDefinition[] = [],
  ocrLines?: OcrLine[]
): ExtractionResult {
  const allLines = toLines(rawOcrText);
  const lines = allLines.filter((l) => !isLikelyNoiseLine(l));

  const phones = extractPhones(lines);
  const emails = extractEmails(lines);
  const website = extractWebsite(lines, emails);
  const { companyName, personName, designation, department, companyConfidence, personConfidence } =
    extractNameCompanyDesignation(lines, phones, emails, website);
  const address = extractAddress(lines);
  const category = suggestCategoryNames(rawOcrText, extraCategoryDictionary);
  const primaryCategory = decidePrimaryCategory(rawOcrText, extraCategoryDictionary);

  const consumedLines = new Set(
    [
      companyName,
      personName,
      designation,
      department,
      ...phones.map((p) => p.raw),
      ...emails,
      website,
      address.addressLine,
    ].filter(Boolean) as string[]
  );
  const unclassifiedLines = lines.filter(
    (line) => !Array.from(consumedLines).some((c) => c && line.includes(c))
  );

  const representatives = detectMultipleRepresentatives(lines, ocrLines, phones, emails, personName, companyName);

  return {
    companyName,
    personName,
    designation,
    department,
    phones,
    emails,
    website,
    addressLine: address.addressLine,
    city: address.city,
    state: address.state,
    country: address.country,
    categoryNames: category.names,
    primaryCategory: primaryCategory.name,
    primaryCategoryConfidence: primaryCategory.confidence,
    confidence: {
      company: companyConfidence,
      person: personConfidence,
      designation: designation ? 0.75 : 0,
      phones: phones.length > 0 ? Math.min(1, 0.6 + phones.length * 0.1) : 0,
      emails: emails.length > 0 ? 0.9 : 0,
      website: website ? 0.85 : 0,
      address: address.confidence,
      category: category.confidence,
    },
    unclassifiedLines,
    representatives,
  };
}
