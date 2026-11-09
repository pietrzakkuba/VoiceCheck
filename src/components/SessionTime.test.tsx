import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionTime } from './SessionTime';

describe('session time', () => {
  it('shows elapsed time without a limit', () => {
    const html = renderToStaticMarkup(<SessionTime seconds={65.9} />);
    expect(html).toContain('1:05');
    expect(html).not.toContain('Pozostało');
    expect(html).not.toContain('Przekroczono');
  });

  it.each([
    [0, 'Pozostało 5:00'],
    [299.9, 'Pozostało 0:01'],
    [300, 'Pozostało 0:00'],
    [301, 'Przekroczono o 0:01'],
    [365, 'Przekroczono o 1:05'],
  ])('compares %s seconds with the recorded limit', (seconds, message) => {
    const html = renderToStaticMarkup(<SessionTime seconds={seconds} targetSeconds={300} />);
    expect(html).toContain(message);
    expect(html).toContain('/ 5:00');
    expect(html.includes('text-bad')).toBe(seconds > 300);
  });

  it.each([299, 301])('keeps the compact timer on a fixed-height row at %s seconds', (seconds) => {
    const html = renderToStaticMarkup(<SessionTime seconds={seconds} targetSeconds={300} compact />);
    expect(html).toContain('flex h-8 items-center');
    expect(html).toContain('shrink-0 whitespace-nowrap');
    expect(html).toContain('role="timer" aria-label="Czas sesji"');
    expect(html).toContain('class="sr-only">Łącznie z pauzami');
    expect(html).toContain(seconds > 300 ? 'Przekroczono o 0:01' : 'Pozostało 0:01');
  });
});
