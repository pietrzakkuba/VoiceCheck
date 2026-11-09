import { describe, expect, it } from 'vitest';
import { numberToWords, numericTokenToWords } from './numbersPl';
import { normalizeText, splitSentences } from './normalize';
import { countSyllables } from './syllables';
import { splitUnits, charEquivalents } from './units';
import { checkHallucination } from './hallucinations';

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
  it('splits sentences', () => {
    expect(splitSentences('Raz. Dwa? Trzy!')).toEqual(['Raz.', 'Dwa?', 'Trzy!']);
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

describe('units', () => {
  const texts = (w: string) => splitUnits(w).map((u) => u.text);
  it('handles digraphs', () => {
    expect(texts('szczęście')).toEqual(['sz', 'cz', 'ę', 'ś', 'ć', 'e']);
    expect(texts('rzeka')).toEqual(['rz', 'e', 'k', 'a']);
    expect(texts('chleb')).toEqual(['ch', 'l', 'e', 'b']);
    expect(texts('dżem')).toEqual(['dż', 'e', 'm']);
  });
  it('handles softening by i', () => {
    expect(texts('siano')).toEqual(['ś', 'a', 'n', 'o']);
    expect(texts('dziadek')).toEqual(['dź', 'a', 'd', 'e', 'k']);
    expect(texts('dzisiaj')).toEqual(['dź', 'i', 'ś', 'a', 'j']);
    expect(texts('ciocia')).toEqual(['ć', 'o', 'ć', 'a']);
    expect(texts('nie')).toEqual(['ń', 'e']);
    expect(texts('siwy')).toEqual(['ś', 'i', 'w', 'y']);
  });
  it('assigns categories', () => {
    const u = splitUnits('szczęście');
    expect(u.map((x) => x.category)).toEqual(['szumiace', 'szumiace', 'nosowe', 'ciszace', 'ciszace', 'samogloski']);
  });
  it('builds equivalence classes', () => {
    const w = 'rzeka';
    const u = splitUnits(w);
    expect(charEquivalents(w, u, 0).has('ż')).toBe(true);
    const w2 = 'idę';
    expect(charEquivalents(w2, splitUnits(w2), 2).has('e')).toBe(true);
    const w3 = 'wziął';
    expect(charEquivalents(w3, splitUnits(w3), 3).has('o')).toBe(true);
    const w4 = 'chleb';
    const u4 = splitUnits(w4);
    expect(u4[u4.length - 1].relaxed).toBe(true);
    expect(charEquivalents(w4, u4, 4).has('p')).toBe(true);
    const w5 = 'góra';
    expect(charEquivalents(w5, splitUnits(w5), 1).has('u')).toBe(true);
  });
});

describe('hallucinations', () => {
  it('rejects known phrases', () => {
    expect(checkHallucination('Napisy stworzone przez społeczność Amara.org', null).rejected).toBe(true);
    expect(checkHallucination('Dziękuję za uwagę.', 5).rejected).toBe(true);
  });
  it('rejects repetition loops', () => {
    expect(checkHallucination('to jest to jest to jest to jest', null).rejected).toBe(true);
  });
  it('rejects text with too many syllables', () => {
    expect(checkHallucination('to jest bardzo długie zdanie z wieloma sylabami', 3).rejected).toBe(true);
  });
  it('accepts normal text', () => {
    expect(checkHallucination('Dzień dobry, nazywam się Jan.', 9).rejected).toBe(false);
  });
});
