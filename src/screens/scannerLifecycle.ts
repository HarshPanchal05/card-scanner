/** Pure decision logic for cleaning up an abandoned in-progress scan — no database or navigation
 *  import, so it can be unit-tested directly (see tests/screens/scannerAbandonment.test.ts) without
 *  the SQLite/Jest constraint documented in leadMergeLogic.ts and leadRepository.merge.test.ts.
 *
 *  A card row is created (status 'captured') as soon as the front photo is captured, before OCR or
 *  extraction ever runs — see ScannerScreen's handleCapture. If the user then leaves the Scanner
 *  screen before finishCapture is ever invoked for that card (e.g. backing out at the "does this
 *  card have a back?" prompt), the row would otherwise remain permanently in the database with no
 *  company/representative data: a junk entry that inflates Dashboard counts and can never be
 *  usefully reviewed. This function is the single source of truth for exactly when that cleanup
 *  should fire.
 *
 *  Deliberately excluded: a card whose finishCapture has already started, even if it goes on to
 *  fail (e.g. the extraction/database write itself throws) — that card intentionally stays
 *  recoverable from the Card Library ("Open it from the Card Library to fill in the details
 *  manually"), matching ScannerScreen's existing error-handling promise. */
export function shouldCleanUpAbandonedCapture(input: {
  hasCard: boolean;
  finishCaptureStarted: boolean;
}): boolean {
  return input.hasCard && !input.finishCaptureStarted;
}
