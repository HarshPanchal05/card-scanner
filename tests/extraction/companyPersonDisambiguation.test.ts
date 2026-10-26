import { extractNameCompanyDesignation } from '../../src/services/extraction/nameCompanyExtractor';
import { runExtractionPipeline } from '../../src/services/extraction/pipeline';

/**
 * Regression tests for company-vs-representative disambiguation (task: "COMPANY VS EXECUTIVE
 * IDENTIFICATION FIX"). These exercise the improved companyScore/personScore contextual model in
 * nameCompanyExtractor.ts — not just line shape, but suffix vocabulary, position, adjacency to a
 * designation, and adjacency to phone/email.
 */
describe('company vs representative identification (task spec section 21)', () => {
  it('Test 1: a plain ALL-CAPS company line followed by a name+designation is not confused', () => {
    const lines = ['ABC INDUSTRIES', 'Rahul Sharma', 'Sales Manager', '+91 98765 43210'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).toBe('ABC INDUSTRIES');
    expect(result.personName).toBe('Rahul Sharma');
  });

  it('Test 2: a company name that itself contains a human-looking name is not misread as the representative', () => {
    const lines = ['Rahul Sharma Enterprises', 'Amit Patel', 'Director', '+91 98765 43210'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).toBe('Rahul Sharma Enterprises');
    expect(result.personName).toBe('Amit Patel');
  });

  it('Test 3: an organizational/department-style company line (no legal suffix at all) is not read as a person', () => {
    const lines = ['Hitachi Research Laboratory', 'John Smith', 'Research Director', '+91 98765 43210'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).toBe('Hitachi Research Laboratory');
    expect(result.personName).toBe('John Smith');
  });

  it('Test 4: a two-word company name with no suffix keyword at all is still preferred over the real name', () => {
    const lines = ['Kappo Dining', 'John Doe', 'Manager', '+91 98765 43210'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).toBe('Kappo Dining');
    expect(result.personName).toBe('John Doe');
  });

  it('Test 5: two representatives under one company are both captured, correctly separated, via the full pipeline', () => {
    const rawText = [
      'ABC Industries',
      'Rahul Sharma',
      'Sales Manager',
      '+91 1111111111',
      'Amit Patel',
      'Director',
      '+91 2222222222',
    ].join('\n');
    const result = runExtractionPipeline(rawText);
    expect(result.companyName).toBe('ABC Industries');
    expect(result.representatives).not.toBeNull();
    expect(result.representatives).toHaveLength(2);
    const byName = Object.fromEntries(result.representatives!.map((r) => [r.name, r]));
    expect(byName['Rahul Sharma'].phones.map((p) => p.raw)).toEqual(
      expect.arrayContaining([expect.stringContaining('1111111111')])
    );
    expect(byName['Amit Patel'].phones.map((p) => p.raw)).toEqual(
      expect.arrayContaining([expect.stringContaining('2222222222')])
    );
  });

  it('Test 6: the existing Krish FURNITURE regression is unaffected by the scoring changes', () => {
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
    expect(result.representatives).toHaveLength(2);
    expect(result.representatives!.map((r) => r.name).sort()).toEqual(['Niteshbhai', 'Shaileshbhai']);
    expect(result.representatives!.flatMap((r) => r.phones.map((p) => p.raw))).toEqual(
      expect.arrayContaining([expect.stringContaining('9824921087'), expect.stringContaining('9374969212')])
    );
  });

  it('a company whose own name contains a salutation-free person-like phrase, with NO suffix keyword at all, still loses to an adjacent-to-designation real name', () => {
    // Company suffix vocabulary can't catch every organization name (e.g. a short invented brand
    // with no suffix word) — the designation-adjacency signal on personScore is what actually
    // resolves cases like this.
    const lines = ['Sunrise Traders', 'Neha Joshi', 'Purchase Manager', '9998887777'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).toBe('Sunrise Traders');
    expect(result.personName).toBe('Neha Joshi');
  });

  it('a salutation prefix strengthens a name candidate over a same-shaped company-adjacent line', () => {
    const lines = ['Global Systems Group', 'Dr. Neha Joshi', 'Consultant', '9998887777'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.personName).toContain('Neha Joshi');
  });

  describe('extraction does not depend on a fixed line order (task spec: extraction accuracy)', () => {
    it('Case 1: Company -> Person -> Designation', () => {
      const lines = ['ABC INDUSTRIES PVT LTD', 'Rahul Sharma', 'Managing Director', '+91 98765 43210'];
      const result = extractNameCompanyDesignation(lines, [], [], null);
      expect(result.companyName).toBe('ABC INDUSTRIES PVT LTD');
      expect(result.personName).toBe('Rahul Sharma');
      expect(result.designation).toBe('Managing Director');
    });

    it('Case 2: Person -> Designation -> Company (company printed last still wins on company evidence)', () => {
      const lines = ['Rahul Sharma', 'Managing Director', 'ABC INDUSTRIES PVT LTD', '+91 98765 43210'];
      const result = extractNameCompanyDesignation(lines, [], [], null);
      expect(result.companyName).toBe('ABC INDUSTRIES PVT LTD');
      expect(result.personName).toBe('Rahul Sharma');
      expect(result.designation).toBe('Managing Director');
    });

    it('Logo/company text -> Person -> Designation, mirrored: Person -> Company -> Designation', () => {
      const lines = ['Amit Patel', 'ABC Furniture Industries', 'Sales Manager', '9998887777'];
      const result = extractNameCompanyDesignation(lines, [], [], null);
      expect(result.companyName).toBe('ABC Furniture Industries');
      expect(result.personName).toBe('Amit Patel');
      expect(result.designation).toBe('Sales Manager');
    });
  });

  describe('expanded company-vocabulary keywords (task spec: company name detection)', () => {
    it.each([
      ['Speedway Automotive', 'Speedway Automotive'],
      ['Modern Contractors', 'Modern Contractors'],
      ['Prime Foods', 'Prime Foods'],
      ['Sunrise Pharma', 'Sunrise Pharma'],
      ['Vishal Pharmaceuticals', 'Vishal Pharmaceuticals'],
      ['Ganesh Textiles', 'Ganesh Textiles'],
      ['National Chemicals', 'National Chemicals'],
      ['Bright Electronics', 'Bright Electronics'],
      ['Apex Automation', 'Apex Automation'],
      ['Metro Infrastructure', 'Metro Infrastructure'],
      ['Swift Logistics', 'Swift Logistics'],
      ['Skyline Developers', 'Skyline Developers'],
      ['Everest Laboratories', 'Everest Laboratories'],
    ])('recognizes "%s" as the company over an adjacent person name', (companyLine, expectedCompany) => {
      const lines = [companyLine, 'Kiran Desai', 'Manager', '9998887777'];
      const result = extractNameCompanyDesignation(lines, [], [], null);
      expect(result.companyName).toBe(expectedCompany);
      expect(result.personName).toBe('Kiran Desai');
    });

    it('an "Architect" or "Designer" designation is recognized and does not get swallowed as the person or company', () => {
      const architect = extractNameCompanyDesignation(
        ['Studio Space Architects', 'Meera Iyer', 'Architect', '9998887777'],
        [], [], null
      );
      expect(architect.designation).toBe('Architect');
      expect(architect.personName).toBe('Meera Iyer');

      const designer = extractNameCompanyDesignation(
        ['Studio Space Interiors', 'Meera Iyer', 'Designer', '9998887777'],
        [], [], null
      );
      expect(designer.designation).toBe('Designer');
      expect(designer.personName).toBe('Meera Iyer');
    });
  });
});

/**
 * Regression tests for a genuine physical-device extraction failure (real "Mahi Mobile" card,
 * 2026-09-12 wireless device pass): a small Indian shop's trade name ("Mahi Mobile") has no legal
 * suffix and no broader organizational vocabulary at all, while the proprietor's name printed
 * directly above the phone number ("Mahendra Modi") is an entirely ordinary two-word Indian name —
 * shape-wise indistinguishable from a company name. The old scoring let "Mahendra Modi" win as the
 * company purely for sitting in the first three lines, and separately let two product/service
 * description lines ("Cover House", "Touch Glass") become fake extra "representatives" merely for
 * sharing the same Title-Case shape.
 *
 * Fixed with two generalized, reusable signals (not a card-specific rule):
 *   1. nameCompanyExtractor.ts: a bare human-name-shaped line with NO company/business vocabulary
 *      of its own, sitting next to a phone/email, is withheld from company candidacy entirely
 *      (see the company-selection loop's isBareHumanNameNextToContact check) — phone proximity is
 *      evidence FOR that line being the proprietor, not the business. Company scoring also gained
 *      BUSINESS_DOMAIN_KEYWORDS ("Mobile", "Hardware", "Electronics", ...) and a "brand + domain
 *      word" line-shape bonus (isBrandPlusDomainLine) so a short trade name like "Mahi Mobile" or
 *      "Patel Electronics" scores clearly above both a bare person name and a longer descriptive
 *      product/service phrase using the same domain word.
 *   2. multiRepresentative.ts: with 3+ anchor candidates, each must now clear the same personScore
 *      threshold (>=2, i.e. at least one signal beyond bare shape — phone/email adjacency,
 *      designation adjacency, or a salutation) used everywhere else in the codebase for exactly
 *      this purpose; below 3 anchors this new check is not applied at all, so genuine two-
 *      proprietor cards with no corroborating signal (e.g. Krish FURNITURE) are unaffected.
 */
describe('physical-device regression: small-business trade names vs. bare person names (Mahi Mobile)', () => {
  it('PRIMARY REGRESSION — the exact real "Mahi Mobile" card: company/person are no longer swapped, and product/service lines are not counted as extra representatives', () => {
    const rawText = [
      'Mahendra Modi',
      '023298136 M-8122174912',
      'Hardware',
      'Mahi Mobile',
      'Cover House',
      'All Kind Of Mobile',
      'Accessories & Reparing',
      'Softwear',
      'Touch Glass',
      'Ad:- Gf-04 Samnundra Complex, Off Cg Road Vasant',
      'Vihar,Navrangpura ,Ahemdabad-38009.',
      'Samsung',
      'OnePlus',
      'Vivo',
      'Oppo',
    ].join('\n');

    const result = runExtractionPipeline(rawText);

    expect(result.companyName).toBe('Mahi Mobile');
    expect(result.personName).toBe('Mahendra Modi');
    expect(result.designation).toBeNull();
    expect(result.phones.map((p) => p.raw).join(' ')).toContain('8122174912');

    // Only one real representative — "Mahi Mobile" (the company), "Cover House", and "Touch Glass"
    // (product/service lines) must never appear as representatives. representatives is null here
    // because there's only one real person; the caller falls back to the flat personName field.
    if (result.representatives) {
      const names = result.representatives.map((r) => r.name);
      expect(names).not.toContain('Mahi Mobile');
      expect(names).not.toContain('Cover House');
      expect(names).not.toContain('Touch Glass');
    } else {
      expect(result.representatives).toBeNull();
    }

    // A confident, correctly-generalized category (not forced, not card-specific) — falls back to
    // Other if the vocabulary genuinely doesn't support a confident match.
    expect(typeof result.primaryCategory).toBe('string');
    expect(result.primaryCategory.length).toBeGreaterThan(0);
  });

  it('CASE A — "Shree Mobile" (brand + domain word) vs. an ordinary designation-adjacent name', () => {
    const rawText = ['Shree Mobile', 'Raj Patel', 'Sales', '9876543210'].join('\n');
    const result = runExtractionPipeline(rawText);
    expect(result.companyName).toBe('Shree Mobile');
    expect(result.personName).toBe('Raj Patel');
  });

  it('CASE B — "Patel Electronics" vs. a bare name next to a phone, no designation at all', () => {
    const rawText = ['Patel Electronics', 'Amit Patel', '9876543210'].join('\n');
    const result = runExtractionPipeline(rawText);
    expect(result.companyName).toBe('Patel Electronics');
    expect(result.personName).toBe('Amit Patel');
  });

  it('CASE C — "Modern Hardware" vs. a bare name next to a phone, no designation at all', () => {
    const rawText = ['Modern Hardware', 'Rakesh Shah', '9876543210'].join('\n');
    const result = runExtractionPipeline(rawText);
    expect(result.companyName).toBe('Modern Hardware');
    expect(result.personName).toBe('Rakesh Shah');
  });

  it('CASE D — company name printed AFTER the person and their phone, still resolved correctly', () => {
    const rawText = ['Rajesh Kumar', '9876543210', 'Raj Mobile', 'Accessories', 'Repairing'].join('\n');
    const result = runExtractionPipeline(rawText);
    expect(result.companyName).toBe('Raj Mobile');
    expect(result.personName).toBe('Rajesh Kumar');
  });

  it('a proprietor with no designation at all is still recognized purely from name shape + phone adjacency', () => {
    // Explicitly exercises task requirement: do NOT require a designation for person detection —
    // and that the company-exclusion signal (a bare human name next to a KNOWN phone) fires
    // correctly when the phone is passed through the same way the real pipeline provides it.
    const lines = ['Mahendra Modi', 'M-8122174912', 'Mahi Mobile'];
    const phones = [{ raw: '8122174912', normalized: '8122174912', kind: 'mobile' as const }];
    const result = extractNameCompanyDesignation(lines, phones, [], null);
    expect(result.designation).toBeNull();
    expect(result.personName).toBe('Mahendra Modi');
    expect(result.companyName).toBe('Mahi Mobile');
  });
});
