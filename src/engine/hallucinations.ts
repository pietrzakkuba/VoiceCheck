import { T } from './thresholds';
import { normalizeWords } from './normalize';
import { countTextSyllables } from './syllables';

// Typical Whisper hallucinations for Polish on silence / noise.
const KNOWN_HALLUCINATIONS = [
  'napisy stworzone przez społeczność amara.org',
  'napisy stworzone przez społeczność amara org',
  'napisy wykonane przez społeczność amara.org',
  'dziękuję za uwagę',
  'dziękuję za obejrzenie',
  'dzięki za obejrzenie',
  'subskrybuj',
  'zasubskrybuj kanał',
  'napisy by',
  'tłumaczenie i napisy',
  'do zobaczenia w następnym odcinku',
  'www.',
  'muzyka',
];

export interface HallucinationCheck {
  rejected: boolean;
  reason?: string;
}

function repeatedNgram(words: string[]): boolean {
  for (let n = 2; n <= 4; n++) {
    const counts = new Map<string, number>();
    for (let i = 0; i + n <= words.length; i++) {
      const key = words.slice(i, i + n).join(' ');
      const c = (counts.get(key) ?? 0) + 1;
      if (c >= T.hallucinationNgramRepeats) return true;
      counts.set(key, c);
    }
  }
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run >= 4) return true;
  }
  return false;
}

/** Filters Whisper output (5.2): repetition loops, known hallucinations, too many syllables for the audio. */
export function checkHallucination(text: string, acousticNuclei: number | null): HallucinationCheck {
  const t = text.trim().toLowerCase();
  if (!t) return { rejected: true, reason: 'empty' };
  const words = normalizeWords(t);
  if (!words.length) return { rejected: true, reason: 'empty' };
  if (repeatedNgram(words)) return { rejected: true, reason: 'repetition-loop' };
  const stripped = t.replace(/[.,!?…\s]+$/g, '');
  for (const h of KNOWN_HALLUCINATIONS) {
    if (stripped === h || (h.length > 12 && stripped.includes(h))) return { rejected: true, reason: 'known-phrase' };
  }
  if (acousticNuclei !== null) {
    const syl = countTextSyllables(words);
    if (syl > T.hallucinationSyllableRatio * Math.max(acousticNuclei, 2)) {
      return { rejected: true, reason: 'too-many-syllables' };
    }
  }
  return { rejected: false };
}
