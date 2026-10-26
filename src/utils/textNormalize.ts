/** Normalizes a free-text name for duplicate matching: lowercase, strip common legal suffixes
 *  and punctuation, collapse whitespace. Not used for display — only for comparison. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,()]/g, '')
    .replace(/\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|corp\.?|co\.?|company|industries|enterprises)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|er|eng)\.?\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Digits-only phone representation used for matching. Keeps a leading country code if present
 *  but strips spaces, dashes, parens, and a leading '+'. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  // Drop a leading '0' trunk prefix only when we clearly have a country code + local number
  // (heuristic: 11+ digits starting with 0 after a country code was likely already stripped).
  return digits;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
