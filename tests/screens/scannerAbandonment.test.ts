/**
 * Regression tests for the "abandoned scan leaves a permanent junk card" bug found during final
 * physical-device release QA: a card row (status 'captured') is created as soon as the front photo
 * is captured, before OCR/extraction ever runs (see ScannerScreen.handleCapture). Previously,
 * nothing cleaned that row up if the user then left the Scanner screen before finishCapture ever
 * ran for it (e.g. backing out at the "does this card have a back?" prompt) — it stayed forever
 * with no company/representative data, inflating Dashboard counts and cluttering the Card Library
 * with entries that could never be usefully reviewed.
 *
 * The fix's actual decision logic — shouldCleanUpAbandonedCapture() — is a pure function with no
 * database or navigation import, tested directly here, for the same reason leadMergeLogic.ts's
 * functions are tested directly in leadRepository.merge.test.ts rather than through the real
 * SQLite repository layer: importing cardsRepo.ts (or any module that imports database/db.ts)
 * pulls in expo-sqlite, which does not resolve under the jest-expo Jest preset.
 *
 * ScannerScreen's own beforeRemove listener (the DB delete + physical file cleanup that this
 * function's `true` result triggers) is exercised by the on-device physical verification pass
 * documented in FINAL_DEVICE_QA_REPORT.md's "Final Fixes" section, not by a Jest test — there is no
 * component-testing setup in this project (no @testing-library/react-native), and adding one is
 * out of scope for this fix.
 */

import { shouldCleanUpAbandonedCapture } from '../../src/screens/scannerLifecycle';

describe('shouldCleanUpAbandonedCapture', () => {
  it('cleans up when a card was created but finishCapture never started (the actual bug)', () => {
    // Front photo captured -> card row exists -> user backs out at the back-side prompt (or any
    // other point) without ever reaching finishCapture. This is exactly the abandonment case that
    // left a permanent "Unknown Company / Unknown Contact — Captured" junk card during QA.
    expect(shouldCleanUpAbandonedCapture({ hasCard: true, finishCaptureStarted: false })).toBe(true);
  });

  it('does nothing when no card was ever created', () => {
    // "Start scan -> cancel before capture": the user backs out before tapping the shutter at all,
    // so cardRef.current is still null. Nothing to clean up, nothing was ever persisted.
    expect(shouldCleanUpAbandonedCapture({ hasCard: false, finishCaptureStarted: false })).toBe(false);
  });

  it('never cleans up once finishCapture has started, even though the flag alone cannot see the outcome', () => {
    // Two real outcomes share finishCaptureStarted=true, and both must be preserved:
    //  1. finishCapture succeeds -> status becomes 'needs_review' and the screen navigates to
    //     Review. The card must never be deleted out from under that screen.
    //  2. finishCapture's own extraction/database write throws -> the card intentionally stays at
    //     status 'captured' as a recoverable draft ("Open it from the Card Library to fill in the
    //     details manually" — see ScannerScreen's existing catch block). Sweeping this away would
    //     silently break that promise and weaken existing error handling.
    // Both are covered by the same assertion because the guard's job is to never fire once
    // finishCapture has been attempted, regardless of how it turns out.
    expect(shouldCleanUpAbandonedCapture({ hasCard: true, finishCaptureStarted: true })).toBe(false);
  });

  it('does nothing when there is no card, regardless of the finishCapture flag', () => {
    // Defensive case: hasCard=false should never trigger cleanup no matter what
    // finishCaptureStarted says, since there is nothing to clean up either way.
    expect(shouldCleanUpAbandonedCapture({ hasCard: false, finishCaptureStarted: true })).toBe(false);
  });
});
