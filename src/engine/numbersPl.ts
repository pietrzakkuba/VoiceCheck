// Polish cardinal numbers → words (nominative). Inflected forms cannot be inferred, so callers mark them unscorable.
const ONES = ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const TEENS = [
  'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście',
  'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście',
];
const TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
const HUNDREDS = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];

const SCALES: [string, string, string][] = [
  ['', '', ''],
  ['tysiąc', 'tysiące', 'tysięcy'],
  ['milion', 'miliony', 'milionów'],
  ['miliard', 'miliardy', 'miliardów'],
];

function below1000(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) out.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) out.push(TEENS[rest - 10]);
  else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) out.push(TENS[t]);
    if (o) out.push(ONES[o]);
  }
  return out;
}

function scaleForm(n: number, forms: [string, string, string]): string {
  if (n === 1) return forms[0];
  const lastTwo = n % 100;
  const last = n % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return forms[1];
  return forms[2];
}

export function numberToWords(n: number): string[] {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return [];
  if (n === 0) return ['zero'];
  if (n >= 1e12) return String(n).split('').map((d) => ONES[Number(d)]);
  const out: string[] = [];
  let scale = 0;
  const groups: { words: string[] }[] = [];
  let rest = n;
  while (rest > 0) {
    const g = rest % 1000;
    rest = Math.floor(rest / 1000);
    if (g) {
      const words = scale > 0 && g === 1 ? [] : below1000(g);
      if (scale > 0) words.push(scaleForm(g, SCALES[scale]));
      groups.unshift({ words });
    }
    scale++;
  }
  for (const g of groups) out.push(...g.words);
  return out;
}

/** Converts a numeric token ("12", "3,5", "2024") into words. Returns null for non-numeric input. */
export function numericTokenToWords(token: string): string[] | null {
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(token);
  if (!m) return null;
  const int = numberToWords(Number(m[1]));
  if (!m[2]) return int;
  return [...int, 'przecinek', ...numberToWords(Number(m[2]))];
}
