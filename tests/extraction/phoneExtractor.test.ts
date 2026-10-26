import { extractPhones } from '../../src/services/extraction/phoneExtractor';

describe('extractPhones', () => {
  it('extracts multiple numbers from a multi-line card', () => {
    const lines = [
      'ABC Engineering Pvt Ltd',
      'Rajesh Patel, Sales Manager',
      'Mob: +91 98765 43210',
      'Office: 079-2312 3456',
      'Fax: 079-2312 3457',
    ];
    const phones = extractPhones(lines);
    expect(phones).toHaveLength(3);
    expect(phones.map((p) => p.kind).sort()).toEqual(['fax', 'mobile', 'office'].sort());
  });

  it('deduplicates the same number appearing on both sides of the card', () => {
    const lines = ['Call us: 9876543210', 'Also reach us at 9876543210'];
    const phones = extractPhones(lines);
    expect(phones).toHaveLength(1);
  });

  it('classifies a bare 10-digit number as mobile by default', () => {
    const phones = extractPhones(['9825012345']);
    expect(phones[0].kind).toBe('mobile');
  });

  it('ignores a 6-digit PIN code', () => {
    const phones = extractPhones(['Ahmedabad - 380015']);
    expect(phones).toHaveLength(0);
  });

  it('handles three or more numbers on one card without dropping any', () => {
    const lines = ['Mobile: 9876543210', 'Mobile 2: 9825098250', 'WhatsApp: 9998887770', 'Tel: 022-67890123'];
    const phones = extractPhones(lines);
    expect(phones.length).toBeGreaterThanOrEqual(4);
  });
});
