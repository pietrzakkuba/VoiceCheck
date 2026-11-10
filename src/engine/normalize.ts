import type { Lang } from '@/i18n/lang';
import { numericTokenToWords } from './numbersPl';
import { numericTokenToWordsEn } from './numbersEn';

interface LanguageRules {
  /** Native letters kept as they are. */
  letters: Set<string>;
  /** Letters that signal foreign words (5.3). */
  foreign: RegExp;
  /** Accented letters folded to native ones; the word is then unscorable. */
  fold: Record<string, string>;
  abbreviations: Record<string, string[]>;
  numberWords: (token: string) => string[] | null;
  percent: string;
}

const COMMON_FOLD: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i',
  ô: 'o', ö: 'o', ò: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ý: 'y', ç: 'c', ñ: 'n', ß: 'ss',
};

const RULES: Record<Lang, LanguageRules> = {
  pl: {
    // Polish letters plus v/x, which signal foreign words.
    letters: new Set('aąbcćdeęfghijklłmnńoóprsśtuvwxyzźż'.split('')),
    foreign: /[qvx]/,
    fold: { ...COMMON_FOLD, q: 'k' },
    abbreviations: {
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
    },
    numberWords: numericTokenToWords,
    percent: 'procent',
  },
  en: {
    letters: new Set('abcdefghijklmnopqrstuvwxyz'.split('')),
    // Polish letters in an English text.
    foreign: /[ąćęłńóśźż]/,
    fold: { ...COMMON_FOLD, ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' },
    abbreviations: {
      'e.g.': ['for', 'example'],
      'i.e.': ['that', 'is'],
      'etc.': ['et', 'cetera'],
      'vs.': ['versus'],
      'mr.': ['mister'],
      'mrs.': ['missus'],
      'ms.': ['miz'],
      'dr.': ['doctor'],
      'approx.': ['approximately'],
      '%': ['percent'],
      '&': ['and'],
    },
    numberWords: numericTokenToWordsEn,
    percent: 'percent',
  },
};

export interface NormToken {
  /** Lower-case native letters only. */
  word: string;
  /** Original surface form. */
  raw: string;
  boundary?: 'sentence' | 'comma';
  unscorable: boolean;
  fromNumber?: boolean;
}

const SENTENCE_END = /[.?!…]+$/;
const COMMA_END = /[,;:–—]+$/;

/** Normalises text into words with sentence/comma boundaries (5.3). Text without a language is Polish. */
export function normalizeText(text: string, lang: Lang = 'pl'): NormToken[] {
  const rules = RULES[lang];
  const out: NormToken[] = [];
  const cleaned = text
    .replace(/\u2026/g, '…')
    .replace(/[„”“"«»()[\]{}]/g, ' ')
    .replace(/(\d)\s+(\d{3})\b/g, '$1$2')
    .replace(/([a-ząćęłńóśźż])-(?=[a-ząćęłńóśźż])/gi, '$1 ')
    .replace(/\s+[-–—]\s+/g, ', ');
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);

  for (const rawTok of rawTokens) {
    const lower = rawTok.toLowerCase();
    if (rules.abbreviations[lower]) {
      for (const w of rules.abbreviations[lower]) out.push({ word: w, raw: rawTok, unscorable: false });
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

    const numWords = rules.numberWords(core.replace(/%$/, ''));
    if (numWords) {
      numWords.forEach((w) => out.push({ word: w, raw: rawTok, unscorable: true, fromNumber: true }));
      if (core.endsWith('%')) out.push({ word: rules.percent, raw: rawTok, unscorable: true, fromNumber: true });
      if (boundary) out[out.length - 1].boundary = boundary;
      continue;
    }

    let unscorable = rules.foreign.test(core);
    let word = '';
    for (const ch of core) {
      if (rules.letters.has(ch) && !rules.fold[ch]) word += ch;
      else if (rules.fold[ch]) {
        word += rules.fold[ch];
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
export function normalizeWords(text: string, lang: Lang = 'pl'): string[] {
  return normalizeText(text, lang).map((t) => t.word);
}
