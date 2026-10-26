import { normalizeEmail } from '../../utils/textNormalize';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Extracts and deduplicates all email addresses found across the OCR lines. OCR frequently
 *  misreads '@' as a stray character next to it is fine — we don't attempt to repair broken
 *  emails, only to collect ones ML Kit read cleanly, since guessing wrong is worse than omitting. */
export function extractEmails(lines: string[]): string[] {
  const found = new Set<string>();
  for (const line of lines) {
    const matches = line.match(EMAIL_REGEX);
    if (!matches) continue;
    for (const m of matches) {
      found.add(normalizeEmail(m.replace(/[.,;]+$/, '')));
    }
  }
  return Array.from(found);
}
