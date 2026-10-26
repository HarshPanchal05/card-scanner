import type { ExtractedPhone } from '../../types/extraction';
import type { PhoneKind } from '../../types/models';
import { normalizePhone } from '../../utils/textNormalize';

// Matches sequences that look like phone numbers: optional +country code, then groups of digits
// separated by spaces/dashes/dots, 7-15 digits total. Deliberately permissive since business
// cards use wildly inconsistent formatting (+91 98765 43210, 079-2312-3456, (022) 6789 0123, ...).
const PHONE_REGEX = /(\+?\d[\d\s().-]{6,}\d)/g;

const KIND_KEYWORDS: { kind: PhoneKind; pattern: RegExp }[] = [
  { kind: 'whatsapp', pattern: /whats\s*app/i },
  { kind: 'mobile', pattern: /\b(mob|mobile|cell|m\.)\b/i },
  { kind: 'fax', pattern: /\bfax\b/i },
  { kind: 'office', pattern: /\b(off|office|work|board)\b/i },
  { kind: 'landline', pattern: /\b(tel|telephone|ph|phone|landline)\b/i },
];

function classifyKind(line: string, digitCount: number): PhoneKind {
  for (const { kind, pattern } of KIND_KEYWORDS) {
    if (pattern.test(line)) return kind;
  }
  // No explicit label: a 10-digit number with no STD code is very likely a mobile number in the
  // Indian numbering context this app targets; longer numbers with area codes read as landline.
  if (digitCount === 10) return 'mobile';
  return 'other';
}

function isPlausiblePhone(digits: string): boolean {
  return digits.length >= 7 && digits.length <= 15;
}

/** Extracts every phone-like number from a set of OCR lines, deduplicated by normalized digits,
 *  each tagged with a best-guess kind (mobile/office/landline/fax/whatsapp) based on nearby
 *  keywords on the same line. Numbers are never discarded just because a mobile was already
 *  found — cards routinely list several. */
export function extractPhones(lines: string[]): ExtractedPhone[] {
  const results = new Map<string, ExtractedPhone>();

  for (const line of lines) {
    // Skip lines that are clearly a postal/PIN code context to reduce false positives is hard
    // to do reliably; instead we rely on length bounds (postal codes are 6 digits, too short).
    const matches = line.match(PHONE_REGEX);
    if (!matches) continue;
    for (const match of matches) {
      const digits = match.replace(/[^\d]/g, '');
      if (!isPlausiblePhone(digits)) continue;
      const normalized = normalizePhone(match);
      if (results.has(normalized)) continue;
      results.set(normalized, {
        raw: match.trim(),
        normalized,
        kind: classifyKind(line, digits.length),
      });
    }
  }

  return Array.from(results.values());
}
