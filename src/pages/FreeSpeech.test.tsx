// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LiveStats } from '@/audio/liveAnalyzer';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import type { TrainingSession } from '@/types';
import { db, deleteSessions } from '@/store/db';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import FreeSpeech from './FreeSpeech';

const mocks = vi.hoisted(() => ({
  phase: 'idle' as SessionPhase,
  stats: null as LiveStats | null,
  start: vi.fn(),
  sessions: [] as TrainingSession[],
  query: undefined as (() => Promise<TrainingSession[]>) | undefined,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (query: () => Promise<TrainingSession[]>) => {
    mocks.query = query;
    return mocks.sessions;
  },
}));
vi.mock('@/components/CalibrationPrompt', () => ({ CalibrationPrompt: () => null }));
vi.mock('dexie', () => ({
  default: class {
    sessions = {
      where: vi.fn(),
      toCollection: () => ({
        reverse() { return this; },
        sortBy: vi.fn(),
      }),
    };
    version() { return { stores: () => ({ upgrade: vi.fn() }) }; }
  },
}));
vi.mock('@/store/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/store/db')>(),
  deleteSessions: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/hooks/useTrainingSession', () => ({
  useTrainingSession: () => ({
    phase: mocks.phase,
    stats: mocks.stats,
    error: null,
    deviceWarning: null,
    start: mocks.start,
  }),
}));
vi.mock('@/components/audio/LiveHud', () => ({
  RecordControls: ({ onStart }: { onStart: () => void }) => {
    onStart();
    return <button>Nagrywanie</button>;
  },
  HudCard: () => <div>Live HUD</div>,
  SessionErrors: () => null,
}));

function liveStats(rate: number | null): LiveStats {
  return {
    elapsedMs: 65000,
    calibrating: false,
    levelDb: -20,
    noiseFloorDb: -60,
    snrDb: 40,
    speaking: true,
    syllableRate: rate,
    wpm: rate === null ? null : rate * 30,
    breathRunMs: 1000,
    breathState: 'ok',
    clipping: false,
    speechMs: 3000,
    syllables: 15,
  };
}

describe('free speech', () => {
  beforeEach(() => {
    mocks.phase = 'idle';
    mocks.stats = null;
    mocks.start.mockClear();
    mocks.sessions = [];
    mocks.query = undefined;
    vi.mocked(deleteSessions).mockReset().mockResolvedValue(undefined);
  });

  it('explains the mode before recording without live panels', () => {
    const html = renderToStaticMarkup(<FreeSpeech />);
    expect(html).toContain('Swobodne mówienie');
    expect(html).not.toContain('Strona główna');
    expect(html).not.toContain('recording-active');
    expect(html).not.toContain('Tempo czytania');
    expect(html).not.toContain('Live HUD');
  });

  it('records a free_speech session without text or time limit', () => {
    renderToStaticMarkup(<FreeSpeech />);
    expect(mocks.start).toHaveBeenCalledWith({ mode: 'free_speech', language: 'pl' });
  });

  it('removes the wake lock option and does not request a lock on mobile', async () => {
    const request = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.phase = 'recording';
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(<FreeSpeech />));
      expect(host.querySelector('#keep-screen-awake')).toBeNull();
      expect(host.textContent).not.toContain('Nie wygaszaj ekranu');
      expect(request).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      delete (navigator as { wakeLock?: unknown }).wakeLock;
      vi.unstubAllGlobals();
    }
  });

  it('queries only free speech sessions, newest first', async () => {
    const collection = db.sessions.toCollection();
    const where = vi.spyOn(db.sessions, 'where').mockReturnValue(collection);
    const reverse = vi.spyOn(collection, 'reverse');
    const sortBy = vi.spyOn(collection, 'sortBy').mockResolvedValue([]);
    try {
      renderToStaticMarkup(<FreeSpeech />);
      expect(await mocks.query?.()).toEqual([]);
      expect(where).toHaveBeenCalledWith({ mode: 'free_speech' });
      expect(reverse).toHaveBeenCalledOnce();
      expect(sortBy).toHaveBeenCalledWith('timestamp');
    } finally {
      where.mockRestore();
      reverse.mockRestore();
      sortBy.mockRestore();
    }
  });

  it('shows an empty history with bulk deletion disabled', () => {
    const html = renderToStaticMarkup(<FreeSpeech />);
    expect(html).toContain('Historia swobodnego mówienia');
    expect(html).toContain('Brak sesji swobodnego mówienia.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Usuń wszystkie sesje/);
  });

  it('deletes only free speech history after confirmation, including sessions beyond the first page', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.sessions = Array.from({ length: 11 }, (_, i): TrainingSession => ({
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
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<FreeSpeech />));
      expect(host.querySelectorAll('a[href^="/session/"]')).toHaveLength(10);
      expect(host.textContent).toContain('11 sesji');
      const next = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Następna')!;
      await act(async () => next.click());
      expect(host.querySelector('a[href="/session/s10"]')).not.toBeNull();
      const trigger = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Usuń wszystkie sesje'))!;
      await act(async () => trigger.click());
      expect(deleteSessions).not.toHaveBeenCalled();
      expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Wszystkie sesje swobodnego mówienia');
      const confirm = document.querySelector<HTMLButtonElement>('[role="alertdialog"] button:last-child')!;
      await act(async () => confirm.click());
      expect(deleteSessions).toHaveBeenCalledExactlyOnceWith({ mode: 'free_speech' });
      mocks.sessions = [];
      await act(async () => root.render(<FreeSpeech />));
      expect(host.textContent).toContain('Brak sesji swobodnego mówienia.');
      expect(trigger.disabled).toBe(true);
      expect(host.querySelector('nav')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it('shows pace, breath and elapsed time without a limit during recording', () => {
    mocks.phase = 'recording';
    mocks.stats = { ...liveStats(7), breathState: 'warn', breathRunMs: 7000 };
    const html = renderToStaticMarkup(<FreeSpeech />);
    expect(html).toContain('recording-active');
    expect(html).toContain('Tempo czytania');
    expect(html).toContain('<span role="status">Za szybko!</span>');
    expect(html).toContain('role="meter"');
    expect(html).toContain('role="timer"');
    expect(html).toContain('1:05');
    expect(html).not.toContain('Pozostało');
    expect(html).toContain('border-current py-0 transition-colors duration-300 text-bad');
    expect(html).toContain('Live HUD');
    expect(html).not.toContain('Historia swobodnego mówienia');
    expect(html).not.toContain('Usuń wszystkie sesje');
  });

  it.each(['starting', 'processing'] as const)('hides history while %s', (phase) => {
    mocks.phase = phase;
    expect(renderToStaticMarkup(<FreeSpeech />)).not.toContain('Historia swobodnego mówienia');
  });

  describe('keeping the screen awake', () => {
    afterEach(() => {
      delete (navigator as { wakeLock?: unknown }).wakeLock;
      useSettings.getState().set({ keepScreenAwake: DEFAULT_SETTINGS.keepScreenAwake });
    });

    async function render() {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      const host = document.createElement('div');
      const root = createRoot(host);
      await act(async () => root.render(<FreeSpeech />));
      return { host, rerender: () => act(async () => root.render(<FreeSpeech />)), unmount: () => act(async () => root.unmount()) };
    }

    it('holds a screen wake lock only while recording when the option is on', async () => {
      const released: boolean[] = [];
      const request = vi.fn(async () => {
        const i = released.push(false) - 1;
        return { get released() { return released[i]; }, release: vi.fn(async () => { released[i] = true; }), addEventListener: vi.fn() };
      });
      Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
      const page = await render();
      expect(page.host.querySelector('#keep-screen-awake')?.getAttribute('aria-checked')).toBe('true');
      expect(request).not.toHaveBeenCalled();
      mocks.phase = 'recording';
      await page.rerender();
      expect(request).toHaveBeenCalledWith('screen');
      expect(released).toEqual([false]);
      await act(async () => useSettings.getState().set({ keepScreenAwake: false }));
      expect(released).toEqual([true]);
      expect(page.host.querySelector('#keep-screen-awake')?.getAttribute('aria-checked')).toBe('false');
      await page.unmount();
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('disables the option when the browser does not support it', async () => {
      const page = await render();
      expect(page.host.querySelector<HTMLButtonElement>('#keep-screen-awake')?.disabled).toBe(true);
      await page.unmount();
    });
  });
});
