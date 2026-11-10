// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HudCard } from './LiveHud';
import type { LiveStats } from '@/audio/liveAnalyzer';

describe('HUD breath indicator', () => {
  const props = { stats: null, getDb: () => null, getSpeaking: () => false };

  it('keeps the breath indicator by default for calibration', () => {
    const html = renderToStaticMarkup(<HudCard {...props} />);
    expect(html).toContain('role="meter"');
  });

  it('hides the duplicate breath indicator and speedometer while keeping the waveform', () => {
    const html = renderToStaticMarkup(<HudCard {...props} showBreath={false} />);
    expect(html).not.toContain('role="meter"');
    expect(html).not.toContain('Oddech');
    expect(html).not.toContain('Tempo: za mało danych');
    expect(html).not.toContain('<svg viewBox="0 0 200 110"');
    expect(html).toContain('<canvas');
    expect(html).toContain('SNR:');
  });

  it('hides duplicate mobile diagnostics and calibration but keeps audio warnings visible', () => {
    const html = renderToStaticMarkup(<HudCard
      {...props}
      compactMobile
      showBreath={false}
      stats={{
        elapsedMs: 1000, calibrating: true, levelDb: -20, noiseFloorDb: -20,
        snrDb: 0, speaking: false, syllableRate: null, wpm: null,
        breathRunMs: 0, breathState: 'ok', clipping: true, speechMs: 0, syllables: 0,
      } satisfies LiveStats}
    />);
    expect(html).toContain('live-hud-compact-mobile-details');
    expect(html).toContain('mierzę szum tła');
    expect(html).toContain('Duży szum tła');
    expect(html).toContain('Przesterowanie!');
    const host = document.createElement('div');
    host.innerHTML = html;
    const alerts = Array.from(host.querySelectorAll('[role="alert"]'));
    expect(alerts).toHaveLength(3);
    expect(alerts[0].classList.contains('live-hud-compact-mobile-details')).toBe(true);
    for (const warning of alerts.slice(1)) {
      expect(warning.closest('.live-hud-compact-mobile-details')).toBeNull();
    }
    expect(host.querySelector('canvas')?.closest('.live-hud-compact-mobile-details')).not.toBeNull();
    expect(renderToStaticMarkup(<HudCard {...props} />)).not.toContain('live-hud-compact-mobile-details');
  });

  it.each([false, true])('has no visible mobile diagnostic alerts while calibrating=%s without audio warnings', (calibrating) => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(<HudCard
      {...props}
      compactMobile
      showBreath={false}
      stats={{
        elapsedMs: 1000, calibrating, levelDb: -20, noiseFloorDb: -60,
        snrDb: 40, speaking: false, syllableRate: null, wpm: null,
        breathRunMs: 0, breathState: 'ok', clipping: false, speechMs: 0, syllables: 0,
      }}
    />);
    expect(host.querySelector('[role="alert"]:not(.live-hud-compact-mobile-details)')).toBeNull();
  });
});
