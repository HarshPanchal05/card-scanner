import { INDIAN_STATES, MAJOR_CITIES, ADDRESS_KEYWORDS, PIN_CODE_REGEX } from '../../constants/geography';

export interface AddressResult {
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  confidence: number;
}

function containsWord(line: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(line);
}

function findMatch(lines: string[], candidates: string[]): { line: string; match: string } | null {
  for (const line of lines) {
    for (const candidate of candidates) {
      if (containsWord(line, candidate)) return { line, match: candidate };
    }
  }
  return null;
}

/** Address detection for the Indian industrial-expo context: looks for a 6-digit PIN code as the
 *  strongest anchor, a known state name, and a known major city, then builds a human-readable
 *  address line from whichever OCR lines carried those signals plus any line with a generic
 *  street/locality keyword (Road, Nagar, Estate, GIDC, Sector, ...). */
export function extractAddress(lines: string[]): AddressResult {
  const pinLine = lines.find((l) => PIN_CODE_REGEX.test(l));
  const stateMatch = findMatch(lines, INDIAN_STATES);
  const cityMatch = findMatch(lines, MAJOR_CITIES);
  const keywordLines = lines.filter((l) => ADDRESS_KEYWORDS.some((kw) => containsWord(l, kw)));

  const addressLines = new Set<string>();
  for (const l of keywordLines) addressLines.add(l);
  if (pinLine) addressLines.add(pinLine);
  if (stateMatch) addressLines.add(stateMatch.line);
  if (cityMatch && cityMatch.line !== stateMatch?.line) addressLines.add(cityMatch.line);

  const addressLine = addressLines.size > 0 ? Array.from(addressLines).join(', ') : null;
  const state = stateMatch ? capitalizeWords(stateMatch.match) : null;
  const city = cityMatch ? capitalizeWords(cityMatch.match) : null;
  const country = state || pinLine ? 'India' : null;

  let confidence = 0;
  if (pinLine) confidence += 0.4;
  if (stateMatch) confidence += 0.3;
  if (cityMatch) confidence += 0.2;
  if (keywordLines.length > 0) confidence += 0.1;

  return { addressLine, city, state, country, confidence: Math.min(1, confidence) };
}

function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
