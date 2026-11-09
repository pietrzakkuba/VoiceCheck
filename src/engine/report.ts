import type {
  Flag, FlagType, PauseInfo, PhraseAnalysis, Scores, SessionMetrics, TopIssue, UnitAnalysis, UnitCategory,
  UserBaseline, WordAnalysis, TrainingSession,
} from '@/types';
import { UNIT_CATEGORIES } from '@/types';
import { T } from './thresholds';
import { type AnalysisInput, FRAME_MS, isFillerToken, mkFlag } from './context';
import { analyzeUnits, articulationFlag, tauTable, wordClarity } from './gop';
import { countSyllables } from './syllables';
import { buildIpus, analyzeTempo, phrasesFromIpus } from './tempo';
import { analyzePauses } from './pauses';
import { detectFillers } from './fillers';
import { analyzeProsody } from './prosody';
import { detectNuclei } from './syllableNuclei';
import { comparePacer } from './pacer';
import { median, percentile } from './features';
import { hzToSemitones } from './pitch';
import { CATEGORY_LABELS } from './units';
import {
  articulationScore, dictionLabScore, fluencyScore, prosodyScore, tempoScore, totalScore, type Component,
} from './scoring';

export type AnalysisOutput = Pick<
  TrainingSession,
  'metrics' | 'scores' | 'flags' | 'words' | 'phrases' | 'topIssues' | 'pauses' | 'categoryGop' | 'liveSyllableRatio' | 'warnings' | 'noiseFloorDb' | 'analysisStatus' | 'transcript'
>;

const ARTICULATION_TYPES: FlagType[] = ['MUMBLED_WORD', 'SWALLOWED_WORD_ENDING', 'SUBSTITUTED_SOUND', 'SKIPPED_WORD'];

interface IssueDef {
  title: string;
  why: string;
  exercise: string;
  link?: string;
  flagTypes: FlagType[];
}

function issueDefs(input: AnalysisInput, ctx: { subCategory?: UnitCategory; endCategory?: UnitCategory }): Record<string, IssueDef> {
  const [lo, hi] = input.settings.targetArticulationRate;
  const dictLink = (c?: UnitCategory) => (c && c !== 'inne' && c !== 'samogloski' ? `/diction?category=${c}` : '/diction');
  return {
    tooFast: {
      title: 'Mówisz za szybko', flagTypes: ['RUSHED_PHRASE', 'ACCELERATING_PHRASE', 'RUSHED_WORD'],
      why: 'Przy zbyt szybkim tempie słuchacz nie nadąża, a głoski zlewają się ze sobą.',
      exercise: `Pacer: czytaj w tempie ${lo.toFixed(1)} sylaby/s, robiąc pauzy na przecinkach.`, link: `/pacer?rate=${lo.toFixed(1)}`,
    },
    rushed: {
      title: 'Przyspieszasz w trakcie fraz', flagTypes: ['RUSHED_PHRASE', 'ACCELERATING_PHRASE'],
      why: 'Przyspieszanie pod koniec frazy „zjada” najważniejsze słowa i końcówki.',
      exercise: 'Pacer z równym tempem – pilnuj, by ostatnie słowa frazy miały ten sam rytm co pierwsze.', link: `/pacer?rate=${((lo + hi) / 2).toFixed(1)}`,
    },
    tooSlow: {
      title: 'Mówisz zbyt wolno', flagTypes: [],
      why: 'Bardzo wolne tempo męczy słuchacza i obniża wrażenie pewności siebie.',
      exercise: `Pacer: spróbuj tempa ${lo.toFixed(1)} sylaby/s.`, link: `/pacer?rate=${lo.toFixed(1)}`,
    },
    pacer: {
      title: 'Nie trzymasz tempa wskaźnika', flagTypes: ['AHEAD_OF_PACER', 'BEHIND_PACER'],
      why: 'Równe tempo to podstawa – pacer uczy wyczucia rytmu wypowiedzi.',
      exercise: 'Powtórz ćwiczenie, patrząc na podświetlane słowo i pasek „Weź oddech”.', link: input.pacer ? `/pacer?rate=${input.pacer.targetRate}` : '/pacer',
    },
    SWALLOWED_WORD_ENDING: {
      title: 'Połykasz końcówki wyrazów', flagTypes: ['SWALLOWED_WORD_ENDING'],
      why: 'Końcówki niosą informację gramatyczną (-łem, -ą, -ść) – bez nich zdanie staje się niejasne.',
      exercise: 'Laboratorium dykcji: czytaj łamańce, przeciągając świadomie ostatnią sylabę każdego słowa.', link: dictLink(ctx.endCategory),
    },
    MUMBLED_WORD: {
      title: 'Niewyraźne słowa', flagTypes: ['MUMBLED_WORD'],
      why: 'Niedomknięta artykulacja sprawia, że słuchacz musi zgadywać, co powiedziałeś.',
      exercise: 'Laboratorium dykcji: ćwiczenia z wyraźnym otwieraniem ust i aktywnym językiem.', link: '/diction',
    },
    SUBSTITUTED_SOUND: {
      title: ctx.subCategory ? `Mylisz głoski: ${CATEGORY_LABELS[ctx.subCategory].toLowerCase()}` : 'Mylisz głoski',
      flagTypes: ['SUBSTITUTED_SOUND'],
      why: 'Zamiana szeregów (sz/s/ś, cz/c/ć) zmienia znaczenie słów: kasza – kasa – Kasia.',
      exercise: 'Laboratorium dykcji: pary minimalne dla tej kategorii głosek.', link: ctx.subCategory ? `/diction?category=${ctx.subCategory}&tab=pairs` : '/diction?tab=pairs',
    },
    SKIPPED_WORD: {
      title: 'Pomijasz słowa', flagTypes: ['SKIPPED_WORD', 'WRONG_WORD'],
      why: 'Pominięte słowa często wynikają z pośpiechu – czytaj o pół tonu wolniej.',
      exercise: 'Pacer z tym samym tekstem w tempie o 0.5 sylaby/s niższym.', link: `/pacer?rate=${lo.toFixed(1)}`,
    },
    diction: {
      title: input.dictionCategory && input.dictionCategory in CATEGORY_LABELS ? `Głoski: ${CATEGORY_LABELS[input.dictionCategory as UnitCategory].toLowerCase()}` : 'Głoski z ćwiczonej kategorii',
      flagTypes: ['SUBSTITUTED_SOUND', 'MUMBLED_WORD', 'SWALLOWED_WORD_ENDING'],
      why: 'To głoski, które w tym ćwiczeniu zostały wypowiedziane niewyraźnie lub zamienione.',
      exercise: 'Powtórz łamaniec wolniej, a następnie przejdź do par minimalnych.', link: input.dictionCategory ? `/diction?category=${input.dictionCategory}&tab=pairs` : '/diction',
    },
    fillers: {
      title: 'Wypełniacze („yyy”, „eee”, „jakby”)', flagTypes: ['FILLER_SOUND', 'FILLER_WORD', 'PROLONGATION'],
      why: 'Wypełniacze rozpraszają i sprawiają wrażenie niepewności.',
      exercise: 'Zamiast „yyy” zrób cichą pauzę – Opowiadanie historii pozwala to przećwiczyć.', link: '/storytelling',
    },
    noBreath: {
      title: 'Za długo bez oddechu', flagTypes: ['NO_BREATH'],
      why: 'Mówienie na resztce powietrza powoduje cichnięcie i połykanie końcówek.',
      exercise: 'Pacer: weź oddech przy każdym pasku „Weź oddech”.', link: `/pacer?rate=${lo.toFixed(1)}`,
    },
    missingPause: {
      title: 'Brak pauz między zdaniami', flagTypes: ['MISSING_PAUSE'],
      why: 'Pauza na końcu zdania pozwala słuchaczowi zrozumieć myśl, a Tobie złapać oddech.',
      exercise: 'Pacer – zatrzymuj się na kropkach (1,2 s) i przecinkach (0,6 s).', link: `/pacer?rate=${lo.toFixed(1)}`,
    },
    hesitation: {
      title: 'Pauzy wahania', flagTypes: ['HESITATION_PAUSE', 'UNEXPECTED_PAUSE'],
      why: 'Długie przerwy w środku myśli brzmią jak zgubienie wątku.',
      exercise: 'Opowiadanie historii: zaplanuj pierwsze zdanie historii, zanim zaczniesz mówić.', link: '/storytelling',
    },
    repetition: {
      title: 'Powtórzenia słów', flagTypes: ['REPETITION'],
      why: 'Restartowanie zdań („i to, i to jest”) sygnalizuje pośpiech.',
      exercise: 'Mów wolniej i kończ każde rozpoczęte zdanie.', link: '/storytelling',
    },
    sentenceEnds: {
      title: 'Cichniesz na końcu zdań', flagTypes: ['SWALLOWED_SENTENCE_ENDING'],
      why: 'Na końcu zdania często jest najważniejsza informacja – musi być słyszalna.',
      exercise: 'Czytanie własnego tekstu: ostatnie słowo każdego zdania wypowiadaj z tą samą głośnością.', link: '/reading',
    },
    monotone: {
      title: 'Monotonna intonacja', flagTypes: ['MONOTONE'],
      why: 'Zmiany wysokości głosu pomagają podkreślić najważniejsze słowa.',
      exercise: 'Czytaj tekst, akcentując jedno kluczowe słowo w każdym zdaniu.', link: '/reading',
    },
    volumeDecline: {
      title: 'Cichniesz z czasem', flagTypes: ['VOLUME_DECLINE'],
      why: 'Spadek głośności w dłuższej wypowiedzi oznacza zmęczenie oddechu.',
      exercise: 'Pacer z dłuższym tekstem – pilnuj regularnych oddechów.', link: '/pacer',
    },
    lowSnr: {
      title: 'Słaba jakość nagrania', flagTypes: ['LOW_SNR'],
      why: 'Przy dużym szumie ocena wymowy jest niewiarygodna.',
      exercise: 'Nagraj w cichszym miejscu lub bliżej mikrofonu.',
    },
  };
}

function speechMask(input: AnalysisInput): Uint8Array {
  const n = input.db.length;
  const mask = new Uint8Array(n);
  for (const s of input.speech) {
    const a = Math.max(0, Math.floor(s.startMs / FRAME_MS));
    const b = Math.min(n, Math.ceil(s.endMs / FRAME_MS));
    for (let i = a; i < b; i++) mask[i] = 1;
  }
  return mask;
}

/** Pure scoring pipeline: features + aligned words → metrics, flags, scores, Top 3 (sections 5–7). */
export function analyzeSession(input: AnalysisInput): AnalysisOutput {
  const warnings: string[] = [];
  const flags: Flag[] = [];
  const words = input.words;
  const mask = speechMask(input);
  const isSpeech = (i: number) => mask[i] === 1;
  const durationMs = input.durationMs;
  const minutes = durationMs / 60000;

  // --- SNR (4.1)
  const speechDb: number[] = [];
  for (let i = 0; i < input.db.length; i++) if (mask[i]) speechDb.push(input.db[i]);
  const speechLevel = speechDb.length ? median(speechDb) : input.noiseFloorDb;
  const snr = speechLevel - input.noiseFloorDb;
  const lowSnr = speechDb.length > 0 && snr < T.snrWarnDb;
  if (lowSnr) {
    flags.push(mkFlag('LOW_SNR', 'amber', 'high', 0, durationMs, `Niski stosunek sygnału do szumu (${snr.toFixed(0)} dB) – ocena wymowy wyłączona`, { details: { snrDb: +snr.toFixed(1) } }));
    warnings.push('Nagranie jest zaszumione – flagi wymowy nie są pokazywane.');
  }
  if (!input.asrAvailable) warnings.push('Modele nie są jeszcze pobrane – raport zawiera tylko analizę akustyczną. Sesja zostanie przeanalizowana ponownie po pobraniu modeli.');
  else if (!input.gopAvailable) warnings.push('Tryb Lite: ocena artykulacji (GOP) jest niedostępna.');
  if (!speechDb.length) warnings.push('Nie wykryto mowy w nagraniu.');

  // --- Articulation per word (5.5–5.7)
  const tau = tauTable(input.baseline);
  const wordUnits: UnitAnalysis[][] = [];
  const artFlaggedWords = new Set<number>();
  const statusByWord: WordAnalysis['status'][] = [];
  words.forEach((w, i) => {
    const filler = isFillerToken(w.text);
    const badAlign = w.alignScore < T.alignMinScore;
    const unscorable = w.unscorable || filler || badAlign || !input.gopAvailable || w.op === 'ins' || !w.chars;
    const units = analyzeUnits(w.text, w.chars, tau, unscorable);
    wordUnits.push(units);
    statusByWord.push(filler ? 'filler' : w.op === 'ins' ? 'inserted' : units.every((u) => u.status === 'unscorable') ? 'unscorable' : 'ok');
    if (w.op === 'ins' && !filler) {
      flags.push(mkFlag('INSERTED_WORD', 'amber', 'medium', w.startMs, w.endMs, `Dodane słowo „${w.text}” (nie ma go w tekście)`, { wordIndex: i }));
    }
    if (w.op === 'sub' && w.targetText) {
      flags.push(mkFlag('WRONG_WORD', 'amber', 'medium', w.startMs, w.endMs, `Przeczytano „${w.text}” zamiast „${w.targetText}”`, { wordIndex: i, details: { target: w.targetText } }));
    }
    if (unscorable || lowSnr) return;
    const af = articulationFlag(w.text, units);
    if (!af) return;
    const u = units[af.unitIndex ?? 0];
    const veryLow = af.minGop < tau[u.category] - T.veryLowGopMargin;
    const conf = snr >= T.snrHighConfidenceDb && (input.reading || veryLow) ? 'high' : 'medium';
    artFlaggedWords.add(i);
    statusByWord[i] = 'mumbled';
    flags.push(mkFlag(af.type, conf === 'high' ? 'red' : 'amber', conf, u.startMs || w.startMs, Math.max(u.endMs, w.endMs), af.message,
      { wordIndex: i, unitIndex: af.unitIndex, details: { ...af.details, minGop: +af.minGop.toFixed(2) } }));
  });

  // --- Tempo (5.8)
  let nucleiMs: number[] | null = null;
  if (!words.length) nucleiMs = detectNuclei(input.db, input.voicing, input.noiseFloorDb).map((k) => k * FRAME_MS);
  const ipus = buildIpus(input.speech, words, nucleiMs, input.settings.liveSyllableCorrection);
  const baselineAR = input.baseline?.articulationRate ?? T.defaultBaselineAR;
  const tempoConf = input.reading || words.length ? 'high' : 'medium';
  const tempo = analyzeTempo(ipus, words, baselineAR, tempoConf);
  flags.push(...tempo.flags);
  for (const f of tempo.flags) if (f.type === 'RUSHED_WORD' && f.wordIndex !== undefined && statusByWord[f.wordIndex] === 'ok') statusByWord[f.wordIndex] = 'rushed';

  // --- Pauses & fluency (5.9)
  const pauses = analyzePauses(input.speech, ipus, words, {
    reading: input.reading, maxContinuousMs: input.settings.maxContinuousSpeechSeconds * 1000, asrAvailable: input.asrAvailable,
  });
  flags.push(...pauses.flags);
  const fillers = input.asrAvailable
    ? detectFillers(input.speech, ipus, words, input, durationMs)
    : { flags: [], fillerWordIdx: new Set<number>(), fillerSounds: 0, fillerWords: 0, repetitions: 0 };
  flags.push(...fillers.flags);

  // --- Prosody (5.10)
  const prosody = analyzeProsody(words, input, isSpeech, artFlaggedWords, { reading: input.reading, durationMs, asrAvailable: input.asrAvailable });
  flags.push(...prosody.flags);
  let f0Range: number | null = prosody.f0RangeSemitones || null;
  if (!f0Range) {
    const f0 = Array.from(input.f0).filter((x, i) => x > 0 && mask[i]);
    if (f0.length >= 50) {
      const med = median(f0);
      const st = f0.map((x) => hzToSemitones(x, med));
      f0Range = percentile(st, 90) - percentile(st, 10);
    }
  }

  // --- Pacer (8.3)
  let pacerDev: number | undefined;
  if (input.pacer && words.length) {
    const p = comparePacer(words, input.pacer);
    flags.push(...p.flags);
    if (p.matched) pacerDev = p.meanAbsDevMs;
  }

  // --- Skipped words (reading)
  const skippedFlags: Flag[] = input.skipped.map((s) => {
    const long = [...s.targetText].length >= 3;
    const conf = input.reading && long ? 'high' : 'medium';
    return mkFlag('SKIPPED_WORD', conf === 'high' ? 'red' : 'amber', conf, s.atMs - 150, s.atMs + 150, `Pominięte słowo „${s.targetText}”`, { details: { target: s.targetText } });
  });

  // --- Merge words with skipped ones (for the annotated transcript); remap word indices.
  type Slot = { kind: 'w'; i: number } | { kind: 's'; k: number };
  const slots: Slot[] = words.map((_, i) => ({ kind: 'w', i }));
  input.skipped.forEach((s, k) => {
    let pos = slots.findIndex((sl) => sl.kind === 'w' && (words[sl.i].targetIndex ?? -1) > s.targetIndex);
    if (pos < 0) pos = slots.findIndex((sl) => sl.kind === 'w' && words[sl.i].startMs >= s.atMs);
    if (pos < 0) pos = slots.length;
    slots.splice(pos, 0, { kind: 's', k });
  });
  const remap = new Map<number, number>();
  const skippedPos = new Map<number, number>();
  slots.forEach((sl, idx) => (sl.kind === 'w' ? remap.set(sl.i, idx) : skippedPos.set(sl.k, idx)));
  for (const f of flags) if (f.wordIndex !== undefined) f.wordIndex = remap.get(f.wordIndex);
  skippedFlags.forEach((f, k) => (f.wordIndex = skippedPos.get(k)));
  flags.push(...skippedFlags);

  // Sort flags chronologically; build per-word indices.
  flags.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const outWords: WordAnalysis[] = slots.map((sl, idx) => {
    if (sl.kind === 's') {
      const s = input.skipped[sl.k];
      return {
        index: idx, text: s.targetText, targetText: s.targetText, startMs: s.atMs, endMs: s.atMs,
        syllables: countSyllables(s.targetText), alignScore: 0, units: [], clarity: null, status: 'skipped', flagIndices: [],
      };
    }
    const w = words[sl.i];
    return {
      index: idx, text: w.text, targetText: w.targetText, startMs: Math.round(w.startMs), endMs: Math.round(w.endMs),
      syllables: countSyllables(w.text), alignScore: +w.alignScore.toFixed(3), units: wordUnits[sl.i],
      clarity: statusByWord[sl.i] === 'filler' || statusByWord[sl.i] === 'inserted' ? null : wordClarity(wordUnits[sl.i]),
      status: statusByWord[sl.i], flagIndices: [], boundary: w.boundary, chars: w.chars ?? undefined,
    };
  });
  flags.forEach((f, fi) => { if (f.wordIndex !== undefined && outWords[f.wordIndex]) outWords[f.wordIndex].flagIndices.push(fi); });

  // --- Category GOP
  const catAcc: Partial<Record<UnitCategory, { sum: number; n: number; ok: number }>> = {};
  for (const units of wordUnits) for (const u of units) {
    if (u.status === 'unscorable') continue;
    const a = (catAcc[u.category] ??= { sum: 0, n: 0, ok: 0 });
    a.sum += u.gop; a.n++; if (u.status === 'ok') a.ok++;
  }
  const categoryGop: TrainingSession['categoryGop'] = {};
  for (const [c, a] of Object.entries(catAcc)) categoryGop[c as UnitCategory] = { mean: +(a.sum / a.n).toFixed(3), n: a.n, okRatio: +(a.ok / a.n).toFixed(3) };

  // --- Scores (6)
  const gopScored = input.gopAvailable && input.asrAvailable && !lowSnr;
  const tempoC = tempoScore({ ar: tempo.articulationRate, arRange: input.settings.targetArticulationRate, rushedIpuRatio: tempo.ipuFlagRatio, pacerMeanAbsDevMs: pacerDev });
  let artC: Component | null = null;
  if (input.mode === 'tongue_twisters' && gopScored) {
    const cat = input.dictionCategory;
    const sel = wordUnits.flat().filter((u) => u.status !== 'unscorable' && (
      !cat || cat === 'zbitki' ? true : cat === 'rl' ? ['r', 'l', 'ł'].includes(u.text) : u.category === cat));
    artC = dictionLabScore(sel.filter((u) => u.status === 'ok').length, sel.length);
  } else if (gopScored || (input.asrAvailable && input.skipped.length)) {
    const weighted: Record<string, number> = {};
    for (const f of flags) if (ARTICULATION_TYPES.includes(f.type)) weighted[f.type] = (weighted[f.type] ?? 0) + (f.confidence === 'high' ? 1 : 0.5);
    const scored = outWords.filter((w) => w.clarity !== null || w.status === 'skipped').length;
    if (scored) artC = articulationScore(weighted, scored);
  }
  const fluC = input.asrAvailable
    ? fluencyScore({
      minutes, fillers: fillers.fillerSounds + fillers.fillerWords, noBreathRatio: pauses.noBreathRatio,
      missingPauseRatio: pauses.sentenceBoundaries ? pauses.missingSentencePauses / pauses.sentenceBoundaries : 0,
      hesitations: pauses.hesitations, repetitions: fillers.repetitions,
    })
    : fluencyScore({ minutes, fillers: 0, noBreathRatio: pauses.noBreathRatio, missingPauseRatio: 0, hesitations: 0, repetitions: 0 });
  const prosC = prosodyScore({
    swallowedRatio: prosody.sentences ? prosody.swallowedSentences / prosody.sentences : 0,
    f0RangeSt: f0Range, volumeDecline: prosody.volumeDecline, lowSnr,
  });
  const weights = { ...input.settings.scoreWeights };
  if (!artC) weights.articulation = 0;
  const scores: Scores = {
    tempo: Math.round(tempoC.score),
    articulation: artC ? Math.round(artC.score) : -1,
    fluency: Math.round(fluC.score),
    prosody: Math.round(prosC.score),
    total: 0,
  };
  scores.total = Math.round(totalScore({ ...scores, articulation: artC?.score ?? 0 }, weights));

  // --- Top 3 (7.3)
  const wsum = weights.tempo + weights.articulation + weights.fluency + weights.prosody || 1;
  const lost: Record<string, number> = {};
  const add = (c: Component | null, w: number) => { if (c) for (const [k, v] of Object.entries(c.deductions)) lost[k] = (lost[k] ?? 0) + (v * w) / wsum; };
  add(tempoC, weights.tempo);
  add(artC, weights.articulation);
  add(fluC, weights.fluency);
  add(prosC, weights.prosody);
  if (lost.tooFast && lost.rushed) { lost.tooFast += lost.rushed; delete lost.rushed; }
  const mostCommon = (type: FlagType): UnitCategory | undefined => {
    const cnt = new Map<UnitCategory, number>();
    for (const f of flags) if (f.type === type && f.wordIndex !== undefined && f.unitIndex !== undefined) {
      const u = outWords[f.wordIndex]?.units[f.unitIndex];
      if (u) cnt.set(u.category, (cnt.get(u.category) ?? 0) + 1);
    }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const defs = issueDefs(input, { subCategory: mostCommon('SUBSTITUTED_SOUND'), endCategory: mostCommon('SWALLOWED_WORD_ENDING') });
  const topIssues: TopIssue[] = Object.entries(lost)
    .filter(([k, v]) => v >= 0.5 && defs[k])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => {
      const d = defs[k];
      const idx = flags.map((f, i) => (d.flagTypes.includes(f.type) ? i : -1)).filter((i) => i >= 0)
        .sort((a, b) => (flags[a].severity === flags[b].severity ? 0 : flags[a].severity === 'red' ? -1 : 1))
        .slice(0, 3);
      return { key: k, title: d.title, pointsLost: +v.toFixed(1), flagIndices: idx, exerciseLink: d.link, why: d.why, exercise: d.exercise };
    });

  const metrics: SessionMetrics = {
    speechRate: +tempo.speechRate.toFixed(2),
    articulationRate: +tempo.articulationRate.toFixed(2),
    wpm: Math.round(tempo.wpm),
    longestIpuMs: Math.round(pauses.longestIpuMs),
    meanPauseMs: Math.round(pauses.meanPauseMs),
    fillersPerMinute: +((fillers.fillerSounds + fillers.fillerWords) / Math.max(minutes, 0.25)).toFixed(2),
    f0RangeSemitones: +(f0Range ?? 0).toFixed(1),
    snrDb: +snr.toFixed(1),
  };

  const phrases: PhraseAnalysis[] = phrasesFromIpus(ipus);
  const pauseInfo: PauseInfo[] = pauses.pauses;
  const transcript = words.filter((w) => w.op !== 'ins' || !isFillerToken(w.text)).map((w) => w.text + (w.boundary === 'sentence' ? '.' : w.boundary === 'comma' ? ',' : '')).join(' ');

  return {
    metrics, scores, flags, words: outWords, phrases, topIssues, pauses: pauseInfo, categoryGop,
    liveSyllableRatio: input.liveNuclei > 0 && tempo.totalSyllables > 0 && words.length ? +(tempo.totalSyllables / input.liveNuclei).toFixed(3) : undefined,
    warnings, noiseFloorDb: +input.noiseFloorDb.toFixed(1),
    analysisStatus: input.asrAvailable ? 'complete' : 'pending',
    transcript,
  };
}

/** User baseline from a calibration session (5.11). */
export function baselineFromSession(
  out: Pick<TrainingSession, 'words' | 'metrics' | 'tracks' | 'liveSyllableRatio'>,
  extra: { deviceLabel: string; medianIntensityDb: number; f0MedianHz: number },
): UserBaseline {
  const by: Record<string, number[]> = {};
  for (const w of out.words) for (const u of w.units) if (u.status !== 'unscorable') (by[u.category] ??= []).push(u.gop);
  const gopByCategory = {} as UserBaseline['gopByCategory'];
  for (const c of UNIT_CATEGORIES) {
    const v = by[c] ?? [];
    if (v.length < 5) { gopByCategory[c] = { mean: NaN, sd: 0 }; continue; }
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    gopByCategory[c] = { mean: +m.toFixed(3), sd: +sd.toFixed(3) };
  }
  const real = out.words.filter((w) => w.status !== 'skipped' && w.status !== 'filler' && w.status !== 'inserted');
  const syl = real.reduce((s, w) => s + w.syllables, 0);
  return {
    createdAt: Date.now(),
    deviceLabel: extra.deviceLabel,
    gopByCategory,
    articulationRate: out.metrics.articulationRate || T.defaultBaselineAR,
    medianIntensityDb: extra.medianIntensityDb,
    f0MedianHz: extra.f0MedianHz,
    f0RangeSemitones: out.metrics.f0RangeSemitones,
    syllablesPerWord: real.length ? +(syl / real.length).toFixed(2) : T.defaultSyllablesPerWord,
    liveSyllableCorrection: out.liveSyllableRatio && out.liveSyllableRatio > 0.5 && out.liveSyllableRatio < 2 ? out.liveSyllableRatio : 1,
  };
}
