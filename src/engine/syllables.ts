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

export function countSyllables(word: string): number {
  return syllableNuclei(word).length;
}

export function countTextSyllables(words: string[]): number {
  return words.reduce((s, w) => s + countSyllables(w), 0);
}
