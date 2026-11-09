import { describe, expect, it } from 'vitest';
import { numberToWords, numericTokenToWords } from './numbersPl';
import { normalizeText } from './normalize';
import { countSyllables } from './syllables';

describe('numbersPl', () => {
  it('converts cardinals', () => {
    expect(numberToWords(0)).toEqual(['zero']);
    expect(numberToWords(15)).toEqual(['piętnaście']);
    expect(numberToWords(42)).toEqual(['czterdzieści', 'dwa']);
    expect(numberToWords(1000)).toEqual(['tysiąc']);
    expect(numberToWords(2024)).toEqual(['dwa', 'tysiące', 'dwadzieścia', 'cztery']);
    expect(numberToWords(5000)).toEqual(['pięć', 'tysięcy']);
    expect(numberToWords(12000)).toEqual(['dwanaście', 'tysięcy']);
    expect(numberToWords(22000)).toEqual(['dwadzieścia', 'dwa', 'tysiące']);
    expect(numberToWords(1_000_001)).toEqual(['milion', 'jeden']);
  });
  it('handles decimals', () => {
    expect(numericTokenToWords('3,5')).toEqual(['trzy', 'przecinek', 'pięć']);
    expect(numericTokenToWords('abc')).toBeNull();
  });
});

describe('normalizeText', () => {
  it('lowercases, strips punctuation and keeps boundaries', () => {
    const t = normalizeText('Ala ma kota, a kot ma Alę. Koniec!');
    expect(t.map((x) => x.word)).toEqual(['ala', 'ma', 'kota', 'a', 'kot', 'ma', 'alę', 'koniec']);
    expect(t[2].boundary).toBe('comma');
    expect(t[6].boundary).toBe('sentence');
    expect(t[7].boundary).toBe('sentence');
  });
  it('converts numbers and marks them unscorable', () => {
    const t = normalizeText('Mam 25 lat.');
    expect(t.map((x) => x.word)).toEqual(['mam', 'dwadzieścia', 'pięć', 'lat']);
    expect(t[1].unscorable).toBe(true);
    expect(t[3].boundary).toBe('sentence');
  });
  it('marks foreign words unscorable', () => {
    const t = normalizeText('Wideo na YouTube i xero');
    expect(t.find((x) => x.word === 'xero')?.unscorable).toBe(true);
    expect(t.find((x) => x.word === 'wideo')?.unscorable).toBe(false);
  });
  it('expands abbreviations without ending the sentence', () => {
    const t = normalizeText('Owoce, np. jabłka.');
    expect(t.map((x) => x.word)).toEqual(['owoce', 'na', 'przykład', 'jabłka']);
    expect(t[2].boundary).toBeUndefined();
  });
});

describe('syllables', () => {
  it.each([
    ['ala', 2], ['pianino', 3], ['kiedy', 2], ['szczęście', 2], ['dzień', 1], ['nauka', 3],
    ['auto', 2], ['europa', 3], ['chrząszcz', 1], ['brzmi', 1], ['wziął', 1], ['pies', 1],
    ['konstantynopolitańczykowianeczka', 12],
  ])('%s → %i', (w, n) => {
    expect(countSyllables(w)).toBe(n);
  });
});
