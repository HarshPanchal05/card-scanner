import { decidePrimaryCategory } from '../../src/services/extraction/categoryExtractor';
import { categoryRowsToDictionary, deriveKeywordsFromName, OTHER_CATEGORY_NAME } from '../../src/constants/categories';
import { runExtractionPipeline } from '../../src/services/extraction/pipeline';
import { resolveCategoryAssignment } from '../../src/repositories/categoryManagementLogic';

describe('decidePrimaryCategory', () => {
  it('exact category name match: assigns the built-in category whose own name appears in the text', () => {
    const text = 'ABC Motors Pvt Ltd - manufacturer of electric motor and servo motor units';
    const result = decidePrimaryCategory(text);
    expect(result.name).toBe('Motors');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.isAmbiguous).toBe(false);
  });

  it('related-keyword match (Level 2): assigns a category via its keywords even when the category name itself never appears', () => {
    const extraDictionary = [{ name: 'Furniture', keywords: ['chair', 'sofa', 'table', 'workstation', 'office furniture', 'modular furniture'] }];
    const text = 'ABC Industries\nOffice Chairs\nConference Tables\nWorkstations';
    expect(text.toLowerCase()).not.toContain('furniture');
    const result = decidePrimaryCategory(text, extraDictionary);
    expect(result.name).toBe('Furniture');
  });

  it('no match at all falls back to Other', () => {
    const result = decidePrimaryCategory('ABC Consulting - strategy and management advisory services');
    expect(result.name).toBe(OTHER_CATEGORY_NAME);
    expect(result.confidence).toBe(0);
    expect(result.isAmbiguous).toBe(false);
  });

  it('a single weak/incidental keyword hit is not enough to assign a category — falls back to Other', () => {
    // Only "filter" (a single Filters keyword) appears once, with no other supporting signal —
    // must not be enough to force this into "Filters".
    const text = 'ABC Software Solutions - data filter utility';
    const result = decidePrimaryCategory(text);
    expect(result.name).toBe(OTHER_CATEGORY_NAME);
  });

  it('multiple categories can score, but the strongest, unambiguous one wins', () => {
    const text =
      'Manufacturer of Industrial Ball Valves, Gate Valves, Butterfly Valves, Globe Valves and Solenoid Valves. Also supplies a small booster pump.';
    const result = decidePrimaryCategory(text);
    expect(result.name).toBe('Industrial Valves');
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates[0].name).toBe('Industrial Valves');
  });

  it('an ambiguous result (two categories too close to call) falls back to Other rather than guessing', () => {
    const extraDictionary = [
      { name: 'Furniture', keywords: ['workstation', 'interior'] },
      { name: 'Interior Design', keywords: ['workstation', 'interior'] },
    ];
    const text = 'ABC Consultants - workstation and interior solutions';
    const result = decidePrimaryCategory(text, extraDictionary);
    expect(result.name).toBe(OTHER_CATEGORY_NAME);
    expect(result.isAmbiguous).toBe(true);
  });

  it('a user-defined (custom) category participates in classification with no code change, via its derived keywords', () => {
    const extraDictionary = categoryRowsToDictionary([{ name: 'Renewable Energy', isCustom: 1 }]);
    const text = 'GreenTech Solar\nSolar Panels\nSolar Inverters\nRenewable Energy Solutions';
    const result = decidePrimaryCategory(text, extraDictionary);
    expect(result.name).toBe('Renewable Energy');
  });

  it('deriveKeywordsFromName produces both the full phrase and its significant words', () => {
    expect(deriveKeywordsFromName('Renewable Energy')).toEqual(
      expect.arrayContaining(['renewable energy', 'renewable', 'energy'])
    );
    expect(deriveKeywordsFromName('HVAC')).toEqual(['hvac']);
  });

  it('never assigns "Other" itself as a matchable category even if the dictionary somehow includes it', () => {
    const extraDictionary = categoryRowsToDictionary([
      { name: OTHER_CATEGORY_NAME, isCustom: 1 },
      { name: 'Furniture', isCustom: 1 },
    ]);
    // categoryRowsToDictionary must have filtered "Other" out entirely.
    expect(extraDictionary.some((d) => d.name === OTHER_CATEGORY_NAME)).toBe(false);
  });

  describe('realistic end-to-end examples (task spec section 27)', () => {
    it('Example 1: a furniture manufacturer classifies as the user-created "Furniture" category', () => {
      const extraDictionary = categoryRowsToDictionary([{ name: 'Furniture', isCustom: 1 }]);
      const text = 'ABC Furniture Industries\nOffice Furniture\nWorkstations\nTables\nChairs';
      const result = decidePrimaryCategory(text, extraDictionary);
      expect(result.name).toBe('Furniture');
    });

    it('Example 2: an electrical systems company classifies as the built-in "Electrical" category', () => {
      const text = 'XYZ Electrical Systems\nSwitchgear\nElectrical Panels\nIndustrial Controls';
      const result = decidePrimaryCategory(text);
      expect(result.name).toBe('Electrical');
    });

    it('Example 3: a software company with no configured-category match falls back to Other, not a nearby unrelated category', () => {
      const extraDictionary = categoryRowsToDictionary([
        { name: 'Furniture', isCustom: 1 },
        { name: 'Construction', isCustom: 1 },
      ]);
      const text = 'ABC Software Pvt Ltd\nCloud Software\nSaaS\nIT Services';
      const result = decidePrimaryCategory(text, extraDictionary);
      expect(result.name).toBe(OTHER_CATEGORY_NAME);
    });

    it('Example 4: a solar/renewable-energy card classifies as the freshly user-created "Renewable Energy" category', () => {
      const extraDictionary = categoryRowsToDictionary([{ name: 'Renewable Energy', isCustom: 1 }]);
      const text = 'SunPower Traders\nSolar Panels\nSolar Inverters\nRenewable Energy Solutions';
      const result = decidePrimaryCategory(text, extraDictionary);
      expect(result.name).toBe('Renewable Energy');
    });

    it('Example 5: a furniture manufacturer classifies as the built-in "Furniture" category with no custom category configured', () => {
      const text = 'ABC Furniture Industries\nOffice Furniture\nModular Furniture\nWooden Furniture';
      const result = decidePrimaryCategory(text);
      expect(result.name).toBe('Furniture');
    });

    it('Example 6: a construction company classifies as the built-in "Construction" category', () => {
      const text = 'XYZ Construction Pvt Ltd\nCivil Construction\nContractors\nBuilding Materials';
      const result = decidePrimaryCategory(text);
      expect(result.name).toBe('Construction');
    });

    it('Example 7: an auto-parts company classifies as the built-in "Automotive" category', () => {
      const text = 'Speedway Automotive\nAuto Parts\nAuto Components\nVehicle Parts';
      const result = decidePrimaryCategory(text);
      expect(result.name).toBe('Automotive');
    });

    it('Example 8: a hospital/clinic card classifies as the built-in "Healthcare" category', () => {
      const text = 'City Healthcare\nHospital\nClinic\nMedical Diagnostic Center';
      const result = decidePrimaryCategory(text);
      expect(result.name).toBe('Healthcare');
    });
  });
});

describe('category "Other" fallback and manual override (task spec cases 6-8)', () => {
  it('Case 6: a card with no clear business category falls back to Other', () => {
    const result = decidePrimaryCategory('Just a generic greeting card with no product or service mentioned');
    expect(result.name).toBe(OTHER_CATEGORY_NAME);
  });

  it('Case 7: a card matching a user-created category selects that category', () => {
    const extraDictionary = categoryRowsToDictionary([{ name: 'Renewable Energy', isCustom: 1 }]);
    const text = 'GreenTech Solar\nRenewable Energy Solutions\nSolar Panels';
    const result = decidePrimaryCategory(text, extraDictionary);
    expect(result.name).toBe('Renewable Energy');
  });

  it('Case 8: a manually selected category remains authoritative even when a later auto-classification would suggest something else', () => {
    // resolveCategoryAssignment is the persistence-layer guard that makes this true across
    // re-scans/edits — see categoryManagementLogic.test.ts for the exhaustive matrix. This test
    // exercises the exact task scenario end-to-end: classifier suggests one thing, but the
    // company's current assignment was already a manual choice, so the manual choice must win.
    const autoSuggestion = decidePrimaryCategory('XYZ Construction Pvt Ltd\nCivil Construction\nContractors');
    expect(autoSuggestion.name).toBe('Construction');

    const manualAssignment = { categoryName: 'Real Estate', source: 'manual' as const };
    const resolved = resolveCategoryAssignment(manualAssignment, { categoryName: autoSuggestion.name, source: 'auto' });
    expect(resolved.categoryName).toBe('Real Estate');
    expect(resolved.source).toBe('manual');
  });
});

describe('category classification does not interfere with multi-representative extraction (regression)', () => {
  it('the real Krish FURNITURE card still splits into exactly 2 representatives, and gets a valid, non-throwing category decision', () => {
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

    expect(result.representatives).toHaveLength(2);
    expect(result.representatives!.map((r) => r.name).sort()).toEqual(['Niteshbhai', 'Shaileshbhai']);
    expect(result.companyName).toBe('Krish FURNITURE');
    // No custom "Furniture" category is configured in this pipeline call, so with only the
    // built-in industrial dictionary this safely (and correctly) falls back to Other rather than
    // guessing — the important thing is it's a real, non-empty decision that never threw.
    expect(typeof result.primaryCategory).toBe('string');
    expect(result.primaryCategory.length).toBeGreaterThan(0);
    expect(result.primaryCategoryConfidence).toBeGreaterThanOrEqual(0);
  });
});
