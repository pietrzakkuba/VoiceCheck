import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HudCard } from './LiveHud';

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
});
