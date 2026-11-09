import type { UnitCategory } from '@/types';
import { VOWELS } from './syllables';

export interface Unit {
  /** Phonetic label shown to the user, e.g. 'ś' for spelled 'si'. */
  text: string;
  /** Spelling in the word. */
  spelled: string;
  start: number;
  end: number;
  category: UnitCategory;
  /** True when the unit is word-final (orthoepic exceptions apply). */
  final: boolean;
  /** Final obstruent devoicing applies – threshold is relaxed (5.6). */
  relaxed: boolean;
}

const SOFTENING: Record<string, string> = { s: 'ś', c: 'ć', z: 'ź', n: 'ń', dz: 'dź' };
const VOICED_TO_VOICELESS: Record<string, string> = {
  b: 'p', d: 't', g: 'k', w: 'f', z: 's', ź: 'ś', ż: 'sz', rz: 'sz', dz: 'c', dź: 'ć', dż: 'cz',
};
const VOICELESS_LETTERS = new Set(['p', 't', 'k', 'f', 's', 'ś', 'c', 'ć', 'h', 'ch', 'sz', 'cz']);

export function categoryOf(phonetic: string): UnitCategory {
  switch (phonetic) {
    case 'sz': case 'ż': case 'rz': case 'cz': case 'dż':
      return 'szumiace';
    case 's': case 'z': case 'c': case 'dz':
      return 'syczace';
    case 'ś': case 'ź': case 'ć': case 'dź': case 'ń':
      return 'ciszace';
    case 'ą': case 'ę':
      return 'nosowe';
    case 'l': case 'ł': case 'r': case 'm': case 'n': case 'j':
      return 'sonorne';
    case 'a': case 'e': case 'i': case 'o': case 'u': case 'ó': case 'y':
      return 'samogloski';
    default:
      return 'inne';
  }
}

/** Splits a normalised word into phonetic units (5.6). */
export function splitUnits(word: string): Unit[] {
  const c = [...word];
  const units: Unit[] = [];
  let i = 0;
  const push = (text: string, start: number, end: number, category?: UnitCategory) =>
    units.push({ text, spelled: c.slice(start, end).join(''), start, end, category: category ?? categoryOf(text), final: false, relaxed: false });

  while (i < c.length) {
    const a = c[i];
    const b = c[i + 1];
    const d = c[i + 2];
    const e = c[i + 3];

    if (a === 'd' && b === 'z' && d === 'i') {
      if (e && VOWELS.has(e)) push('dź', i, i + 3);
      else push('dź', i, i + 2);
      i += e && VOWELS.has(e) ? 3 : 2;
      continue;
    }
    if (a === 'd' && (b === 'ż' || b === 'ź' || b === 'z')) {
      push('d' + b, i, i + 2);
      i += 2;
      continue;
    }
    if ((a === 'c' || a === 's' || a === 'r') && (b === 'z' || (a === 'c' && b === 'h'))) {
      push(a + b, i, i + 2);
      i += 2;
      continue;
    }
    if (SOFTENING[a] && b === 'i') {
      if (d && VOWELS.has(d)) {
        push(SOFTENING[a], i, i + 2);
        i += 2;
      } else {
        push(SOFTENING[a], i, i + 1);
        i += 1;
      }
      continue;
    }
    if (a === 'i' && i > 0 && b && VOWELS.has(b) && !VOWELS.has(c[i - 1])) {
      // Palatalising "i" after other consonants (e.g. "pies") behaves like a glide.
      push('i', i, i + 1, 'sonorne');
      i += 1;
      continue;
    }
    push(a, i, i + 1);
    i += 1;
  }

  if (units.length) {
    const last = units[units.length - 1];
    last.final = true;
    if (VOICED_TO_VOICELESS[last.text]) last.relaxed = true;
    if (units.length > 1) units[units.length - 2].final = true;
  }
  return units;
}

/**
 * Letters that count as a correct realisation of the character at `charIdx` (5.6):
 * homophones rz≡ż, ch≡h, ó≡u, softening spellings, word-final ę≡e, ą/ę before l/ł, final devoicing, w→f after voiceless.
 */
export function charEquivalents(word: string, units: Unit[], charIdx: number): Set<string> {
  const c = [...word];
  const ch = c[charIdx];
  const eq = new Set<string>([ch]);
  const unit = units.find((u) => charIdx >= u.start && charIdx < u.end);
  if (!unit) return eq;

  if (unit.spelled === 'rz') eq.add('ż');
  if (unit.text === 'ż') eq.add('r');
  if (unit.spelled === 'ch') { eq.add('c'); eq.add('h'); }
  if (unit.text === 'h') eq.add('c');
  if (ch === 'ó') eq.add('u');
  if (ch === 'u') eq.add('ó');
  if (unit.text !== unit.spelled && ['ś', 'ć', 'ź', 'ń', 'dź'].includes(unit.text)) {
    eq.add(unit.text);
    if (ch === 'i') eq.add('j');
  }
  if (ch === 'ę' && charIdx === c.length - 1) eq.add('e');
  const next = c[charIdx + 1];
  if ((ch === 'ą' || ch === 'ę') && (next === 'l' || next === 'ł')) eq.add(ch === 'ą' ? 'o' : 'e');
  if (unit.relaxed && unit.end === c.length) {
    const vl = VOICED_TO_VOICELESS[unit.text];
    if (vl) for (const l of vl) eq.add(l);
  }
  if (ch === 'w' && charIdx > 0) {
    const prevUnit = units.find((u) => charIdx - 1 >= u.start && charIdx - 1 < u.end);
    if (prevUnit && VOICELESS_LETTERS.has(prevUnit.text)) eq.add('f');
  }
  return eq;
}

/** Diction pairs: confusions that are reported as substitutions (5.7). */
export const DICTION_PAIRS: Record<string, string[]> = {
  s: ['ś', 'sz'], ś: ['s', 'sz'], sz: ['s', 'ś'],
  z: ['ź', 'ż'], ź: ['z', 'ż'], ż: ['z', 'ź'], rz: ['z', 'ź'],
  c: ['ć', 'cz'], ć: ['c', 'cz'], cz: ['c', 'ć'],
  dz: ['dź', 'dż'], dź: ['dz', 'dż'], dż: ['dz', 'dź'],
  ł: ['l'], l: ['ł', 'r'], r: ['l'],
  ą: ['o', 'om'], ę: ['e', 'em'],
  n: ['ń'], ń: ['n'],
};

/** Maps a competitor letter emitted at a character inside `unit` to the phonetic label it suggests. */
export function competitorToPhone(unit: Unit, charOffset: number, competitor: string): string {
  if (unit.text === 'sz' && charOffset === 0 && competitor === 'ś') return 'ś';
  if (unit.text === 'cz' && charOffset === 0 && competitor === 'ć') return 'ć';
  if (unit.text === 'rz' && competitor === 'z') return 'z';
  if (unit.text === 'rz' && competitor === 'ź') return 'ź';
  return competitor;
}

export function isDictionPair(target: string, heard: string): boolean {
  const key = target === 'ż' ? 'ż' : target;
  return (DICTION_PAIRS[key] ?? []).includes(heard);
}

export const CATEGORY_LABELS: Record<UnitCategory, string> = {
  szumiace: 'szumiące (sz, ż/rz, cz, dż)',
  syczace: 'syczące (s, z, c, dz)',
  ciszace: 'ciszące (ś, ź, ć, dź, ń)',
  nosowe: 'nosowe (ą, ę)',
  sonorne: 'sonorne (l, ł, r, m, n, j)',
  samogloski: 'samogłoski',
  inne: 'pozostałe spółgłoski',
};
