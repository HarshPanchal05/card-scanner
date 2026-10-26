const URL_REGEX = /((https?:\/\/)?(www\.)[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/[^\s]*)?)/gi;
// Fallback: a bare domain with a recognizable TLD but no "www." prefix (e.g. "abcengineering.com").
const BARE_DOMAIN_REGEX = /\b([a-zA-Z0-9-]+\.(com|co\.in|in|net|org|biz|info|io|co))\b/gi;

/** Returns the single best website candidate. Cards rarely list more than one, so unlike phones
 *  we don't keep a list — we prefer a "www."-prefixed match, and fall back to a bare domain that
 *  doesn't look like it was already captured as part of an email address. */
export function extractWebsite(lines: string[], knownEmails: string[]): string | null {
  const emailDomains = new Set(knownEmails.map((e) => e.split('@')[1]?.toLowerCase()).filter(Boolean));

  for (const line of lines) {
    const match = line.match(URL_REGEX);
    if (match && match[0]) {
      return normalizeWebsite(match[0]);
    }
  }

  for (const line of lines) {
    const matches = line.match(BARE_DOMAIN_REGEX);
    if (!matches) continue;
    for (const candidate of matches) {
      if (!emailDomains.has(candidate.toLowerCase())) {
        return normalizeWebsite(candidate);
      }
    }
  }

  return null;
}

function normalizeWebsite(raw: string): string {
  return raw.trim().replace(/[.,;]+$/, '').toLowerCase();
}
