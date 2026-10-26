import { detectMultipleRepresentatives } from '../../src/services/extraction/multiRepresentative';
import type { ExtractedPhone, OcrLine } from '../../src/types/extraction';

function phone(raw: string): ExtractedPhone {
  return { raw, normalized: raw.replace(/\D/g, ''), kind: 'mobile' };
}

/** Builds a synthetic OcrLine list with evenly-spaced Y positions, one entry per line of text, in
 *  order — a stand-in for what ocrService.ts would produce from a real card photo. Fine for tests
 *  that don't care about exact spatial grouping (e.g. "no position data" or single-person cases). */
function makeOcrLines(lines: string[], lineHeight = 30, gap = 10): OcrLine[] {
  return lines.map((text, i) => ({
    text,
    frame: { x: 0, y: i * (lineHeight + gap), width: 400, height: lineHeight },
    side: 'front' as const,
  }));
}

/** Builds OcrLines with explicit Y positions per line — used wherever a test needs to control
 *  exactly how close/far apart lines are (realistic cards group a person's own name and phone
 *  close together, with a bigger gap between different people's groups; uniform spacing would put
 *  a line exactly between two people at an artificial equal distance from both). */
function makeOcrLinesAt(entries: { text: string; y: number }[], lineHeight = 30): OcrLine[] {
  return entries.map(({ text, y }) => ({
    text,
    frame: { x: 0, y, width: 400, height: lineHeight },
    side: 'front' as const,
  }));
}

describe('detectMultipleRepresentatives', () => {
  it('returns null for an ordinary single-person card (the common case, must be unaffected)', () => {
    const lines = ['ABC Engineering Pvt Ltd', 'Rajesh Patel', 'Sales Manager', '9876543210'];
    const result = detectMultipleRepresentatives(lines, makeOcrLines(lines), [phone('9876543210')], [], 'Rajesh Patel');
    expect(result).toBeNull();
  });

  it('does not miscount a designation line ("Sales Manager") as a second person', () => {
    const lines = ['Rajesh Patel', 'Sales Manager', '9876543210'];
    const result = detectMultipleRepresentatives(lines, makeOcrLines(lines), [phone('9876543210')], [], 'Rajesh Patel');
    expect(result).toBeNull();
  });

  it('returns null when there are no name-shaped lines at all', () => {
    const lines = ['ABC ENGINEERING', '9876543210'];
    const result = detectMultipleRepresentatives(lines, makeOcrLines(lines), [phone('9876543210')], [], null);
    expect(result).toBeNull();
  });

  it('splits two people into separate representatives when each name sits next to its own phone (spatially separable)', () => {
    const lines = ['TEST INDUSTRIAL SOLUTIONS', 'Rajesh Patel', '9876543210', 'Amit Shah', '9825012345'];
    const ocrLines = makeOcrLinesAt([
      { text: lines[0], y: 0 },
      { text: lines[1], y: 100 }, // Rajesh's group
      { text: lines[2], y: 140 }, // his own phone, close to him
      { text: lines[3], y: 400 }, // Amit's group, far from Rajesh's
      { text: lines[4], y: 440 }, // his own phone, close to him
    ]);
    const result = detectMultipleRepresentatives(
      lines,
      ocrLines,
      [phone('9876543210'), phone('9825012345')],
      [],
      'Rajesh Patel'
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0].name).toBe('Rajesh Patel'); // primary stays first
    expect(result![0].phones.map((p) => p.raw)).toEqual(['9876543210']);
    expect(result![1].name).toBe('Amit Shah');
    expect(result![1].phones.map((p) => p.raw)).toEqual(['9825012345']);
    expect(result![0].confidence).toBeGreaterThan(0.5);
    expect(result![1].confidence).toBeGreaterThan(0.5);
  });

  it('never drops a phone number, even when confidently assigned to one person', () => {
    const lines = ['Rajesh Patel', '9876543210', 'Amit Shah', '9825012345'];
    const ocrLines = makeOcrLinesAt([
      { text: lines[0], y: 100 },
      { text: lines[1], y: 140 },
      { text: lines[2], y: 400 },
      { text: lines[3], y: 440 },
    ]);
    const result = detectMultipleRepresentatives(
      lines,
      ocrLines,
      [phone('9876543210'), phone('9825012345')],
      [],
      'Rajesh Patel'
    );
    const allAssignedPhones = result!.flatMap((r) => r.phones.map((p) => p.raw));
    expect(allAssignedPhones).toEqual(expect.arrayContaining(['9876543210', '9825012345']));
  });

  it('shares phones across all representatives when the layout groups them ambiguously (real device-QA case)', () => {
    // Mirrors the real "Krish Furniture" card: both phone numbers printed together as one group,
    // both proprietor names printed together as a separate group below — there is no positional
    // pairing that tells us which number belongs to which person. Constructed here so both phone
    // lines sit exactly at the midpoint between the two name anchors (equal distance to each,
    // zero margin) to directly exercise the ambiguous-margin fallback path.
    const lines = ['Mo. 9824921087', 'Mo. 9374969212', 'Shaileshbhai', 'Niteshbhai', 'Krish', 'FURNITURE'];
    const ocrLines = makeOcrLinesAt([
      { text: lines[0], y: 200 },
      { text: lines[1], y: 200 },
      { text: lines[2], y: 100 },
      { text: lines[3], y: 300 },
      { text: lines[4], y: 500 },
      { text: lines[5], y: 540 },
    ]);
    const result = detectMultipleRepresentatives(
      lines,
      ocrLines,
      [phone('9824921087'), phone('9374969212')],
      [],
      'Shaileshbhai',
      'Krish FURNITURE'
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    for (const rep of result!) {
      expect(rep.phones.map((p) => p.raw).sort()).toEqual(['9374969212', '9824921087']);
    }
  });

  it('excludes a line already consumed as part of the (possibly merged) company name', () => {
    const lines = ['Mo. 9824921087', 'Mo. 9374969212', 'Shaileshbhai', 'Niteshbhai', 'Krish', 'FURNITURE'];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9824921087'), phone('9374969212')],
      [],
      'Shaileshbhai',
      'Krish FURNITURE'
    );
    expect(result).not.toBeNull();
    expect(result!.map((r) => r.name)).not.toContain('Krish');
    expect(result).toHaveLength(2);
  });

  it('shares items across all representatives when no position data is available at all', () => {
    const lines = ['Rajesh Patel', 'Amit Shah', '9876543210', '9825012345'];
    const result = detectMultipleRepresentatives(
      lines,
      undefined, // no OCR line position data supplied
      [phone('9876543210'), phone('9825012345')],
      [],
      'Rajesh Patel'
    );
    expect(result).not.toBeNull();
    for (const rep of result!) {
      expect(rep.phones).toHaveLength(2);
    }
  });

  it('assigns emails the same way as phones', () => {
    const lines = ['Rajesh Patel', 'rajesh@example.com', 'Amit Shah', 'amit@example.com'];
    const ocrLines = makeOcrLinesAt([
      { text: lines[0], y: 100 },
      { text: lines[1], y: 140 },
      { text: lines[2], y: 400 },
      { text: lines[3], y: 440 },
    ]);
    const result = detectMultipleRepresentatives(
      lines,
      ocrLines,
      [],
      ['rajesh@example.com', 'amit@example.com'],
      'Rajesh Patel'
    );
    expect(result![0].emails).toEqual(['rajesh@example.com']);
    expect(result![1].emails).toEqual(['amit@example.com']);
  });

  it('deduplicates repeated name lines rather than treating the same person as two representatives', () => {
    const lines = ['Rajesh Patel', 'Rajesh Patel', '9876543210'];
    const result = detectMultipleRepresentatives(lines, makeOcrLines(lines), [phone('9876543210')], [], 'Rajesh Patel');
    expect(result).toBeNull(); // only one unique person -> not a multi-representative card
  });
});

/**
 * Regression tests for a real QA finding (2026-09-10 USB device QA pass): a Title-Case
 * department/laboratory/product-line/organization line was being misclassified as an extra
 * "representative" alongside the one real person on the card. Reproduced on two real,
 * publicly-sourced business cards during that pass:
 *   - "NAMI NAMI / Kappo Dining / Shoichi Shiono / executive chef / ..." was split into two fake
 *     representatives, "Shoichi Shiono" and "Kappo Dining" (the restaurant's tagline).
 *   - A Hitachi card was split into three: "Hideaki Kido" (real), "Intelligent Sensing Systems
 *     Unit" (a department name), and "Hitachi Research Laboratory" (a lab name).
 *
 * Fixed in multiRepresentative.ts by (1) excluding anchor candidates that carry a
 * department-keyword or company-suffix-keyword word (the same dictionaries the primary
 * company/designation extractor already uses), and (2) for the narrow remaining case of exactly
 * two anchor candidates with no keyword signal at all, preferring whichever one sits immediately
 * next to a designation/department line in text order — mirroring the primary extractor's own
 * "name adjacent to its designation wins" rule — and treating the other as organizational context.
 */
describe('multi-representative false-positive fix — organization/department/product lines must not become fake representatives', () => {
  it('1. Organization + one person: the company name itself is never miscounted as a second representative', () => {
    const lines = ['ABC Industries', 'John Smith', 'Sales Manager', '9876543210', 'john@example.com'];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9876543210')],
      ['john@example.com'],
      'John Smith',
      'ABC Industries'
    );
    expect(result).toBeNull(); // single real person -> caller falls back to the flat fields
  });

  it('2. Department + one person: a department line ("Human Resources") is not counted as a second representative', () => {
    const lines = ['XYZ Corp', 'Human Resources', 'Priya Patel', '9876543210'];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9876543210')],
      [],
      'Priya Patel',
      'XYZ Corp'
    );
    expect(result).toBeNull();
  });

  it('3. Laboratory/research organization + one person: "Hitachi Research Laboratory" is not counted as a person (the exact real-card regression)', () => {
    const lines = ['Hitachi, Ltd.', 'Hitachi Research Laboratory', 'Hideaki Kido', '9876543210', 'hideaki@hitachi.com'];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9876543210')],
      ['hideaki@hitachi.com'],
      'Hideaki Kido',
      'Hitachi, Ltd.'
    );
    expect(result).toBeNull(); // was 3 fake representatives before the fix; must now be a single real person
  });

  it('4. Product-line/tagline name + one person: "Kappo Dining" (no keyword signal at all) is resolved via designation-adjacency, not counted as a person (the exact real-card regression)', () => {
    const lines = ['NAMI NAMI', 'Kappo Dining', 'Shoichi Shiono', 'executive chef', '6509646990'];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('6509646990')],
      [],
      'Shoichi Shiono',
      'NAMI NAMI'
    );
    expect(result).toBeNull(); // was 2 fake representatives ("Shoichi Shiono" + "Kappo Dining") before the fix
  });

  it('5. Two genuine representatives, no designation printed at all: both must still be detected (nothing dropped without evidence)', () => {
    const lines = ['Sunrise Traders', 'Ramesh Gupta', '9812345670', 'Suresh Mehta', '9823456780'];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9812345670'), phone('9823456780')],
      [],
      'Ramesh Gupta',
      'Sunrise Traders'
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.map((r) => r.name).sort()).toEqual(['Ramesh Gupta', 'Suresh Mehta']);
  });

  it('6. Two genuine representatives with ordinary Title-Case names and their own designations: both kept, not banned just for being Title-Case', () => {
    const lines = [
      'Global Engineering Pvt Ltd',
      'Rahul Kumar',
      'Sales Manager',
      '9876543210',
      'Amit Shah',
      'Purchase Manager',
      '9123456780',
    ];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9876543210'), phone('9123456780')],
      [],
      'Rahul Kumar',
      'Global Engineering Pvt Ltd'
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.map((r) => r.name)).toEqual(['Rahul Kumar', 'Amit Shah']);
  });

  it('7. An organization name that itself happens to look name-like is never turned into a fake representative', () => {
    const lines = ['KISHOR VARMA GROUP', 'Rakesh Sinha', '9876543210'];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9876543210')],
      [],
      'Rakesh Sinha',
      'KISHOR VARMA GROUP'
    );
    expect(result).toBeNull();
  });

  it('8. Company + department + two representatives: the department line is excluded while both real representatives (each with their own designation) are kept', () => {
    const lines = [
      'XYZ Corp',
      'Human Resources',
      'Rahul Kumar',
      'Sales Manager',
      '9876543210',
      'Amit Shah',
      'Purchase Manager',
      '9123456780',
    ];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('9876543210'), phone('9123456780')],
      [],
      'Rahul Kumar',
      'XYZ Corp'
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result!.map((r) => r.name)).toEqual(['Rahul Kumar', 'Amit Shah']);
    expect(result!.some((r) => r.name.toLowerCase().includes('human resources'))).toBe(false);
  });

  it('9. CRITICAL REGRESSION — Krish FURNITURE (Shaileshbhai/Niteshbhai) remains exactly two representatives with correctly separated phones after the fix', () => {
    const lines = ['Krish FURNITURE', 'Shaileshbhai', '9824921087', 'Niteshbhai', '9374969212'];
    const ocrLines = makeOcrLinesAt([
      { text: lines[0], y: 40 },
      { text: lines[1], y: 220 },
      { text: lines[2], y: 265 },
      { text: lines[3], y: 420 },
      { text: lines[4], y: 465 },
    ]);
    const result = detectMultipleRepresentatives(
      lines,
      ocrLines,
      [phone('9824921087'), phone('9374969212')],
      [],
      'Shaileshbhai',
      'Krish FURNITURE'
    );

    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const shailesh = result!.find((r) => r.name === 'Shaileshbhai');
    const nitesh = result!.find((r) => r.name === 'Niteshbhai');
    expect(shailesh).toBeDefined();
    expect(nitesh).toBeDefined();
    expect(shailesh!.phones.map((p) => p.raw)).toEqual(['9824921087']);
    expect(nitesh!.phones.map((p) => p.raw)).toEqual(['9374969212']);
    expect(shailesh!.phones.some((p) => p.raw === '9374969212')).toBe(false);
    expect(nitesh!.phones.some((p) => p.raw === '9824921087')).toBe(false);
    expect(result!.some((r) => r.name.toLowerCase().includes('furniture'))).toBe(false);
  });

  it('10. PHYSICAL-DEVICE REGRESSION — a mobile shop\'s product/service lines ("Cover House", "Touch Glass") do not become fake representatives alongside the real proprietor', () => {
    const lines = [
      'Mahendra Modi',
      '023298136 M-8122174912',
      'Hardware',
      'Mahi Mobile',
      'Cover House',
      'All Kind Of Mobile',
      'Accessories & Reparing',
      'Softwear',
      'Touch Glass',
      'Samsung',
      'OnePlus',
    ];
    const result = detectMultipleRepresentatives(
      lines,
      makeOcrLines(lines),
      [phone('8122174912')],
      [],
      'Mahendra Modi',
      'Mahi Mobile'
    );
    // Only one real person on this card — "Cover House" and "Touch Glass" (product/service lines)
    // must not survive as anchors, so this collapses to null (caller falls back to flat fields).
    expect(result).toBeNull();
  });

  it('11. Three anchors with EACH having real corroborating evidence are all kept (not collapsed just for being 3+)', () => {
    // Mirrors the project's own "third proprietor, no phone of their own" QA scenario — must not
    // regress just because the new 3+-anchor threshold was added for the Mahi Mobile fix.
    const lines = ['Krish FURNITURE', 'Shaileshbhai', '9824921087', 'Niteshbhai', '9374969212', 'Bhargav'];
    const ocrLines = makeOcrLinesAt([
      { text: lines[0], y: 40 },
      { text: lines[1], y: 220 },
      { text: lines[2], y: 265 },
      { text: lines[3], y: 420 },
      { text: lines[4], y: 465 },
      { text: lines[5], y: 620 },
    ]);
    const result = detectMultipleRepresentatives(
      lines,
      ocrLines,
      [phone('9824921087'), phone('9374969212')],
      [],
      'Shaileshbhai',
      'Krish FURNITURE'
    );
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    expect(result!.map((r) => r.name).sort()).toEqual(['Bhargav', 'Niteshbhai', 'Shaileshbhai']);
    const bhargav = result!.find((r) => r.name === 'Bhargav');
    expect(bhargav!.phones).toHaveLength(0); // nothing invented for the person with no printed number
  });
});
