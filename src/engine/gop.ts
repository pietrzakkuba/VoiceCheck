import type { AlignedChar, FlagType, UnitAnalysis, UnitCategory, UnitStatus, UserBaseline } from '@/types';
import { UNIT_CATEGORIES } from '@/types';
import { T } from './thresholds';
import { competitorToPhone, isDictionPair, splitUnits, type Unit } from './units';

export type TauTable = Record<UnitCategory, number>;

/** τ_cat = max(μ_cat − 2σ_cat, τ_abs); without a baseline only τ_abs is used (5.11). */
export function tauTable(baseline: UserBaseline | null, tauAbs: number = T.tauAbs): TauTable {
  const out = {} as TauTable;
  for (const c of UNIT_CATEGORIES) {
    const g = baseline?.gopByCategory?.[c];
    out[c] = g && Number.isFinite(g.mean) && g.sd > 0 ? Math.max(g.mean - 2 * g.sd, tauAbs) : tauAbs;
  }
  return out;
}

const SEVERITY: Record<UnitStatus, number> = { ok: 0, weak: 1, substituted: 2, deleted: 3, unscorable: -1 };

function charStatus(c: AlignedChar, unit: Unit, offset: number, tau: number): { status: UnitStatus; heardAs?: string } {
  if (c.pTarget < T.deletedP) {
    const phone = competitorToPhone(unit, offset, c.segBest);
    if (c.segBestP >= T.substituteMinCompP && isDictionPair(unit.text, phone)) return { status: 'substituted', heardAs: phone };
    return { status: 'deleted' };
  }
  if (c.gop < 0) {
    const phone = competitorToPhone(unit, offset, c.competitor);
    if (isDictionPair(unit.text, phone)) return { status: 'substituted', heardAs: phone };
  }
  const tauEff = tau - (unit.relaxed ? T.finalDevoicingTauRelax : 0);
  if (c.gop < tauEff || c.pTarget < T.weakPTarget) return { status: 'weak' };
  return { status: 'ok' };
}

/** Unit-level statuses from character evidence (5.7). Unit status = worst status of its characters. */
export function analyzeUnits(word: string, chars: AlignedChar[] | null, tau: TauTable, unscorable: boolean): UnitAnalysis[] {
  const units = splitUnits(word);
  return units.map((u) => {
    const cs = chars ? chars.slice(u.start, u.end) : [];
    if (unscorable || !cs.length) {
      return {
        text: u.text, category: u.category,
        startMs: cs[0]?.startMs ?? 0, endMs: cs[cs.length - 1]?.endMs ?? 0,
        gop: 0, pTarget: 0, status: 'unscorable' as const,
      };
    }
    const st = cs.map((c, k) => charStatus(c, u, k, tau[u.category]));
    let worst = st[0];
    for (const s of st) if (SEVERITY[s.status] > SEVERITY[worst.status]) worst = s;

    // Digraph / softened unit whose second letter vanished while the first is fine → heard the plain consonant.
    const isSoft = u.text !== u.spelled && ['ś', 'ć', 'ź', 'ń', 'dź'].includes(u.text) && u.spelled.endsWith('i');
    if ((u.text === 'sz' || u.text === 'cz' || isSoft) && st.length >= 2 && st[0].status === 'ok' && (st[st.length - 1].status === 'deleted' || st[st.length - 1].status === 'weak')) {
      const plain = isSoft ? u.spelled.slice(0, -1) : u.spelled[0];
      if (isDictionPair(u.text, plain)) worst = { status: 'substituted', heardAs: plain };
    }
    return {
      text: u.text,
      category: u.category,
      startMs: cs[0].startMs,
      endMs: cs[cs.length - 1].endMs,
      gop: Math.min(...cs.map((c) => c.gop)),
      pTarget: Math.min(...cs.map((c) => c.pTarget)),
      heardAs: worst.heardAs,
      status: worst.status,
    };
  });
}

const UNIT_SCORE: Record<UnitStatus, number> = { ok: 1, weak: 0.5, substituted: 0.25, deleted: 0, unscorable: 1 };

export function wordClarity(units: UnitAnalysis[]): number | null {
  const scored = units.filter((u) => u.status !== 'unscorable');
  if (!scored.length) return null;
  return Math.round((100 * scored.reduce((s, u) => s + UNIT_SCORE[u.status], 0)) / scored.length);
}

export interface ArticulationFlag {
  type: Extract<FlagType, 'MUMBLED_WORD' | 'SWALLOWED_WORD_ENDING' | 'SUBSTITUTED_SOUND'>;
  unitIndex?: number;
  message: string;
  details: Record<string, string | number>;
  minGop: number;
}

const isBad = (s: UnitStatus) => s === 'weak' || s === 'deleted' || s === 'substituted';

/** Word-level articulation flags (5.7). At most one articulation flag per word – the most specific one. */
export function articulationFlag(word: string, units: UnitAnalysis[]): ArticulationFlag | null {
  if (units.length < 3 || units.some((u) => u.status === 'unscorable')) return null;
  const badIdx = units.map((u, i) => (isBad(u.status) ? i : -1)).filter((i) => i >= 0);
  if (!badIdx.length) return null;
  const minGop = Math.min(...badIdx.map((i) => units[i].gop));
  const n = units.length;

  if (badIdx.length === 1 && units[badIdx[0]].status === 'substituted' && units[badIdx[0]].heardAs) {
    const u = units[badIdx[0]];
    return {
      type: 'SUBSTITUTED_SOUND',
      unitIndex: badIdx[0],
      message: `„${word}”: usłyszano [${u.heardAs}] zamiast [${u.text}]`,
      details: { target: u.text, heard: u.heardAs!, category: u.category },
      minGop,
    };
  }
  const endingBad = badIdx.filter((i) => i >= n - 2);
  if ([...word].length >= 4 && endingBad.length && endingBad.length === badIdx.length) {
    const i = endingBad[0];
    const ending = units.slice(n - 2).map((u) => u.text).join('');
    const deleted = endingBad.some((k) => units[k].status === 'deleted');
    return {
      type: 'SWALLOWED_WORD_ENDING',
      unitIndex: i,
      message: `„${word}”: końcówka -${ending} ${deleted ? 'pominięta' : 'niewyraźna'}`,
      details: { ending, unit: units[i].text },
      minGop,
    };
  }
  if (badIdx.length >= T.mumbledMinUnits || badIdx.length / n >= T.mumbledRatio) {
    const list = badIdx.map((i) => `[${units[i].text}]`).join(', ');
    return {
      type: 'MUMBLED_WORD',
      unitIndex: badIdx[0],
      message: `„${word}”: niewyraźne słowo – ${list} ${badIdx.length > 1 ? 'niewyraźne' : 'niewyraźna'}`,
      details: { badUnits: badIdx.length, units: n },
      minGop,
    };
  }
  return null;
}

/** Human-readable explanation for a unit, used in the word details panel. */
export function describeUnit(u: UnitAnalysis): string {
  switch (u.status) {
    case 'ok': return `[${u.text}] wyraźne`;
    case 'weak': return `[${u.text}] niewyraźne`;
    case 'substituted': return `[${u.text}] – usłyszano bliżej [${u.heardAs}]`;
    case 'deleted': return `[${u.text}] pominięte`;
    default: return `[${u.text}] – nie oceniono`;
  }
}
