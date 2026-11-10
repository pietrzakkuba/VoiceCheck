// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import type { TrainingSession } from '@/types';
import History from './History';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mocks.query }));
vi.mock('@/components/CalibrationPrompt', () => ({ CalibrationPrompt: () => null }));

function session(i: number): TrainingSession {
  return {
    schema: 2, id: `s${i}`, mode: 'free_speech', timestamp: 100000 - i * 1000,
    deviceLabel: '', durationSeconds: 65, audioKey: `audio-s${i}`, noiseFloorDb: -60,
    settings: { targetArticulationRate: [4.5, 5.5], maxContinuousSpeechSeconds: 8, syllableCorrection: 1, syllablesPerWord: 2 },
    metrics: {
      articulationRate: 5, speechRate: 4, wpm: 120, syllables: 100, speechMs: 20000,
      phraseCount: 2, breathCount: 1, breathsPerMinute: 3, longestPhraseMs: 10000,
      meanPhraseMs: 10000, overLimitPhrases: 1, fastPhrases: 0, meanPauseMs: 1000, snrDb: 40,
    },
    phrases: [], pauses: [], tips: [], tracks: { waveform: [], speechSegments: [], nucleiMs: [] }, warnings: [],
  };
}

describe('history tab', () => {
  it('pages through all sessions, allows deleting them and shows the empty state', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let items: TrainingSession[] = Array.from({ length: 51 }, (_, i) => session(i));
    let queryIndex = 0;
    mocks.query.mockImplementation(() => [items, [], null][queryIndex++ % 3]);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<MemoryRouter><History /></MemoryRouter>));
      expect(host.querySelectorAll('h1')).toHaveLength(1);
      expect(host.textContent).toContain('Historia sesji');
      expect(host.textContent).toContain('51 sesji');
      expect(host.querySelectorAll('a[href^="/session/"]')).toHaveLength(10);
      for (let i = 0; i < 5; i++) {
        const next = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Następna')!;
        await act(async () => next.click());
      }
      expect(host.querySelector('a[href="/session/s50"]')).not.toBeNull();
      expect(host.querySelector('button[aria-label^="Usuń sesję:"]')).not.toBeNull();
      items = [];
      await act(async () => root.render(<MemoryRouter><History /></MemoryRouter>));
      expect(host.textContent).toContain('0 sesji');
      expect(host.textContent).toContain('Brak sesji.');
      expect(host.querySelector('nav')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
