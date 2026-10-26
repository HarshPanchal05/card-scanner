import { runExtractionPipeline } from '../../src/services/extraction/pipeline';
import type { OcrLine } from '../../src/types/extraction';

const SAMPLE_CARD_TEXT = `
ABC Engineering Pvt Ltd
Rajesh Patel
Sales Manager
Mob: +91 98765 43210
Office: 079-2312 3456
rajesh@abcengineering.com
www.abcengineering.com
Plot 12, GIDC Industrial Estate
Ahmedabad, Gujarat - 380015
Manufacturer of Industrial Valves and Pumps
`;

describe('runExtractionPipeline', () => {
  it('extracts a complete, coherent result from a realistic single-sided card', () => {
    const result = runExtractionPipeline(SAMPLE_CARD_TEXT);

    expect(result.companyName).toContain('ABC Engineering');
    expect(result.personName).toBe('Rajesh Patel');
    expect(result.designation).toBe('Sales Manager');
    expect(result.phones.length).toBeGreaterThanOrEqual(2);
    expect(result.emails).toContain('rajesh@abcengineering.com');
    expect(result.website).toBe('www.abcengineering.com');
    expect(result.city).toBe('Ahmedabad');
    expect(result.state).toBe('Gujarat');
    expect(result.categoryNames).toContain('Industrial Valves');
    expect(result.categoryNames).toContain('Pumps');
    expect(result.confidence.phones).toBeGreaterThan(0);
    expect(result.confidence.emails).toBeGreaterThan(0);
  });

  it('combines front and back text and drops duplicate lines between sides', () => {
    const front = 'ABC Engineering Pvt Ltd\nRajesh Patel\nSales Manager\n9876543210';
    const back = 'ABC Engineering Pvt Ltd\nISO 9001:2015 Certified\nPumps | Valves | Automation';
    const combined = `${front}\n\n${back}`;
    const result = runExtractionPipeline(combined);
    expect(result.companyName).toContain('ABC Engineering');
    expect(result.categoryNames.length).toBeGreaterThan(0);
  });

  it('never throws on empty OCR text and returns an empty-but-valid result', () => {
    const result = runExtractionPipeline('');
    expect(result.companyName).toBeNull();
    expect(result.personName).toBeNull();
    expect(result.phones).toEqual([]);
    expect(result.emails).toEqual([]);
    expect(result.categoryNames).toEqual(['Other']);
  });

  it('handles a card with no phone number gracefully', () => {
    const result = runExtractionPipeline('XYZ Traders\nAnita Desai\nProprietor\nanita@xyztraders.com');
    expect(result.phones).toEqual([]);
    expect(result.personName).toBe('Anita Desai');
  });

  it('regression: real device-QA capture of a small furniture manufacturer card extracts correctly end-to-end', () => {
    // Exact raw OCR text captured from a real physical card during on-device QA (CARD-000001).
    // Originally misextracted: companyName came out as "Il Jay Mataj l" (a garbled decorative
    // blessing phrase near the top of the card) instead of the actual business name, and
    // personName came out null because the card lists proprietors by single informal names
    // ("Shaileshbhai"/"Niteshbhai") rather than a first+last pair. See nameCompanyExtractor.ts.
    const realCapturedOcrText = `Mo. 9824921087
Mo. 9374969212
Il Jay Mataj l
Shaileshbhai
Niteshbhai
Krish
FURNITURE
Manufacturer of all type of Furniture
AI91, Pratik Tenament, India Colony, Bapunagar, Ahmecabad.`;

    const result = runExtractionPipeline(realCapturedOcrText);

    expect(result.companyName).toBe('Krish FURNITURE');
    expect(result.companyName).not.toContain('Jay Mataj');
    expect(result.personName).toBe('Shaileshbhai');
    expect(result.phones.map((p) => p.raw)).toEqual(
      expect.arrayContaining([expect.stringContaining('9824921087'), expect.stringContaining('9374969212')])
    );
    expect(result.addressLine).toContain('Ahmecabad');
  });

  it('regression: a second, differently-ordered OCR capture of the same real card still extracts correctly', () => {
    // A second physical capture of the exact same furniture-manufacturer card (different angle/
    // lighting), captured during the same device QA session, with ML Kit segmenting lines
    // differently: the address split across two lines instead of one, the two proprietor names in
    // reversed order, and extra OCR garbage ("SISS", "SOSOLE9r"). This originally regressed a
    // *different* way than the first capture: personName came out as "Bapunagar, Ahmedabad." (an
    // address fragment that happens to match the 2-word Title-Case name shape) instead of either
    // proprietor's name, because that multi-word false-positive pre-empted the correct single-word
    // fallback where "Niteshbhai"/"Shaileshbhai" actually live.
    const secondCaptureOcrText = `A/91, Pratik Tenament, lndia Colony,
Bapunagar, Ahmedabad.
Manufacturer of all type of Furniture
Krish
FURNITURE
Mo. 9374969212
Mo. 9824921087
Il Jay Mataji Il
Niteshbhai
Shaileshbhai
SISS
SOSOLE9r`;

    const result = runExtractionPipeline(secondCaptureOcrText);

    expect(result.companyName).toBe('Krish FURNITURE');
    expect(result.personName).not.toContain('Bapunagar');
    expect(result.personName).not.toContain('Ahmedabad');
    expect(result.personName).not.toContain('Jay Mataji');
    expect(['Niteshbhai', 'Shaileshbhai']).toContain(result.personName);
    expect(result.phones.map((p) => p.raw)).toEqual(
      expect.arrayContaining([expect.stringContaining('9824921087'), expect.stringContaining('9374969212')])
    );
  });

  it('regression: the real Krish FURNITURE capture above splits into exactly the two real proprietors end-to-end, with no fake representative from the company name or garbled OCR noise', () => {
    // Same exact real device-captured text as the "small furniture manufacturer" test above —
    // reused here specifically to check the `representatives` field, which that earlier test
    // (written before multi-representative detection existed) does not.
    const realCapturedOcrText = `Mo. 9824921087
Mo. 9374969212
Il Jay Mataj l
Shaileshbhai
Niteshbhai
Krish
FURNITURE
Manufacturer of all type of Furniture
AI91, Pratik Tenament, India Colony, Bapunagar, Ahmecabad.`;

    const result = runExtractionPipeline(realCapturedOcrText);

    expect(result.representatives).not.toBeNull();
    expect(result.representatives).toHaveLength(2);
    expect(result.representatives!.map((r) => r.name).sort()).toEqual(['Niteshbhai', 'Shaileshbhai']);
    // Neither the company name nor the garbled decorative line became a fake representative.
    expect(result.representatives!.some((r) => /furniture|krish|mataj/i.test(r.name))).toBe(false);
    expect(result.companyName).toBe('Krish FURNITURE');
  });

  it('regression (QA fix, 2026-09-10): a Title-Case department/lab line is not miscounted as a second representative, end-to-end', () => {
    // Real card content and line order (Hitachi) that was previously split into fake
    // representatives alongside "Hideaki Kido" (real) — "Hitachi Research Laboratory" here, and
    // (separately, see the unit-level test above) "Intelligent Sensing Systems Unit".
    const ocrText = `Hideaki Kido
Hitachi Research Laboratory
Hitachi, Ltd.
81 294 52 5111
hideaki.kido.fx@hitachi.com`;
    const result = runExtractionPipeline(ocrText);

    expect(result.representatives).toBeNull(); // single real person -> flat fields only
    expect(result.personName).toBe('Hideaki Kido');
    expect(result.companyName).toContain('Hitachi');
  });

  it('regression (QA fix, 2026-09-10): a product-line/tagline line with no keyword signal is resolved via designation-adjacency, end-to-end', () => {
    // Real card content (Nami Nami restaurant) that was previously split into 2 fake
    // representatives: "Shoichi Shiono" (real) and "Kappo Dining" (the restaurant's tagline).
    const ocrLines: OcrLine[] = [
      { text: 'NAMI NAMI', frame: { x: 0, y: 0, width: 400, height: 40 }, side: 'front' },
      { text: 'Kappo Dining', frame: { x: 0, y: 50, width: 400, height: 40 }, side: 'front' },
      { text: 'Shoichi Shiono', frame: { x: 0, y: 200, width: 400, height: 40 }, side: 'front' },
      { text: 'executive chef', frame: { x: 0, y: 245, width: 400, height: 35 }, side: 'front' },
      { text: '650-964-6990', frame: { x: 0, y: 300, width: 400, height: 35 }, side: 'front' },
    ];
    const rawText = ocrLines.map((l) => l.text).join('\n');
    const result = runExtractionPipeline(rawText, [], ocrLines);

    expect(result.representatives).toBeNull(); // single real person -> flat fields only
    expect(result.personName).toBe('Shoichi Shiono');
    expect(result.companyName).toBe('NAMI NAMI');
  });
});
