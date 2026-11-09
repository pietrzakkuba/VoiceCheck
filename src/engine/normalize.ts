import { numericTokenToWords } from './numbersPl';

/** Polish letters (plus v/x, which signal foreign words). */
const POLISH_LETTERS = new Set('aąbcćdeęfghijklłmnńoóprsśtuvwxyzźż'.split(''));
/** Letters that signal foreign words (5.3). */
const FOREIGN_LETTERS = /[qvx]/;

const DIACRITIC_FOLD: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i',
  ô: 'o', ö: 'o', ò: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ý: 'y', ç: 'c', ñ: 'n', ß: 'ss', q: 'k',
};

const ABBREVIATIONS: Record<string, string[]> = {
  'np.': ['na', 'przykład'],
  'itd.': ['i', 'tak', 'dalej'],
  'itp.': ['i', 'tym', 'podobne'],
  'tzn.': ['to', 'znaczy'],
  'tj.': ['to', 'jest'],
  'm.in.': ['między', 'innymi'],
  'tzw.': ['tak', 'zwany'],
  'ok.': ['około'],
  'godz.': ['godzina'],
  'r.': ['rok'],
  'proc.': ['procent'],
  '%': ['procent'],
};

export interface NormToken {
  /** Lower-case Polish letters only. */
  word: string;
  /** Original surface form. */
  raw: string;
  boundary?: 'sentence' | 'comma';
  unscorable: boolean;
  fromNumber?: boolean;
}

const SENTENCE_END = /[.?!…]+$/;
const COMMA_END = /[,;:–—]+$/;

/** Normalises text into words with sentence/comma boundaries (5.3). */
export function normalizeText(text: string): NormToken[] {
  const out: NormToken[] = [];
  const cleaned = text
    .replace(/\u2026/g, '…')
    .replace(/[„”"«»()[\]{}]/g, ' ')
    .replace(/(\d)\s+(\d{3})\b/g, '$1$2')
    .replace(/([a-ząćęłńóśźż])-(?=[a-ząćęłńóśźż])/gi, '$1 ')
    .replace(/\s+[-–—]\s+/g, ', ');
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);

  for (const rawTok of rawTokens) {
    const lower = rawTok.toLowerCase();
    if (ABBREVIATIONS[lower]) {
      for (const w of ABBREVIATIONS[lower]) out.push({ word: w, raw: rawTok, unscorable: false });
      continue;
    }
    let boundary: NormToken['boundary'];
    if (SENTENCE_END.test(lower)) boundary = 'sentence';
    else if (COMMA_END.test(lower)) boundary = 'comma';
    const core = lower.replace(/^[^\p{L}\p{N}%]+|[^\p{L}\p{N}%]+$/gu, '');
    if (!core) {
      if (boundary && out.length) out[out.length - 1].boundary = mergeBoundary(out[out.length - 1].boundary, boundary);
      continue;
    }

    const numWords = numericTokenToWords(core.replace(/%$/, ''));
    if (numWords) {
      numWords.forEach((w) => out.push({ word: w, raw: rawTok, unscorable: true, fromNumber: true }));
      if (core.endsWith('%')) out.push({ word: 'procent', raw: rawTok, unscorable: true, fromNumber: true });
      if (boundary) out[out.length - 1].boundary = boundary;
      continue;
    }

    let unscorable = FOREIGN_LETTERS.test(core);
    let word = '';
    for (const ch of core) {
      if (POLISH_LETTERS.has(ch) && ch !== 'q') word += ch;
      else if (DIACRITIC_FOLD[ch]) {
        word += DIACRITIC_FOLD[ch];
        unscorable = true;
      } else if (/\d/.test(ch)) {
        unscorable = true;
      }
    }
    if (!word) continue;
    out.push({ word, raw: rawTok, boundary, unscorable });
  }
  return out;
}

function mergeBoundary(a: NormToken['boundary'], b: NormToken['boundary']): NormToken['boundary'] {
  if (a === 'sentence' || b === 'sentence') return 'sentence';
  return a ?? b;
}

/** Simple word list (no boundaries) for comparisons. */
export function normalizeWords(text: string): string[] {
  return normalizeText(text).map((t) => t.word);
}
