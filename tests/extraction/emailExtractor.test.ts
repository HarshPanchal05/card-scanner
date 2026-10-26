import { extractEmails } from '../../src/services/extraction/emailExtractor';

describe('extractEmails', () => {
  it('extracts a single email', () => {
    expect(extractEmails(['Email: rajesh@abcengineering.com'])).toEqual(['rajesh@abcengineering.com']);
  });

  it('extracts multiple distinct emails and lowercases them', () => {
    const lines = ['Sales@ABCEngineering.com', 'support@abcengineering.com'];
    const emails = extractEmails(lines);
    expect(emails).toContain('sales@abcengineering.com');
    expect(emails).toContain('support@abcengineering.com');
    expect(emails).toHaveLength(2);
  });

  it('ignores lines with no email', () => {
    expect(extractEmails(['ABC Engineering Pvt Ltd', '+91 98765 43210'])).toEqual([]);
  });

  it('strips trailing punctuation captured by OCR', () => {
    expect(extractEmails(['Contact: info@abc.com.'])).toEqual(['info@abc.com']);
  });
});
