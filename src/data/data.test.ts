import { describe, expect, it } from 'vitest';
import { EXERCISES, DICTION_CATEGORIES, READING_TEXTS } from './exercises';
import { MINIMAL_PAIRS } from './minimalPairs';
import { CALIBRATION_TEXT } from './calibrationText';
import { BOT_SCENARIOS, nextBotQuestion } from './botScenarios';
import { normalizeText, normalizeWords } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import { splitUnits } from '@/engine/units';

describe('content', () => {
  it('has 50 unique tongue twisters in all categories', () => {
    expect(EXERCISES).toHaveLength(50);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(50);
    for (const c of DICTION_CATEGORIES) expect(EXERCISES.filter((e) => e.category === c.id).length).toBeGreaterThanOrEqual(8);
    for (const e of EXERCISES) expect(normalizeText(e.text).every((t) => !t.unscorable)).toBe(true);
  });

  it('minimal pairs cover the spec examples', () => {
    const all = MINIMAL_PAIRS.map((p) => p.words.join(' '));
    expect(all).toContain('kasza kasa Kasia');
    expect(all).toContain('szyje syje sieje');
  });

  it('calibration text is ~60 s at 4.5 syl/s and covers every category', () => {
    const words = normalizeWords(CALIBRATION_TEXT);
    const syl = countTextSyllables(words);
    expect(syl).toBeGreaterThan(200);
    expect(syl).toBeLessThan(330);
    const counts: Record<string, number> = {};
    for (const w of words) for (const u of splitUnits(w)) counts[u.category] = (counts[u.category] ?? 0) + 1;
    for (const c of ['szumiace', 'syczace', 'ciszace', 'nosowe', 'sonorne', 'samogloski']) expect(counts[c] ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('has 15 unique reading texts that normalize cleanly and fit both reading modes', () => {
    expect(READING_TEXTS).toHaveLength(15);
    expect(new Set(READING_TEXTS.map((t) => t.id)).size).toBe(READING_TEXTS.length);
    expect(new Set(READING_TEXTS.map((t) => t.title)).size).toBe(READING_TEXTS.length);
    expect(new Set(READING_TEXTS.map((t) => t.text)).size).toBe(READING_TEXTS.length);
    for (const t of READING_TEXTS) {
      expect(t.id.trim().length).toBeGreaterThan(0);
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.text.length).toBeLessThanOrEqual(3000);
      const tokens = normalizeText(t.text);
      expect(tokens.length).toBeGreaterThan(40);
      expect(tokens.every((token) => !token.unscorable)).toBe(true);
    }
  });

  it('bot asks follow-ups on keywords, then moves on', () => {
    const sc = BOT_SCENARIOS[0];
    const first = nextBotQuestion(sc, { questionIndex: -1, usedFollowUps: [], lastWasFollowUp: false }, '');
    expect(first?.question).toBe(sc.questions[0]);
    const fu = nextBotQuestion(sc, { questionIndex: 0, usedFollowUps: [], lastWasFollowUp: false }, 'Pracowałem w zespole przy dużym projekcie dla banku przez trzy lata i bardzo to lubiłem');
    expect(fu?.followUp).toBe(0);
    const nxt = nextBotQuestion(sc, { questionIndex: 0, usedFollowUps: [0], lastWasFollowUp: true }, 'cokolwiek');
    expect(nxt?.question).toBe(sc.questions[1]);
    expect(nextBotQuestion(sc, { questionIndex: sc.questions.length - 1, usedFollowUps: [], lastWasFollowUp: true }, '')).toBeNull();
  });
});
