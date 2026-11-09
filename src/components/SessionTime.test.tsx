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
    [-1, '0:00'],
    [0, '0:00'],
    [299.9, '4:59'],
    [300, '5:00'],
    [301, '5:01'],
    [365, '6:05'],
  ])('shows %s seconds as elapsed time without warnings', (seconds, elapsed) => {
    const html = renderToStaticMarkup(<SessionTime seconds={seconds} />);
    expect(html).toContain(elapsed);
    expect(html).not.toContain('Pozostało');
    expect(html).not.toContain('Przekroczono');
    expect(html).not.toContain('text-bad');
  });

  it.each([299, 301])('keeps the compact timer on a fixed-height row at %s seconds', (seconds) => {
    const html = renderToStaticMarkup(<SessionTime seconds={seconds} compact />);
    expect(html).toContain('flex h-8 items-center');
    expect(html).toContain('shrink-0 whitespace-nowrap');
    expect(html).toContain('role="timer" aria-label="Czas sesji"');
    expect(html).toContain('class="sr-only">Łącznie z pauzami');
    expect(html).toContain(seconds > 300 ? '5:01' : '4:59');
    expect(html).not.toContain('Pozostało');
    expect(html).not.toContain('Przekroczono');
  });
});
