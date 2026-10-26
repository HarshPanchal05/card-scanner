/** Types produced by the OCR + extraction pipeline, before anything is written to SQLite. */

export interface OcrBlock {
  text: string;
  /** Bounding box in image pixel coordinates, top-left origin. Used for layout heuristics
   *  (e.g. the largest text block near the top is often the company name or person name). */
  frame: { x: number; y: number; width: number; height: number } | null;
}

/** A single recognized line of text with its own position, flattened out of ML Kit's
 *  block->line hierarchy. Block-level frames (OcrBlock above) are too coarse for spatial
 *  reasoning — ML Kit often groups multiple visually distinct lines into one block — so anything
 *  that needs to compare the position of individual lines (e.g. clustering a business card's
 *  phone numbers to the specific person they belong to) should use this instead. */
export interface OcrLine {
  text: string;
  frame: { x: number; y: number; width: number; height: number } | null;
  side: 'front' | 'back';
}

export interface OcrResult {
  fullText: string;
  blocks: OcrBlock[];
  /** Flattened, in reading order (top-to-bottom, left-to-right per block), one entry per line
   *  ML Kit recognized on this side of the card. */
  lines: OcrLine[];
  side: 'front' | 'back';
}

export interface ExtractedPhone {
  raw: string;
  normalized: string;
  kind: import('./models').PhoneKind;
}

export interface FieldConfidence {
  company: number;
  person: number;
  designation: number;
  phones: number;
  emails: number;
  website: number;
  address: number;
  category: number;
}

/** One detected person on a card that lists multiple representatives (e.g. two proprietors each
 *  with their own number). `confidence` reflects how sure the clustering was that this person's
 *  phones/emails genuinely belong to them specifically, as opposed to being shared/ambiguous
 *  (attached to every representative on the card because the layout gave no way to tell them
 *  apart) — see services/extraction/multiRepresentative.ts. */
export interface RepresentativeExtraction {
  name: string;
  designation: string | null;
  department: string | null;
  phones: ExtractedPhone[];
  emails: string[];
  confidence: number;
}

export interface ExtractionResult {
  companyName: string | null;
  personName: string | null;
  designation: string | null;
  department: string | null;
  phones: ExtractedPhone[];
  emails: string[];
  website: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  categoryNames: string[];
  /** Single, deterministic category decision for the whole card — used to pre-select the Review
   *  screen's Category field. Always a real category name or "Other" (see
   *  categoryExtractor.ts#decidePrimaryCategory); never empty. Distinct from `categoryNames`
   *  above, which is the older multi-tag suggestion list kept for backward compatibility. */
  primaryCategory: string;
  /** 0..1 confidence behind `primaryCategory`; 0 whenever it fell back to "Other". */
  primaryCategoryConfidence: number;
  confidence: FieldConfidence;
  /** Lines from OCR that were not attributed to any field, kept for the notes field / debugging. */
  unclassifiedLines: string[];
  /** Populated only when 2+ people were confidently detected on the card — see
   *  multiRepresentative.ts. `null` means "ordinary single-representative card"; in that case the
   *  flat personName/designation/department/phones/emails fields above are already the complete,
   *  correct result and nothing further needs to be done. When non-null, it always has length >=
   *  2, and `personName`/`phones`/etc. above still describe the *first* of these representatives
   *  (kept for backward compatibility with every existing caller that only looks at the flat
   *  fields). */
  representatives: RepresentativeExtraction[] | null;
}
