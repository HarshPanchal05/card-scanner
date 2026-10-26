/**
 * All tunable thresholds and magic numbers live here so they can be adjusted
 * without hunting through the codebase. Values can be overridden at runtime
 * via app_settings (see repositories/settingsRepo.ts) — the constants below
 * are the shipped defaults.
 */

export const IMAGE_QUALITY_CONFIG = {
  /** Image is downscaled to this width before pixel analysis (blur/brightness/contrast).
   *  Keeps the JS-side jpeg decode + Laplacian pass fast (<150ms on a mid-range device). */
  analysisWidth: 480,

  /** Laplacian variance below this = blurry. Tuned empirically against the sample set in
   *  docs/OCR.md. Lower = more permissive (accepts softer images). */
  blurVarianceThreshold: 60,

  /** Mean luminance (0-255) below this = too dark. */
  minBrightness: 55,
  /** Mean luminance above this = likely blown out / glare. */
  maxBrightness: 225,

  /** Standard deviation of luminance below this = flat/low-contrast image (often a wash of glare
   *  or a card that fills too little of the frame against a plain background). */
  minContrast: 18,

  /** Fraction (0-1) of the analysis image that must contain "content" (edge energy) for the
   *  card to be considered fully present rather than mostly background. */
  minContentCoverage: 0.12,

  /** Full-resolution JPEG compression quality used when persisting the original capture. */
  originalCaptureQuality: 0.92,
  /** Compression quality used for the small thumbnail shown in Card Library lists. */
  thumbnailQuality: 0.6,
  thumbnailWidth: 240,
} as const;

export const OCR_CONFIG = {
  /** Hard timeout for a single-side OCR pass. If ML Kit hangs, we fail gracefully rather than
   *  freezing the review flow. */
  timeoutMs: 15000,
} as const;

export const DUPLICATE_CONFIG = {
  /** Two representatives are flagged as possible duplicates if they share a normalized phone
   *  number, an email address, or (company + person name) after normalization. */
  nameSimilarityThreshold: 0.86,
} as const;

export const STORAGE_CONFIG = {
  rootFolderName: 'CardScanner',
  cardsFolderName: 'Cards',
  reportsFolderName: 'Reports',
  backupsFolderName: 'Backups',
  tempFolderName: 'Temp',
} as const;

export const PAGINATION_CONFIG = {
  cardLibraryPageSize: 30,
} as const;
