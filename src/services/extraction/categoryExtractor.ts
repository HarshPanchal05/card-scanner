import { DEFAULT_CATEGORIES, OTHER_CATEGORY_NAME, type CategoryDefinition } from '../../constants/categories';

export interface CategoryMatch {
  name: string;
  confidence: number;
  matchedKeywords: string[];
}

/** Offline keyword-dictionary classification — no network, no LLM call. Scores every category by
 *  how many of its keywords appear anywhere in the OCR text, normalized so a card that happens to
 *  mention one keyword once doesn't outrank a card that clearly matches a category multiple ways.
 *  Custom categories (from the categories table) are merged in by the caller before invoking this. */
export function classifyCategories(
  fullText: string,
  extraDictionary: CategoryDefinition[] = []
): CategoryMatch[] {
  const haystack = fullText.toLowerCase();
  const dictionary = [...DEFAULT_CATEGORIES, ...extraDictionary];

  const matches: CategoryMatch[] = [];
  for (const def of dictionary) {
    const matchedKeywords = def.keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
    if (matchedKeywords.length === 0) continue;
    const confidence = Math.min(1, 0.5 + matchedKeywords.length * 0.15);
    matches.push({ name: def.name, confidence, matchedKeywords });
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/** Convenience wrapper returning just the names of categories worth pre-selecting in the review
 *  screen, falling back to "Other" (confidence 0) when nothing matched so the field is never
 *  silently left blank. */
export function suggestCategoryNames(fullText: string, extraDictionary: CategoryDefinition[] = []): {
  names: string[];
  confidence: number;
} {
  const matches = classifyCategories(fullText, extraDictionary);
  if (matches.length === 0) return { names: [OTHER_CATEGORY_NAME], confidence: 0 };
  const top = matches.slice(0, 3);
  const avgConfidence = top.reduce((sum, m) => sum + m.confidence, 0) / top.length;
  return { names: top.map((m) => m.name), confidence: avgConfidence };
}

export interface CategoryScore {
  name: string;
  score: number;
  matchedKeywords: string[];
}

export interface CategoryDecision {
  /** A real category name, or OTHER_CATEGORY_NAME when nothing was a confident, unambiguous
   *  match. Never empty. */
  name: string;
  confidence: number;
  /** True when the top two candidates were too close to safely pick one — the safe fallback
   *  ("Other") was used specifically because of ambiguity, not because nothing matched at all. */
  isAmbiguous: boolean;
  /** Up to 3 highest-scoring candidates considered, for optional "Suggested Category" UI. Empty
   *  when nothing matched at all. */
  candidates: CategoryScore[];
}

/** A single generic-keyword hit (score 3) alone is not enough to confidently assign a category —
 *  only the category's own name appearing verbatim (+5) or 2+ distinct keyword hits (2*3=6)
 *  clears this bar. Keeps a lone incidental word match from forcing an unrelated card into a
 *  category (task requirement: "must NEVER force an unrelated business card into an incorrect
 *  user-defined category merely because of a weak keyword match"). */
const MIN_SCORE_TO_ASSIGN = 5;

/** If the runner-up is also above MIN_SCORE_TO_ASSIGN and within this many points of the top
 *  score, the decision is too close to call safely (e.g. "Furniture" and "Interior Design" both
 *  matching two keywords each) and falls back to Other rather than guessing. */
const AMBIGUITY_MARGIN = 2;

/** Deterministic, offline, single-category decision for a card — the authoritative suggestion
 *  shown (and overridable) on the Review screen, distinct from the older multi-tag
 *  `suggestCategoryNames` above. Scores every category (built-ins from DEFAULT_CATEGORIES plus
 *  any custom categories passed via `extraDictionary`, see constants/categories.ts's
 *  categoryRowsToDictionary): the category's own name appearing in the text is worth +5 (a strong,
 *  Level-1 "exact match" signal), each other distinct keyword it lists is worth +3 (a weaker,
 *  Level-2 "related terminology" signal). The winner is only assigned when its score clears
 *  MIN_SCORE_TO_ASSIGN and isn't within AMBIGUITY_MARGIN of the runner-up; otherwise the result is
 *  the safe "Other" fallback. No network call, no LLM — plain substring matching over a small,
 *  maintainable dictionary. */
export function decidePrimaryCategory(
  fullText: string,
  extraDictionary: CategoryDefinition[] = []
): CategoryDecision {
  const haystack = fullText.toLowerCase();
  const dictionary = [...DEFAULT_CATEGORIES, ...extraDictionary];

  const scored: CategoryScore[] = [];
  for (const def of dictionary) {
    const nameLower = def.name.toLowerCase();
    let score = 0;
    const matchedKeywords: string[] = [];
    if (haystack.includes(nameLower)) {
      score += 5;
      matchedKeywords.push(def.name);
    }
    for (const kw of def.keywords) {
      const kwLower = kw.toLowerCase();
      if (kwLower === nameLower) continue; // already counted as the name match above
      if (haystack.includes(kwLower)) {
        score += 3;
        matchedKeywords.push(kw);
      }
    }
    if (score > 0) scored.push({ name: def.name, score, matchedKeywords });
  }
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { name: OTHER_CATEGORY_NAME, confidence: 0, isAmbiguous: false, candidates: [] };
  }

  const candidates = scored.slice(0, 3);
  const top = scored[0];
  const runnerUp = scored[1];

  const tooWeak = top.score < MIN_SCORE_TO_ASSIGN;
  const tooAmbiguous =
    !!runnerUp && runnerUp.score >= MIN_SCORE_TO_ASSIGN && top.score - runnerUp.score < AMBIGUITY_MARGIN;

  if (tooWeak || tooAmbiguous) {
    return { name: OTHER_CATEGORY_NAME, confidence: 0, isAmbiguous: tooAmbiguous, candidates };
  }

  return { name: top.name, confidence: Math.min(1, top.score / 10), isAmbiguous: false, candidates };
}
