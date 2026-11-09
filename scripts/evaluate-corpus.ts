/**
 * Threshold tuning on an annotated corpus (spec section 9).
 *
 * Corpus layout (one pair per recording):
 *   <dir>/<name>.input.json   – exported from the report page with ?debug=1 → "Korpus"
 *   <dir>/<name>.labels.json  – manual annotations (Praat / Label Studio converted to JSON):
 *     {
 *       "flags":  [{ "type": "MUMBLED_WORD", "startMs": 1200, "endMs": 1500 }, ...],
 *       "pauses": [{ "startMs": 950, "endMs": 1400 }, ...],          // optional
 *       "articulationRate": 5.1                                       // optional, syl/s
 *     }
 *
 * Usage:
 *   npm run evaluate-corpus -- <dir>
 *   npm run evaluate-corpus -- <dir> --sweep tauAbs=0.5:2:0.25 --sweep rushedPhraseAbs=5.5:7.5:0.5
 *   npm run evaluate-corpus -- --make-example corpus-example     (writes a synthetic example pair)
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { analyzeSession, type AnalysisOutput } from '../src/engine/report';
import { T, DEFAULT_SCORE_WEIGHTS } from '../src/engine/thresholds';
import type { AnalysisInput } from '../src/engine/context';
import type { AlignedChar, FlagType, RawWord } from '../src/types';

interface LabelFlag { type: FlagType; startMs: number; endMs: number }
interface Labels { flags: LabelFlag[]; pauses?: { startMs: number; endMs: number }[]; articulationRate?: number }
interface Item { name: string; input: AnalysisInput; labels: Labels }

const TOLERANCE_MS = 300;
const TARGETS = { redPrecision: 0.85, amberPrecision: 0.6, arError: 0.1, pauseF1: 0.9 };

function loadCorpus(dir: string): Item[] {
  const items: Item[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.input.json')).sort()) {
    const name = basename(f, '.input.json');
    const lf = join(dir, `${name}.labels.json`);
    if (!existsSync(lf)) {
      console.warn(`! brak adnotacji dla ${name} – pomijam`);
      continue;
    }
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const input: AnalysisInput = raw.input ?? raw;
    items.push({ name, input, labels: JSON.parse(readFileSync(lf, 'utf8')) });
  }
  return items;
}

const overlaps = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }, tol: number) =>
  a.startMs - tol < b.endMs && b.startMs - tol < a.endMs;

interface Counts { tp: number; fp: number; fn: number }
const ratio = (a: number, b: number) => (b > 0 ? a / b : NaN);
const prf = (c: Counts) => {
  const p = ratio(c.tp, c.tp + c.fp);
  const r = ratio(c.tp, c.tp + c.fn);
  return { p, r, f1: p + r > 0 ? (2 * p * r) / (p + r) : NaN };
};

interface EvalResult {
  byType: Map<string, Counts>;
  bySeverity: { red: Counts; amber: Counts };
  arErrors: number[];
  pauses: Counts;
}

function evaluate(items: Item[]): EvalResult {
  const byType = new Map<string, Counts>();
  const bySeverity = { red: { tp: 0, fp: 0, fn: 0 }, amber: { tp: 0, fp: 0, fn: 0 } };
  const arErrors: number[] = [];
  const pauses: Counts = { tp: 0, fp: 0, fn: 0 };
  const get = (t: string) => byType.get(t) ?? (byType.set(t, { tp: 0, fp: 0, fn: 0 }), byType.get(t)!);

  for (const it of items) {
    const out: AnalysisOutput = analyzeSession(it.input);
    const used = new Set<number>();
    for (const f of out.flags) {
      const k = it.labels.flags.findIndex((l, i) => !used.has(i) && l.type === f.type && overlaps(l, f, TOLERANCE_MS));
      const c = get(f.type);
      if (k >= 0) {
        used.add(k);
        c.tp++;
        bySeverity[f.severity].tp++;
      } else {
        c.fp++;
        bySeverity[f.severity].fp++;
      }
    }
    it.labels.flags.forEach((l, i) => {
      if (!used.has(i)) get(l.type).fn++;
    });

    if (it.labels.articulationRate && out.metrics.articulationRate > 0) {
      arErrors.push(Math.abs(out.metrics.articulationRate - it.labels.articulationRate) / it.labels.articulationRate);
    }
    if (it.labels.pauses) {
      const pred = out.pauses;
      const pu = new Set<number>();
      for (const p of pred) {
        const k = it.labels.pauses.findIndex((l, i) => !pu.has(i) && overlaps(l, p, 0) && Math.min(l.endMs, p.endMs) - Math.max(l.startMs, p.startMs) >= 0.5 * (l.endMs - l.startMs));
        if (k >= 0) { pu.add(k); pauses.tp++; } else pauses.fp++;
      }
      pauses.fn += it.labels.pauses.length - pu.size;
    }
  }
  return { byType, bySeverity, arErrors, pauses };
}

const pct = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '–');
const ok = (v: number, target: number, lowerBetter = false) => (!Number.isFinite(v) ? ' ' : (lowerBetter ? v <= target : v >= target) ? '✓' : '✗');

function summary(r: EvalResult) {
  const red = prf(r.bySeverity.red).p;
  const amber = prf(r.bySeverity.amber).p;
  const ar = r.arErrors.length ? r.arErrors.reduce((a, b) => a + b, 0) / r.arErrors.length : NaN;
  const pf1 = prf(r.pauses).f1;
  return { red, amber, ar, pf1 };
}

function printReport(r: EvalResult) {
  console.log('\nTyp flagi                     TP   FP   FN  Precyzja  Czułość');
  for (const [t, c] of [...r.byType.entries()].sort()) {
    const m = prf(c);
    console.log(`${t.padEnd(28)} ${String(c.tp).padStart(4)} ${String(c.fp).padStart(4)} ${String(c.fn).padStart(4)}  ${pct(m.p).padStart(8)} ${pct(m.r).padStart(8)}`);
  }
  const s = summary(r);
  console.log('\nCele (sekcja 9):');
  console.log(`  ${ok(s.red, TARGETS.redPrecision)} precyzja flag czerwonych   ${pct(s.red)}  (cel ≥ ${pct(TARGETS.redPrecision)})`);
  console.log(`  ${ok(s.amber, TARGETS.amberPrecision)} precyzja flag bursztynowych ${pct(s.amber)}  (cel ≥ ${pct(TARGETS.amberPrecision)})`);
  console.log(`  ${ok(s.ar, TARGETS.arError, true)} średni błąd AR             ${pct(s.ar)}  (cel ≤ ${pct(TARGETS.arError)}, n=${r.arErrors.length})`);
  console.log(`  ${ok(s.pf1, TARGETS.pauseF1)} F1 detekcji pauz           ${pct(s.pf1)}  (cel ≥ ${pct(TARGETS.pauseF1)})`);
}

function parseSweeps(args: string[]) {
  const out: { key: string; values: number[] }[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '--sweep') continue;
    const m = /^(\w+)=([-\d.]+):([-\d.]+):([\d.]+)$/.exec(args[++i] ?? '');
    if (!m) throw new Error(`Niepoprawny --sweep: ${args[i]} (oczekiwano klucz=od:do:krok)`);
    const [, key, a, b, st] = m;
    if (!(key in T)) throw new Error(`Nieznany próg: ${key}`);
    const values: number[] = [];
    for (let v = +a; v <= +b + 1e-9; v += +st) values.push(+v.toFixed(6));
    out.push({ key, values });
  }
  return out;
}

/** Synthetic example pair so the pipeline can be tried without a real corpus. */
function makeExample(dir: string) {
  mkdirSync(dir, { recursive: true });
  const ch = (c: string, t: number, p: number): AlignedChar => ({
    char: c, startMs: t, endMs: t + 20, pTarget: p, competitor: 's', pComp: p < 0.5 ? 0.6 : 0.01, gop: Math.log(p / (p < 0.5 ? 0.6 : 0.01)), segBest: c, segBestP: p,
  });
  const word = (text: string, start: number, msPerChar: number, p = 0.95, extra: Partial<RawWord> = {}): RawWord => ({
    text, targetText: text, op: 'match', startMs: start, endMs: start + text.length * msPerChar, alignScore: -0.3,
    chars: [...text].map((c, k) => ch(c, start + k * msPerChar, p)), unscorable: false, ...extra,
  });
  const words = [
    word('szary', 0, 60), word('szczur', 320, 55), word('szuka', 680, 60), word('szyszek', 1000, 55, 0.05, { boundary: 'sentence' }),
    word('w', 1900, 60), word('szufladzie', 1980, 50), word('szafy', 2500, 60, 0.95, { boundary: 'sentence' }),
  ];
  const durationMs = 3200;
  const speech = [{ startMs: 0, endMs: 1400 }, { startMs: 1880, endMs: 2800 }];
  const n = durationMs / 10;
  const db: number[] = new Array(n).fill(-65);
  const voicing: number[] = new Array(n).fill(0);
  const f0: number[] = new Array(n).fill(0);
  for (const s of speech) for (let i = s.startMs / 10; i < s.endMs / 10; i++) { db[i] = -24 + 3 * Math.sin(i / 3); voicing[i] = 0.8; f0[i] = 130 + 30 * Math.sin(i / 35); }
  const input: AnalysisInput = {
    mode: 'tongue_twisters', reading: true, targetText: 'Szary szczur szuka szyszek. W szufladzie szafy.', durationMs, speech, db, voicing, f0,
    mfccDelta: new Array(n).fill(3), noiseFloorDb: -65, words, skipped: [], asrAvailable: true, gopAvailable: true, liveNuclei: 13,
    settings: { targetArticulationRate: [4.5, 5.5], maxContinuousSpeechSeconds: 8, scoreWeights: DEFAULT_SCORE_WEIGHTS, liveSyllableCorrection: 1 },
    baseline: null, dictionCategory: 'szumiace',
  };
  const labels: Labels = {
    flags: [{ type: 'MUMBLED_WORD', startMs: 1000, endMs: 1385 }],
    pauses: [{ startMs: 1400, endMs: 1880 }],
    articulationRate: 5.0,
  };
  writeFileSync(join(dir, 'example.input.json'), JSON.stringify({ sessionId: 'example', input }, null, 1));
  writeFileSync(join(dir, 'example.labels.json'), JSON.stringify(labels, null, 2));
  console.log(`Zapisano przykład w ${dir}/ (example.input.json + example.labels.json)`);
}

function main() {
  const args = process.argv.slice(2);
  const mk = args.indexOf('--make-example');
  if (mk >= 0) {
    makeExample(args[mk + 1] ?? 'corpus-example');
    return;
  }
  const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--sweep') ?? 'corpus';
  if (!existsSync(dir)) {
    console.error(`Brak katalogu korpusu: ${dir}. Użyj --make-example, aby wygenerować przykład.`);
    process.exit(1);
  }
  const items = loadCorpus(dir);
  console.log(`Korpus: ${items.length} nagrań z ${dir}`);
  if (!items.length) return;

  const sweeps = parseSweeps(args);
  if (!sweeps.length) {
    printReport(evaluate(items));
    return;
  }
  const mutable = T as unknown as Record<string, number>;
  for (const { key, values } of sweeps) {
    const original = mutable[key];
    console.log(`\nPrzeszukiwanie progu ${key} (obecnie ${original}):`);
    console.log('  wartość   prec.czerw  prec.bursz  błąd AR   F1 pauz');
    for (const v of values) {
      mutable[key] = v;
      const s = summary(evaluate(items));
      console.log(`  ${String(v).padEnd(8)}  ${pct(s.red).padStart(10)}  ${pct(s.amber).padStart(10)}  ${pct(s.ar).padStart(7)}  ${pct(s.pf1).padStart(8)}`);
    }
    mutable[key] = original;
  }
}

main();
