import { classifyCategories, suggestCategoryNames } from '../../src/services/extraction/categoryExtractor';

describe('classifyCategories', () => {
  it('matches a card that mentions valves and pumps', () => {
    const text = 'ABC Engineering - Manufacturer of Industrial Ball Valves, Gate Valves and Centrifugal Pumps';
    const matches = classifyCategories(text);
    const names = matches.map((m) => m.name);
    expect(names).toContain('Industrial Valves');
    expect(names).toContain('Pumps');
  });

  it('ranks the category matching more distinct keywords higher', () => {
    // "Industrial Valves" matches 3 distinct keywords here (valve, ball valve, gate valve);
    // "Filters" matches only 1 (filter) — confidence is based on distinct keyword coverage,
    // not how many times a single keyword is repeated.
    const text = 'Manufacturer of ball valve, gate valve and general valve products, also filter';
    const matches = classifyCategories(text);
    expect(matches[0].name).toBe('Industrial Valves');
  });

  it('returns an empty list when nothing matches', () => {
    expect(classifyCategories('Just a random line of text with no product keywords')).toEqual([]);
  });
});

describe('suggestCategoryNames', () => {
  it('falls back to Other with zero confidence when nothing matches', () => {
    const result = suggestCategoryNames('Totally unrelated text');
    expect(result.names).toEqual(['Other']);
    expect(result.confidence).toBe(0);
  });

  it('suggests up to three categories with non-zero confidence when matched', () => {
    const result = suggestCategoryNames('Pumps, Motors, and Bearings supplier');
    expect(result.names.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
  });
});
