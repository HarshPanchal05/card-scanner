/**
 * Minimal logging helpers so error/debug logging is deliberate and centralized rather than
 * scattered ad-hoc console.log calls. See docs/OCR.md / README "Privacy & Logging" — never pass
 * card content (OCR text, phone numbers, emails, names) to these; only technical failure reasons.
 */

/** Logs a genuine, unexpected failure (native module error, DB/filesystem exception, etc.).
 *  Kept even in production builds — this is what you'd want in a bug report — but the message
 *  passed in must never contain scanned card content. */
export function logError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`[${scope}]`, message);
}

/** Verbose, development-only diagnostics. Stripped from production behavior (still calls
 *  console.log, but only when __DEV__ is true, keeping production logcat quiet). */
export function logDebug(scope: string, message: string): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[${scope}]`, message);
  }
}
