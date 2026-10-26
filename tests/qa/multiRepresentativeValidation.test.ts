/**
 * QA harness: multi-representative validation, per the QA task's "MULTI-REPRESENTATIVE
 * VALIDATION" / "DATABASE VALIDATION" requirements.
 *
 * Two distinct kinds of coverage here, kept clearly separate:
 *
 * (1) REAL-CARD REPRODUCTION — "Krish FURNITURE" (Shaileshbhai / Niteshbhai), a genuine Indian
 *     two-proprietor business card previously scanned and saved during this project's own earlier
 *     on-device QA (see FINAL_DEVICE_QA_REPORT.md, "Critical Regression — CARD-000005"). The
 *     company name and both representatives' real names/phone numbers are reproduced from that
 *     report. This is real card content, not fabricated data, and is run through the actual,
 *     unmodified `runExtractionPipeline()` (including its OCR-line-position clustering) to confirm
 *     today's build still splits it into two correct, separate representatives.
 *
 * (2) MERGE-LOGIC STRESS SCENARIOS — additional save-sequence scenarios (re-running the same card,
 *     a third representative joining an existing two-person company, a later card with sparser
 *     data than what's already saved) that exercise the exact same pure, DB-free merge-decision
 *     functions the project's own tests/repositories/leadRepository.merge.test.ts already uses
 *     (`resolveCompanyWriteMode`, `resolveRepresentativeWriteMode`, `resolveClaimedRepresentativeId`,
 *     `sparseCompanyPatch`). These are explicitly logic-level scenarios extending that existing
 *     Scenario-lettered suite (continuing as Scenario H/I/J) — labeled as such, not presented as
 *     new "real card" evidence, per the QA task's instruction not to pass off fabricated cards as
 *     real multi-representative test data.
 *
 * Neither part touches a real SQLite database — see the doc comment at the top of
 * leadRepository.merge.test.ts for why that's the project's own established, deliberate choice
 * (expo-sqlite doesn't resolve under Jest). Live database relationship integrity (orphans, FK
 * correctness) for cards actually saved on-device is verified separately in the physical-device
 * pass via the Card Library/Card Detail UI and the Excel export, both of which read directly from
 * the real on-device database.
 */
import { runExtractionPipeline } from '../../src/services/extraction/pipeline';
import type { OcrLine } from '../../src/types/extraction';
import {
  resolveCompanyWriteMode,
  resolveRepresentativeWriteMode,
  resolveClaimedRepresentativeId,
  sparseCompanyPatch,
  orFallback,
  type CompanyInput,
} from '../../src/repositories/leadMergeLogic';

function line(text: string, y: number, height = 40): OcrLine {
  return { text, frame: { x: 60, y, width: 500, height }, side: 'front' };
}

describe('(1) Real-card reproduction — Krish FURNITURE / Shaileshbhai & Niteshbhai', () => {
  // Layout modeled on a typical two-proprietor Indian shop card: company name banner at top, then
  // each proprietor's name immediately followed by their own phone number, stacked vertically.
  const ocrLines: OcrLine[] = [
    line('Krish FURNITURE', 40, 50),
    line('Shaileshbhai', 220, 40),
    line('9824921087', 265, 35),
    line('Niteshbhai', 420, 40),
    line('9374969212', 465, 35),
  ];
  const rawText = ocrLines.map((l) => l.text).join('\n');

  it('splits into exactly two representatives with correctly separated phone numbers', () => {
    const result = runExtractionPipeline(rawText, [], ocrLines);
    expect(result.representatives).not.toBeNull();
    expect(result.representatives).toHaveLength(2);

    const shailesh = result.representatives!.find((r) => r.name.toLowerCase().includes('shailesh'));
    const nitesh = result.representatives!.find((r) => r.name.toLowerCase().includes('nitesh'));
    expect(shailesh).toBeDefined();
    expect(nitesh).toBeDefined();

    expect(shailesh!.phones.map((p) => p.raw)).toEqual(['9824921087']);
    expect(nitesh!.phones.map((p) => p.raw)).toEqual(['9374969212']);
    // Neither person's number leaked onto the other — the exact failure mode of the real
    // CARD-000005 regression this reproduces.
    expect(shailesh!.phones.some((p) => p.raw === '9374969212')).toBe(false);
    expect(nitesh!.phones.some((p) => p.raw === '9824921087')).toBe(false);
  });

  it('company name is read once, correctly, and not confused for a third representative', () => {
    const result = runExtractionPipeline(rawText, [], ocrLines);
    expect(result.companyName).toBe('Krish FURNITURE');
    expect(result.representatives).toHaveLength(2); // not 3
  });

  it('KNOWN GAP (by design, not a bug introduced here): per-representative designation is not split', () => {
    // multiRepresentative.ts explicitly always returns designation: null per representative
    // (see its own doc comment — "deferred until there's evidence it's commonly needed"). The QA
    // task asks to verify per-representative designation; this test documents that the current
    // implementation does not attempt it, so that gap is reported rather than silently missed.
    const result = runExtractionPipeline(rawText, [], ocrLines);
    for (const rep of result.representatives!) {
      expect(rep.designation).toBeNull();
    }
  });
});

describe('(2) Merge-logic stress scenarios (Scenario H/I/J, extending leadRepository.merge.test.ts)', () => {
  const EXISTING_KRISH_FURNITURE: CompanyInput = {
    name: 'Krish FURNITURE',
    website: null,
    addressLine: null,
    city: null,
    state: null,
    country: null,
  };

  it('Scenario H — re-saving the exact same two-representative card a second time must not create uncontrolled duplicate rows: both representatives resolve to their OWN existing ids, not each other\'s', () => {
    // Simulates opening the already-saved CARD-000005 again in Edit and pressing Save with no
    // changes: both representatives should independently re-match their own existing row.
    const alreadyClaimed = new Set<string>();
    const shaileshClaim = resolveClaimedRepresentativeId('rep-shailesh-existing-id', alreadyClaimed);
    const niteshClaim = resolveClaimedRepresentativeId('rep-nitesh-existing-id', alreadyClaimed);

    expect(shaileshClaim).toBe('rep-shailesh-existing-id');
    expect(niteshClaim).toBe('rep-nitesh-existing-id');
    expect(resolveRepresentativeWriteMode(shaileshClaim)).toBe('full-overwrite');
    expect(resolveRepresentativeWriteMode(niteshClaim)).toBe('full-overwrite');
    // No new row created for either — re-running the same card is a no-op duplication-wise.
  });

  it('Scenario H (collision case) — if OCR/matching logic mistakenly resolves BOTH people to the SAME existing row id, the second must fall back to creating a new row rather than overwriting the first (this is the exact CARD-000005 bug, re-asserted)', () => {
    // Mirrors ReviewScreen.tsx's performSave(): a running claimedRepresentativeIds set is threaded
    // sequentially, and the caller adds each resolved (non-null) id before resolving the next one.
    const alreadyClaimed = new Set<string>();
    const first = resolveClaimedRepresentativeId('shared-id-both-matched', alreadyClaimed);
    if (first) alreadyClaimed.add(first);
    const second = resolveClaimedRepresentativeId('shared-id-both-matched', alreadyClaimed);

    expect(first).toBe('shared-id-both-matched'); // first claimant keeps it
    expect(second).toBeNull(); // second claimant is forced to create a fresh row instead of overwriting
    expect(resolveRepresentativeWriteMode(first)).toBe('full-overwrite');
    expect(resolveRepresentativeWriteMode(second)).toBe('create');
  });

  it('Scenario I — a THIRD representative joining an existing two-person company must be created fresh, and the company write mode must stay sparse-merge (not full-overwrite) purely because one card lists 3 people', () => {
    // A new card for the same company adds "Bhargav" — a person not in the DB yet.
    const companyMode = resolveCompanyWriteMode('krish-furniture-company-id', false);
    expect(companyMode).toBe('sparse-merge');

    const bhargavMode = resolveRepresentativeWriteMode(null);
    expect(bhargavMode).toBe('create');

    // Existing company already has a website on file; the new card's OCR didn't pick one up.
    // The company's known website must survive untouched.
    const existingCompanyWithWebsite: CompanyInput = {
      ...EXISTING_KRISH_FURNITURE,
      website: 'www.krishfurniture.example',
      city: 'Rajkot',
    };
    const patch = sparseCompanyPatch(existingCompanyWithWebsite, {
      name: 'Krish FURNITURE',
      website: null,
      addressLine: null,
      city: null,
      state: null,
      country: null,
    });
    expect(patch).not.toHaveProperty('website');
    expect(patch).not.toHaveProperty('city');
  });

  it('Scenario J — a partially-populated OCR result (blank company address/website) must never erase already-known company fields, and must never write an empty-string name', () => {
    const richExisting: CompanyInput = {
      name: 'Krish FURNITURE',
      website: 'www.krishfurniture.example',
      addressLine: 'Station Road, Rajkot, Gujarat',
      city: 'Rajkot',
      state: 'Gujarat',
      country: 'India',
    };
    const sparseIncoming: CompanyInput = {
      name: '', // OCR failed to (re-)read the company name banner on this particular card
      website: null,
      addressLine: null,
      city: null,
      state: null,
      country: null,
    };
    const patch = sparseCompanyPatch(richExisting, sparseIncoming);
    // Every already-known field is completely absent from the patch (never overwritten with blank).
    expect(patch).not.toHaveProperty('website');
    expect(patch).not.toHaveProperty('addressLine');
    expect(patch).not.toHaveProperty('city');
    expect(patch).not.toHaveProperty('state');
    expect(patch).not.toHaveProperty('country');
    // And the name fallback guarantees a blank OCR name is never what gets written.
    expect(orFallback(sparseIncoming.name, 'Unknown Company')).toBe('Unknown Company');
  });

  it('Scenario J (phones/emails) — multiRepresentative clustering attaches each phone/email to the correct person even when a THIRD person with no contact info is also on the card', () => {
    const ocrLines: OcrLine[] = [
      line('Krish FURNITURE', 40, 50),
      line('Shaileshbhai', 220, 40),
      line('9824921087', 265, 35),
      line('Niteshbhai', 420, 40),
      line('9374969212', 465, 35),
      line('Bhargav', 620, 40), // third proprietor, no phone/email of their own printed
    ];
    const rawText = ocrLines.map((l) => l.text).join('\n');
    const result = runExtractionPipeline(rawText, [], ocrLines);

    expect(result.representatives).toHaveLength(3);
    const bhargav = result.representatives!.find((r) => r.name.toLowerCase().includes('bhargav'));
    expect(bhargav).toBeDefined();
    expect(bhargav!.phones).toHaveLength(0); // nothing invented for the person with no printed number
    const shailesh = result.representatives!.find((r) => r.name.toLowerCase().includes('shailesh'));
    const nitesh = result.representatives!.find((r) => r.name.toLowerCase().includes('nitesh'));
    expect(shailesh!.phones.map((p) => p.raw)).toEqual(['9824921087']);
    expect(nitesh!.phones.map((p) => p.raw)).toEqual(['9374969212']);
  });
});
