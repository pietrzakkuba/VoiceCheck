import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BreathBar } from './BreathBar';

describe('stable breath panel', () => {
  it.each([
    ['ok', 0, 'Rób krótkie pauzy'],
    ['warn', 7000, 'Zaplanuj oddech'],
    ['critical', 9000, 'Weź oddech!'],
  ] as const)('keeps fixed slots without wrapping or pulsing in the %s state', (state, runMs, label) => {
    const html = renderToStaticMarkup(<BreathBar runMs={runMs} maxMs={8000} state={state} />);
    expect(html).toContain('flex h-6');
    expect(html).toContain('h-12 whitespace-nowrap');
    expect(html).toContain('h-7 truncate');
    expect(html).toContain(label);
    expect(html).not.toMatch(/animate-|pulse|flex-wrap/);
    expect(html).toContain(`aria-valuenow="${Math.min(runMs / 1000, 8)}"`);
    expect(html).toContain(`style="width:${Math.min(runMs / 8000 * 100, 100)}%"`);
  });

  it.each(['Uruchamianie…', 'Kalibracja…', 'Analizowanie…'])('retains the same layout during %s without stale readings', (inactiveLabel) => {
    const html = renderToStaticMarkup(<BreathBar runMs={9000} maxMs={8000} state="critical" inactiveLabel={inactiveLabel} />);
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain(`aria-valuetext="${inactiveLabel}"`);
    expect(html).toContain('style="width:0%"');
    expect(html).toContain('flex h-6');
    expect(html).toContain('h-12 whitespace-nowrap');
    expect(html).toContain('h-7 truncate');
    expect(html).not.toContain('text-bad');
    expect(html).not.toContain('Weź oddech!');
  });
});
