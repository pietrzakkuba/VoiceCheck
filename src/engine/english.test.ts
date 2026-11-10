import { describe, expect, it } from 'vitest';
import { numberToWordsEn, numericTokenToWordsEn } from './numbersEn';
import { normalizeWords } from './normalize';
import { countSyllables, countTextSyllables } from './syllables';

describe('English numbers', () => {
  it.each([
    [0, 'zero'],
    [7, 'seven'],
    [21, 'twenty one'],
    [105, 'one hundred and five'],
    [2024, 'two thousand twenty four'],
  ])('spells %i', (n, words) => {
    expect(numberToWordsEn(n).join(' ')).toBe(words);
  });

  it('ignores non-numeric tokens', () => {
    expect(numericTokenToWordsEn('abc')).toBeNull();
  });
});

describe('English normalization', () => {
  it('lowercases, strips punctuation and spells numbers', () => {
    const words = normalizeWords('Hello, World! We have 3 cats.', 'en');
    expect(words).toEqual(expect.arrayContaining(['hello', 'world', 'three', 'cats']));
    expect(words.join(' ')).not.toMatch(/[,.!3]/);
  });
});

describe('English syllables', () => {
  it.each([
    ['cat', 1],
    ['make', 1],
    ['table', 2],
    ['water', 2],
    ['beautiful', 3],
    ['presentation', 4],
  ])('%s has %i syllables', (word, n) => {
    expect(countSyllables(word, 'en')).toBe(n);
  });

  it('counts at least one syllable per word', () => {
    expect(countTextSyllables(['a', 'rhythm', 'by'], 'en')).toBeGreaterThanOrEqual(3);
  });

  it('keeps Polish counting as the default', () => {
    expect(countSyllables('prezentacja')).toBe(4);
  });
});
