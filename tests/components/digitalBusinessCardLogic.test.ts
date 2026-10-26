import {
  resolveDisplayCompanyName,
  hasBackContent,
  backFaceFields,
  toRepresentativeDisplayFields,
} from '../../src/components/digitalBusinessCardLogic';

describe('resolveDisplayCompanyName', () => {
  it('renders the company name as-is when present', () => {
    expect(resolveDisplayCompanyName('ABC Industries')).toBe('ABC Industries');
  });

  it('falls back to a clear placeholder for null/empty/whitespace-only names', () => {
    expect(resolveDisplayCompanyName(null)).toBe('Unknown Company');
    expect(resolveDisplayCompanyName(undefined)).toBe('Unknown Company');
    expect(resolveDisplayCompanyName('   ')).toBe('Unknown Company');
  });
});

describe('hasBackContent / backFaceFields — missing fields are omitted, never shown blank', () => {
  it('no back content at all when category/address/website are all absent', () => {
    expect(hasBackContent({})).toBe(false);
    expect(backFaceFields({})).toEqual([]);
  });

  it('back content present when only category exists', () => {
    expect(hasBackContent({ categoryNames: ['Furniture'] })).toBe(true);
    expect(backFaceFields({ categoryNames: ['Furniture'] })).toEqual([{ kind: 'category', names: ['Furniture'] }]);
  });

  it('back content present when only website exists', () => {
    expect(hasBackContent({ website: 'abc.com' })).toBe(true);
    expect(backFaceFields({ website: 'abc.com' })).toEqual([{ kind: 'website', value: 'abc.com' }]);
  });

  it('back content present when only address exists', () => {
    expect(hasBackContent({ addressLine: 'Ahmedabad, Gujarat' })).toBe(true);
    expect(backFaceFields({ addressLine: 'Ahmedabad, Gujarat' })).toEqual([{ kind: 'address', value: 'Ahmedabad, Gujarat' }]);
  });

  it('an empty category array does not count as back content', () => {
    expect(hasBackContent({ categoryNames: [] })).toBe(false);
    expect(backFaceFields({ categoryNames: [] })).toEqual([]);
  });

  it('every present field appears, in category -> website -> address order, with nothing extra', () => {
    const fields = backFaceFields({
      categoryNames: ['Furniture Manufacturing'],
      website: 'www.abcindustries.com',
      addressLine: 'Ahmedabad, Gujarat',
    });
    expect(fields).toEqual([
      { kind: 'category', names: ['Furniture Manufacturing'] },
      { kind: 'website', value: 'www.abcindustries.com' },
      { kind: 'address', value: 'Ahmedabad, Gujarat' },
    ]);
  });
});

describe('toRepresentativeDisplayFields — representatives are never merged', () => {
  it('passes through one output entry per input entry, unmerged, each keeping its own data', () => {
    const result = toRepresentativeDisplayFields([
      { id: 'r1', name: 'Rahul Sharma', designation: 'Sales Manager', phones: ['+91 1111111111'], emails: ['rahul@example.com'] },
      { id: 'r2', name: 'Amit Patel', designation: 'Director', phones: ['+91 2222222222'], emails: ['amit@example.com'] },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'r1',
      name: 'Rahul Sharma',
      designation: 'Sales Manager',
      phones: ['+91 1111111111'],
      emails: ['rahul@example.com'],
    });
    expect(result[1]).toEqual({
      id: 'r2',
      name: 'Amit Patel',
      designation: 'Director',
      phones: ['+91 2222222222'],
      emails: ['amit@example.com'],
    });
    // Neither representative's phone/email leaked into the other's list.
    expect(result[0].phones).not.toEqual(expect.arrayContaining(['+91 2222222222']));
    expect(result[1].phones).not.toEqual(expect.arrayContaining(['+91 1111111111']));
  });

  it('an empty representatives array stays empty (a company-only card, no representative recorded)', () => {
    expect(toRepresentativeDisplayFields([])).toEqual([]);
  });

  it('a missing designation becomes null, not an empty string or "undefined"', () => {
    const result = toRepresentativeDisplayFields([{ id: 'r1', name: 'Solo Person' }]);
    expect(result[0].designation).toBeNull();
    expect(result[0].phones).toEqual([]);
    expect(result[0].emails).toEqual([]);
  });

  it('a whitespace-only designation is treated as missing', () => {
    const result = toRepresentativeDisplayFields([{ id: 'r1', name: 'Solo Person', designation: '   ' }]);
    expect(result[0].designation).toBeNull();
  });

  it('multiple phone numbers for one representative all survive, in order', () => {
    const result = toRepresentativeDisplayFields([
      { id: 'r1', name: 'Multi Phone Person', phones: ['+91 1111111111', '+91 2222222222', '+91 3333333333'] },
    ]);
    expect(result[0].phones).toEqual(['+91 1111111111', '+91 2222222222', '+91 3333333333']);
  });
});
