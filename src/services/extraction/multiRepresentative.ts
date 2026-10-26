/**
 * Detects and splits multiple representatives listed on a single card (e.g. two proprietors, each
 * with their own phone number) using the OCR's per-line position data. Pure, no I/O.
 *
 * Activates only when 2+ name-shaped lines are found on the card — for the overwhelming majority
 * of cards (one person), this returns `null` and callers fall back to the existing single-
 * representative fields on ExtractionResult unchanged. This is the primary regression guard: a
 * card that only ever had one detectable name is completely unaffected by this module.
 *
 * When 2+ people are detected, every phone/email is assigned to whichever person's name line it
 * sits closest to vertically — but ONLY when that assignment is unambiguous (the closest anchor is
 * clearly closer than the next-closest, by at least half a text-line's height). Some real cards
 * print all their phone numbers as one shared group and all their names as a separate shared group
 * with no positional pairing at all — in that case (or whenever position data is missing) an item
 * is attached to EVERY detected representative rather than guessing a pairing the layout doesn't
 * support. Nothing is ever silently dropped.
 */
import type { ExtractedPhone, OcrLine, RepresentativeExtraction } from '../../types/extraction';
import {
  looksLikePersonName,
  cleanupLine,
  stripSalutation,
  hasDesignationKeyword,
  hasDepartmentKeyword,
  hasCompanySuffixKeyword,
  hasBusinessDomainKeyword,
  personScore,
  computeContactLineIndexes,
} from './nameCompanyExtractor';

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

function findLineFrame(lineText: string, ocrLines: OcrLine[]): Frame | null {
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const target = normalize(lineText);
  const match = ocrLines.find((l) => normalize(l.text) === target);
  return match?.frame ?? null;
}

function findSourceLineIndex(substring: string, lines: string[]): number | null {
  const idx = lines.findIndex((l) => l.toLowerCase().includes(substring.toLowerCase()));
  return idx === -1 ? null : idx;
}

/** Assigns one item's vertical center to the nearest of several anchor Y-centers, returning every
 *  anchor index the item should be attached to: a single index when the nearest anchor is
 *  unambiguously closest, or every index (shared) when position data is missing or the margin
 *  between the two closest anchors is too small to call confidently. */
function assignToAnchors(itemY: number | null, anchorYs: (number | null)[], minMarginPx: number): number[] {
  const allIndices = anchorYs.map((_, i) => i);
  if (itemY === null || anchorYs.some((y) => y === null)) return allIndices;

  const distances = anchorYs.map((y) => Math.abs((y as number) - itemY));
  const sortedDistances = [...distances].sort((a, b) => a - b);
  const closest = sortedDistances[0];
  const secondClosest = sortedDistances[1] ?? Infinity;
  if (secondClosest - closest < minMarginPx) return allIndices;

  return [distances.indexOf(closest)];
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function detectMultipleRepresentatives(
  lines: string[],
  ocrLines: OcrLine[] | undefined,
  phones: ExtractedPhone[],
  emails: string[],
  primaryPersonName: string | null,
  companyName: string | null = null
): RepresentativeExtraction[] | null {
  // A line that reads as a designation ("Sales Manager", "General Manager", ...) can coincidentally
  // match the same 2-word Title-Case shape as a real name — exclude anything designation-shaped so
  // it never gets counted as a second person. Likewise, exclude any line that's already part of
  // the (possibly multi-line-merged, e.g. "Krish" + "FURNITURE") company name, so a short brand
  // word doesn't get double-counted as a person. A department/lab/unit line ("Hitachi Research
  // Laboratory", "Intelligent Sensing Systems Unit") or a line carrying a legal/company suffix word
  // can likewise match the same Title-Case shape — exclude those too, using the same keyword
  // dictionaries the primary company/designation extractor already relies on (see QA finding:
  // real cards produced fake "representatives" named after a department or product line).
  const normalizedCompany = companyName?.toLowerCase() ?? null;
  const isEligibleAnchorLine = (line: string) =>
    !hasDesignationKeyword(line) &&
    !hasDepartmentKeyword(line) &&
    !hasCompanySuffixKeyword(line) &&
    !hasBusinessDomainKeyword(line) &&
    !(normalizedCompany && normalizedCompany.includes(line.toLowerCase()));

  const multiWordAnchors = lines
    .map((line, index) => ({ line, index }))
    .filter((c) => isEligibleAnchorLine(c.line) && looksLikePersonName(c.line));
  const singleWordAnchors = lines
    .map((line, index) => ({ line, index }))
    .filter((c) => isEligibleAnchorLine(c.line) && looksLikePersonName(c.line, true));
  // Mirror the primary extractor's own preference: only fall back to single-word (informal) name
  // matching when the card has no properly-shaped multi-word name at all.
  const anchorCandidates = multiWordAnchors.length > 0 ? multiWordAnchors : singleWordAnchors;

  const anchors = anchorCandidates.map((c) => ({
    name: cleanupLine(stripSalutation(c.line)),
    lineIndex: c.index,
  }));

  // Deduplicate by cleaned name (defensive — the same person's name shouldn't appear twice).
  const seen = new Set<string>();
  let uniqueAnchors = anchors.filter((a) => {
    const key = a.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // A department/product-line/tagline line can still slip through the keyword-based exclusion
  // above when it carries no recognizable department/company-suffix word at all (e.g. "Kappo
  // Dining" printed directly above the real "Shoichi Shiono / executive chef" block) — it has the
  // same Title-Case, 2-4-word shape as a genuine name, and nothing in the dictionaries flags it.
  // Narrowly cover exactly that pattern: when there are only two anchor candidates and precisely
  // one of them sits immediately next to a designation/department line (in text reading order,
  // regardless of where phone/email groups happen to sit — mirrors the primary extractor's own
  // "name adjacent to designation wins" rule), the other is almost certainly organizational
  // context rather than a second person, so drop it. Left untouched whenever both, or neither,
  // anchor has this adjacency — that's exactly the real "two genuine proprietors, no designation
  // printed at all" layout (e.g. Krish FURNITURE), where there is no basis to prefer one anchor
  // over the other.
  if (uniqueAnchors.length === 2) {
    const isAdjacentToDesignationOrDepartment = (lineIndex: number) =>
      [lineIndex - 1, lineIndex + 1].some((i) => {
        const neighbor = lines[i];
        return neighbor !== undefined && (hasDesignationKeyword(neighbor) || hasDepartmentKeyword(neighbor));
      });
    const corroborated = uniqueAnchors.filter((a) => isAdjacentToDesignationOrDepartment(a.lineIndex));
    if (corroborated.length === 1) {
      return null; // collapses to a single real representative — caller falls back to flat fields
    }
  }

  // With 3+ anchor candidates, bare Title-Case shape is no longer enough on its own — a card with
  // this many "name-shaped" lines is just as likely to be one real person surrounded by several
  // product/service/description lines that happen to share the same shape (task finding: a mobile
  // shop's OCR text produced "Mahendra Modi" (real proprietor) plus "Cover House" and "Touch Glass"
  // (product/repair line items) as three "representatives"). Require each anchor to have at least
  // one piece of evidence beyond bare shape — the same personScore used elsewhere for exactly this
  // purpose (designation/department adjacency, phone/email adjacency, a salutation) — before
  // trusting it as a real person. Below 3 anchors this is deliberately not applied: real multi-
  // proprietor cards (e.g. Krish FURNITURE) routinely have two names with no such corroboration at
  // all, sharing one unlabeled phone/name block with no way to pick a "better" one — see the
  // 2-anchor branch above and its own doc comment.
  if (uniqueAnchors.length > 2) {
    const contactLineIndexes = computeContactLineIndexes(lines, phones, emails);
    const designationIndex = lines.findIndex((l) => hasDesignationKeyword(l));
    const designationIdx = designationIndex === -1 ? null : designationIndex;
    const corroborated = uniqueAnchors.filter(
      (a) => personScore({ line: lines[a.lineIndex], index: a.lineIndex }, designationIdx, contactLineIndexes) >= 2
    );
    if (corroborated.length < 2) return null; // not enough real people evidenced — fall back to flat fields
    uniqueAnchors = corroborated;
  }

  if (uniqueAnchors.length < 2) return null;

  // Keep the already-computed primary representative first, so representatives[0] always matches
  // the flat personName field on ExtractionResult for backward-compatible consistency.
  uniqueAnchors.sort((a, b) => {
    const aIsPrimary = primaryPersonName !== null && a.name === primaryPersonName;
    const bIsPrimary = primaryPersonName !== null && b.name === primaryPersonName;
    if (aIsPrimary === bIsPrimary) return 0;
    return aIsPrimary ? -1 : 1;
  });

  const ocrLinesAvailable = ocrLines ?? [];
  const anchorFrames = uniqueAnchors.map((a) => findLineFrame(lines[a.lineIndex], ocrLinesAvailable));
  const anchorYs = anchorFrames.map((f) => (f ? f.y + f.height / 2 : null));
  const minMarginPx = Math.max(averageOf(anchorFrames.filter((f): f is Frame => f !== null).map((f) => f.height)) * 0.5, 10);

  const phoneBuckets: ExtractedPhone[][] = uniqueAnchors.map(() => []);
  for (const phone of phones) {
    const sourceIndex = findSourceLineIndex(phone.raw, lines);
    const frame = sourceIndex !== null ? findLineFrame(lines[sourceIndex], ocrLinesAvailable) : null;
    const itemY = frame ? frame.y + frame.height / 2 : null;
    const targets = assignToAnchors(itemY, anchorYs, minMarginPx);
    for (const t of targets) phoneBuckets[t].push(phone);
  }

  const emailBuckets: string[][] = uniqueAnchors.map(() => []);
  for (const email of emails) {
    const sourceIndex = findSourceLineIndex(email, lines);
    const frame = sourceIndex !== null ? findLineFrame(lines[sourceIndex], ocrLinesAvailable) : null;
    const itemY = frame ? frame.y + frame.height / 2 : null;
    const targets = assignToAnchors(itemY, anchorYs, minMarginPx);
    for (const t of targets) emailBuckets[t].push(email);
  }

  // Designation/department per-additional-representative is intentionally out of scope for this
  // pass (kept null) — the card-level designation already surfaces on the primary representative
  // via the existing flat fields. Splitting designations per person would need the same clustering
  // applied to designation lines too; deferred until there's evidence it's commonly needed.
  return uniqueAnchors.map((anchor, i) => ({
    name: anchor.name,
    designation: null,
    department: null,
    phones: phoneBuckets[i],
    emails: emailBuckets[i],
    confidence: anchorYs[i] !== null ? 0.75 : 0.4,
  }));
}
