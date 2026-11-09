import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Presentation, TrainingSession } from '@/types';
import Dashboard from './Dashboard';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: mocks.query,
}));

const presentation: Presentation = {
  id: 'p1', title: 'Wyniki kwartalne', text: 'Dzień dobry.', createdAt: 1, updatedAt: 1,
};

function renderDashboard(items: Presentation[] | undefined) {
  mocks.query
    .mockReturnValueOnce([])
    .mockReturnValueOnce(items ?? [])
    .mockReturnValueOnce(null)
    .mockReturnValueOnce(items);
  return renderToStaticMarkup(<MemoryRouter><Dashboard /></MemoryRouter>);
}

describe('dashboard presentations', () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it('shows presentation actions above session history without progress charts', () => {
    const html = renderDashboard([presentation]);
    expect(html).toContain('Wyniki kwartalne');
    expect(html).toContain('href="/presentations/new"');
    expect(html).toContain('href="/presentations/p1/rehearse"');
    expect(html).toContain('href="/presentations/p1"');
    expect(html).toContain('href="/presentations/p1/history"');
    expect(html).toContain('href="/calibration"');
    expect(html).toContain('href="/speaking"');
    expect(html.indexOf('Swobodne mówienie')).toBeLessThan(html.indexOf('Wyniki kwartalne'));
    expect(html.indexOf('Wyniki kwartalne')).toBeLessThan(html.indexOf('Historia sesji'));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toContain('href="/presentations"');
    expect(html).not.toContain('Wykresy postępów');
    expect(html).not.toContain('id="session-history"');
  });

  it('keeps creating a presentation available when the library is empty', () => {
    const html = renderDashboard([]);
    expect(html).toContain('Brak prezentacji');
    expect(html).toContain('href="/presentations/new"');
    expect(html).toContain('Historia sesji');
  });

  it('does not show an empty-library message while presentations are loading', () => {
    const html = renderDashboard(undefined);
    expect(html).not.toContain('Brak prezentacji');
    expect(html).toContain('href="/presentations/new"');
    expect(html).toContain('Historia sesji');
  });

  it('makes sessions beyond the old fifty-session limit reachable and updates the empty state', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let items: TrainingSession[] = Array.from({ length: 51 }, (_, i) => ({
      schema: 2, id: `s${i}`, mode: 'free_speech', timestamp: 100000 - i * 1000,
      deviceLabel: '', durationSeconds: 65, audioKey: `audio-s${i}`, noiseFloorDb: -60,
      settings: { targetArticulationRate: [4.5, 5.5], maxContinuousSpeechSeconds: 8, syllableCorrection: 1, syllablesPerWord: 2 },
      metrics: {
        articulationRate: 5, speechRate: 4, wpm: 120, syllables: 100, speechMs: 20000,
        phraseCount: 2, breathCount: 1, breathsPerMinute: 3, longestPhraseMs: 10000,
        meanPhraseMs: 10000, overLimitPhrases: 1, fastPhrases: 0, meanPauseMs: 1000, snrDb: 40,
      },
      phrases: [], pauses: [], tips: [], tracks: { waveform: [], speechSegments: [], nucleiMs: [] }, warnings: [],
    }));
    let queryIndex = 0;
    mocks.query.mockImplementation(() => [items, [], null, []][queryIndex++ % 4]);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<MemoryRouter><Dashboard /></MemoryRouter>));
      expect(host.textContent).toContain('51 sesji');
      expect(host.querySelectorAll('a[href^="/session/"]')).toHaveLength(10);
      for (let i = 0; i < 5; i++) {
        const next = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Następna')!;
        await act(async () => next.click());
      }
      expect(host.querySelector('a[href="/session/s50"]')).not.toBeNull();
      expect(host.querySelector('button[aria-label^="Usuń sesję:"]')).not.toBeNull();
      items = [];
      await act(async () => root.render(<MemoryRouter><Dashboard /></MemoryRouter>));
      expect(host.textContent).toContain('0 sesji');
      expect(host.textContent).toContain('Brak sesji.');
      expect(host.querySelector('nav')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
