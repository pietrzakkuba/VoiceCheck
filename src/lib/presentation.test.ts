import { describe, expect, it } from 'vitest';
import { formatDuration, minutesInput, parseMinutes, textStats } from './presentation';

describe('presentation helpers', () => {
  it('counts words and estimates speaking time at the target rate', () => {
    const s = textStats('Dzień dobry państwu', [4, 6]);
    expect(s.words).toBe(3);
    expect(s.syllables).toBeGreaterThan(0);
    expect(s.estimatedSeconds).toBe(Math.round(s.syllables / 5));
    expect(textStats('   ', [4, 6])).toEqual({ words: 0, syllables: 0, estimatedSeconds: 0 });
  });

  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(600)).toBe('10:00');
  });

  it('parses minutes with comma or dot and rejects invalid values', () => {
    expect(parseMinutes('')).toBeUndefined();
    expect(parseMinutes('5')).toBe(300);
    expect(parseMinutes('2,5')).toBe(150);
    expect(parseMinutes('2.5')).toBe(150);
    expect(parseMinutes('0')).toBeNull();
    expect(parseMinutes('abc')).toBeNull();
    expect(parseMinutes('-1')).toBeNull();
  });

  it('round-trips minutes for the editor input', () => {
    expect(minutesInput(undefined)).toBe('');
    expect(minutesInput(150)).toBe('2,5');
    expect(parseMinutes(minutesInput(150))).toBe(150);
  });
});
