import { extractWebsite } from '../../src/services/extraction/websiteExtractor';

describe('extractWebsite', () => {
  it('prefers a www.-prefixed url', () => {
    const website = extractWebsite(['Visit us at www.abcengineering.com for more info'], []);
    expect(website).toBe('www.abcengineering.com');
  });

  it('falls back to a bare domain when no www. prefix exists', () => {
    const website = extractWebsite(['abcengineering.com'], []);
    expect(website).toBe('abcengineering.com');
  });

  it('does not mistake an email domain for the website', () => {
    const website = extractWebsite(['rajesh@abcengineering.com'], ['rajesh@abcengineering.com']);
    expect(website).toBeNull();
  });

  it('returns null when nothing looks like a website', () => {
    expect(extractWebsite(['Rajesh Patel', 'Sales Manager'], [])).toBeNull();
  });
});
