import type { Lang } from '@/i18n/lang';

export const VOWELS = new Set(['a', 'ą', 'e', 'ę', 'i', 'o', 'ó', 'u', 'y']);

// Loanword stems where "au"/"eu" is a diphthong (one syllable). Native words such as "nauka" keep two.
const DIPHTHONG_STEMS = [
  'auto', 'autor', 'audy', 'audio', 'audyt', 'august', 'aura', 'aukcj', 'australi', 'austri',
  'europ', 'euro', 'eukalipt', 'eutanaz', 'pauz', 'laur', 'saun', 'klauzul', 'neuro', 'neuron',
  'feud', 'reumat', 'pseudo', 'kaucj', 'aplauz', 'farmaceut', 'terapeut', 'leukocyt', 'hydraul', 'astronaut',
  'nautyk', 'kauzal',
];

function hasDiphthongStem(word: string): boolean {
  return DIPHTHONG_STEMS.some((s) => word.includes(s));
}

/** Indices of characters that form syllable nuclei (5.8). */
export function syllableNuclei(word: string): number[] {
  const w = word.toLowerCase();
  const chars = [...w];
  const diph = hasDiphthongStem(w) || /^(au|eu)/.test(w);
  const out: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!VOWELS.has(c)) continue;
    const next = chars[i + 1];
    // "i" before a vowel only palatalises the preceding consonant.
    if (c === 'i' && next && VOWELS.has(next) && i > 0 && !VOWELS.has(chars[i - 1])) continue;
    if (diph && c === 'u' && i > 0 && (chars[i - 1] === 'a' || chars[i - 1] === 'e')) continue;
    out.push(i);
  }
  return out;
}

export function countSyllables(word: string, lang: Lang = 'pl'): number {
  return lang === 'en' ? englishSyllables(word) : syllableNuclei(word).length;
}

export function countTextSyllables(words: string[], lang: Lang = 'pl'): number {
  return words.reduce((s, w) => s + countSyllables(w, lang), 0);
}

// Irregular English words the spelling heuristic gets wrong.
const EN_EXCEPTIONS: Record<string, number> = {
  area: 3, areas: 3, idea: 3, ideas: 3, realism: 4, notebook: 2, business: 2, every: 2, everyone: 3, everything: 3, evening: 2, different: 3,
  family: 3, people: 2, poem: 2, quiet: 2, science: 2, client: 2, diet: 2, create: 2, created: 3,
  react: 2, real: 1, really: 2, being: 2, naive: 2, cafe: 2, recipe: 3, simile: 3, apostrophe: 4,
  someone: 2, something: 2, sometimes: 2, somewhere: 2, whereas: 2, therefore: 2, forever: 3,
  fire: 1, hour: 1, our: 1, flour: 1, prayer: 1, eye: 1, eyes: 1, queue: 1, lion: 2, iron: 2,
  violin: 3, video: 3, radio: 3, period: 3, theory: 3, theatre: 3, theater: 3, museum: 3,
  piano: 3, union: 2, million: 2, billion: 2, opinion: 3, onion: 2, champion: 3, chocolate: 3,
  interesting: 3, temperature: 4, vegetable: 4, comfortable: 3, actually: 4, usually: 4, literally: 4,
  wednesday: 2, colonel: 2, women: 2, unique: 2, technique: 2, antique: 2,
};

/** Spelling-based syllable estimate for an English word (approximate; calibration corrects the rest). */
function englishSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (EN_EXCEPTIONS[w]) return EN_EXCEPTIONS[w];
  if (w.length <= 3) return 1;
  let extra = 0;
  // "-ing" after a vowel is its own syllable: go-ing, see-ing.
  if (/[aeiou]ing$/.test(w)) extra++;
  // Vowel pairs that are usually split: vari-ous, stadi-um, actu-al, Canadi-an, ide-a.
  if (/[^cgstx]iou/.test(w)) extra++;
  if (/[^cgst]i(?:um|an)$/.test(w)) extra++;
  if (/[^qg]u[ao]/.test(w)) extra++;
  if (/[^aeiou]ea$/.test(w)) extra++;
  // "-ience"/"-ient" and "-ier"/"-iest" split the vowels: experi-ence, conveni-ent, earli-er.
  if (/[^cst]ien(?:ce|t)s?$/.test(w)) extra++;
  if (/[^aeiou]i(?:er|est)$/.test(w)) extra++;
  // "-ism" adds a syllable: real-is-m.
  if (/ism$/.test(w)) extra++;
  // Silent "e" before common suffixes: love-ly, care-ful, state-ment.
  w = w.replace(/([^aeiouy])e(ly|ful|fully|ness|less|lessly|ments?)$/, '$1$2');
  if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w)) w = w.slice(0, -1);
  else if (/[^aeiouy]es$/.test(w) && !/(?:[sxzcg]|ch|sh)es$/.test(w) && !/[^aeiouy]les$/.test(w)) w = w.slice(0, -2);
  else if (/[^aeiou]ed$/.test(w) && !/[td]ed$/.test(w)) w = w.slice(0, -2);
  // "y" is a consonant at the start of a word and before a vowel: you, player, beyond.
  w = w.replace(/^y/, '').replace(/y(?=[aeiou])/g, 'j');
  const groups = w.match(/[aeiouy]+/g)?.length ?? 0;
  return Math.max(1, groups + extra);
}
