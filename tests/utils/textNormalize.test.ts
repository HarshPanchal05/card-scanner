import { normalizeCompanyName, normalizePersonName, normalizePhone, normalizeEmail } from '../../src/utils/textNormalize';

describe('normalizeCompanyName', () => {
  it('strips legal suffixes and punctuation so name variants match', () => {
    expect(normalizeCompanyName('ABC Engineering Pvt. Ltd.')).toBe(normalizeCompanyName('ABC Engineering'));
  });

  it('is case-insensitive', () => {
    expect(normalizeCompanyName('Acme Industries')).toBe(normalizeCompanyName('ACME INDUSTRIES'));
  });
});

describe('normalizePersonName', () => {
  it('strips salutations', () => {
    expect(normalizePersonName('Mr. Rajesh Patel')).toBe(normalizePersonName('Rajesh Patel'));
  });
});

describe('normalizePhone', () => {
  it('reduces formatted numbers to digits only', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhone('(079) 2312-3456')).toBe('07923123456');
  });

  it('produces the same key for the same number formatted differently', () => {
    expect(normalizePhone('98765-43210')).toBe(normalizePhone('98765 43210'));
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Rajesh@ABC.com  ')).toBe('rajesh@abc.com');
  });
});
