/** Splits raw OCR text into clean, deduplicated lines ready for field extraction. */
export function toLines(rawText: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length === 0) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue; // drops exact duplicate lines that appear on both card sides
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

/** Strips a line of characters that are almost always OCR noise from logos/decorative borders
 *  (long runs of the same punctuation, isolated single characters) without touching real text. */
export function isLikelyNoiseLine(line: string): boolean {
  if (line.length <= 1) return true;
  if (/^[\W_]+$/.test(line)) return true; // punctuation/symbols only
  const alnum = line.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length === 0) return true;
  return false;
}
