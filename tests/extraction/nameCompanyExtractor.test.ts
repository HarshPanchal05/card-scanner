import { extractNameCompanyDesignation } from '../../src/services/extraction/nameCompanyExtractor';

describe('extractNameCompanyDesignation', () => {
  it('identifies company (with legal suffix), person, and designation on a typical card', () => {
    const lines = [
      'ABC Engineering Pvt Ltd',
      'Rajesh Patel',
      'Sales Manager',
      'Mob: +91 98765 43210',
      'rajesh@abcengineering.com',
    ];
    const result = extractNameCompanyDesignation(lines, [], ['rajesh@abcengineering.com'], null);
    expect(result.companyName).toContain('ABC Engineering');
    expect(result.personName).toBe('Rajesh Patel');
    expect(result.designation).toBe('Sales Manager');
  });

  it('falls back to a plausible company line when there is no legal suffix', () => {
    const lines = ['Acme Industrial Solutions', 'Amit Shah', 'Director', '9825012345'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).toBe('Acme Industrial Solutions');
    expect(result.designation).toBe('Director');
  });

  it('does not confuse an all-caps company line for a person name', () => {
    const lines = ['GLOBAL VALVES AND FITTINGS CO', 'Priya Mehta', 'Purchase Manager'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.personName).toBe('Priya Mehta');
    expect(result.companyName).toContain('GLOBAL VALVES');
  });

  it('extracts department from a designation line when present', () => {
    const lines = ['XYZ Industries', 'Suresh Kumar', 'Sales Executive'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.department).toBe('Sales');
  });

  it('regression: a decorative top-of-card phrase does not outrank the real ALL-CAPS company line', () => {
    // Real card found during device QA (a small furniture manufacturer). "Il Jay Mataj l" is a
    // garbled OCR read of a decorative blessing phrase commonly printed above the brand name on
    // Indian small-business cards — it must not win over "FURNITURE" just because it appears
    // earlier in the OCR line order.
    const lines = [
      'Il Jay Mataj l',
      'Shaileshbhai',
      'Niteshbhai',
      'Krish',
      'FURNITURE',
      'Manufacturer of all type of Furniture',
    ];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).not.toContain('Jay Mataj');
    expect(result.companyName).toContain('FURNITURE');
  });

  it('regression: a short brand word stacked directly above an ALL-CAPS business-type word is merged into one company name', () => {
    const lines = ['Krish', 'FURNITURE'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.companyName).toBe('Krish FURNITURE');
  });

  it('does not merge a preceding line into the company name when that line is itself designation-like', () => {
    const lines = ['Director', 'ELECTRONICS'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    // "Director" is claimed as the designation candidate, so it must not also get folded into
    // the company name merge.
    expect(result.designation).toBe('Director');
    expect(result.companyName).not.toContain('Director');
  });

  it('regression: a single informal (single-word) name is captured when no multi-word name exists on the card', () => {
    // "Shaileshbhai" (first name + the common Gujarati "-bhai"/brother honorific, no surname
    // given) is a realistic name on Indian small-business cards. Previously the 2-4-word
    // requirement meant such cards never produced a personName at all.
    const lines = ['Krish', 'FURNITURE', 'Shaileshbhai', 'Niteshbhai'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.personName).toBe('Shaileshbhai');
  });

  it('prefers a proper multi-word name over a single-word fallback when both exist', () => {
    const lines = ['ABC Traders', 'Rajesh Patel', 'Suresh'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    expect(result.personName).toBe('Rajesh Patel');
  });

  it('does not pick a single all-caps company-shaped word as a fallback single-word name', () => {
    const lines = ['FURNITURE', 'Ramesh'];
    const result = extractNameCompanyDesignation(lines, [], [], null);
    // "FURNITURE" is consumed as the company; only "Ramesh" remains eligible as a name.
    expect(result.personName).toBe('Ramesh');
  });
});
