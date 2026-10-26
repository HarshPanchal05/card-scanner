import { extractAddress } from '../../src/services/extraction/addressExtractor';

describe('extractAddress', () => {
  it('detects city, state, and country from a typical Indian address', () => {
    const lines = ['Plot No 12, GIDC Industrial Estate', 'Ahmedabad, Gujarat - 380015'];
    const result = extractAddress(lines);
    expect(result.city).toBe('Ahmedabad');
    expect(result.state).toBe('Gujarat');
    expect(result.country).toBe('India');
    expect(result.addressLine).toContain('GIDC Industrial Estate');
  });

  it('returns nulls and zero confidence when no address signals are present', () => {
    const result = extractAddress(['Rajesh Patel', 'Sales Manager']);
    expect(result.city).toBeNull();
    expect(result.state).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
