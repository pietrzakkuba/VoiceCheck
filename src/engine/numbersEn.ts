// English cardinal numbers → words. Spoken forms vary (years, "oh" for zero), so callers mark them unscorable.
const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion'];

function below1000(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) out.push(ONES[h], 'hundred');
  if (h && rest) out.push('and');
  if (rest >= 20) {
    out.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) out.push(ONES[rest % 10]);
  } else if (rest) {
    out.push(ONES[rest]);
  }
  return out;
}

export function numberToWordsEn(n: number): string[] {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return [];
  if (n === 0) return ['zero'];
  if (n >= 1e12) return String(n).split('').map((d) => ONES[Number(d)]);
  const groups: string[][] = [];
  let rest = n;
  let scale = 0;
  while (rest > 0) {
    const g = rest % 1000;
    rest = Math.floor(rest / 1000);
    if (g) groups.unshift([...below1000(g), ...(scale ? [SCALES[scale]] : [])]);
    scale++;
  }
  return groups.flat();
}

/** Converts a numeric token ("12", "3.5", "1,000", "21st") into words. Returns null for non-numeric input. */
export function numericTokenToWordsEn(token: string): string[] | null {
  const ordinal = /^(\d+)(?:st|nd|rd|th)$/.exec(token);
  if (ordinal) return numberToWordsEn(Number(ordinal[1]));
  const grouped = /^\d{1,3}(?:,\d{3})+$/.test(token) ? token.replace(/,/g, '') : token;
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(grouped);
  if (!m) return null;
  const int = numberToWordsEn(Number(m[1]));
  if (!m[2]) return int;
  return [...int, 'point', ...m[2].split('').map((d) => ONES[Number(d)])];
}
