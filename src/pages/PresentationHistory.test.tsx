import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { getPresentation, listSessions } from '@/store/db';
import type { Presentation, TrainingSession } from '@/types';
import PresentationHistory from './PresentationHistory';
import { PresentationList } from '@/components/PresentationList';
import { SessionList } from '@/components/SessionList';
import { formatMs } from '@/lib/utils';

const presentation: Presentation = {
  id: 'p1', title: 'Wyniki kwartalne', text: 'Dzień dobry.', createdAt: 1, updatedAt: 1,
};

function session(id: string): TrainingSession {
  return {
    schema: 2, id, presentationId: 'p1', mode: 'presentation', timestamp: 1000,
    deviceLabel: '', durationSeconds: 65, audioKey: id, noiseFloorDb: -60,
    settings: { targetArticulationRate: [4.5, 5.5], maxContinuousSpeechSeconds: 8, syllableCorrection: 1, syllablesPerWord: 2 },
    metrics: {
      articulationRate: 5, speechRate: 4, wpm: 120, syllables: 100, speechMs: 20000,
      phraseCount: 2, breathCount: 1, breathsPerMinute: 3, longestPhraseMs: 10000,
      meanPhraseMs: 10000, overLimitPhrases: 1, fastPhrases: 0, meanPauseMs: 1000, snrDb: 40,
    },
    phrases: [], pauses: [], tips: [], tracks: { waveform: [], speechSegments: [], nucleiMs: [] }, warnings: [],
  };
}

const mocks = vi.hoisted(() => ({
  data: undefined as unknown,
  id: 'p1',
  query: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (query: () => Promise<unknown>) => {
    mocks.query = query;
    return mocks.data;
  },
}));

vi.mock('@/store/db', () => ({
  getPresentation: vi.fn(),
  listSessions: vi.fn(),
  listPresentations: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router')>(),
  useParams: () => ({ id: mocks.id }),
}));

function renderHistory() {
  return renderToStaticMarkup(<MemoryRouter><PresentationHistory /></MemoryRouter>);
}

describe('presentation history', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.data = { presentation, sessions: [] };
    mocks.id = 'p1';
    mocks.query = undefined;
  });

  it('links each presentation card to its own history', () => {
    mocks.data = [presentation, { ...presentation, id: 'p2', title: 'Druga prezentacja' }];
    const html = renderToStaticMarkup(<MemoryRouter><PresentationList /></MemoryRouter>);
    expect(html).toContain('href="/presentations/p1/history"');
    expect(html).toContain('href="/presentations/p2/history"');
    expect(html).toContain('aria-label="Historia prezentacji Wyniki kwartalne"');
  });

  it('shows loading and missing-presentation states', () => {
    mocks.data = undefined;
    expect(renderHistory()).toContain('aria-label="Ładowanie"');
    mocks.data = null;
    const html = renderHistory();
    expect(html).toContain('Nie znaleziono tej prezentacji');
    expect(html).toContain('href="/presentations"');
    expect(html).not.toContain('href="/presentations/p1/rehearse"');
  });

  it('shows an empty history with a rehearsal link', () => {
    const html = renderHistory();
    expect(html).toContain('Wyniki kwartalne');
    expect(html).toContain('Brak sesji tej prezentacji');
    expect(html).toContain('Kliknij „Prezentuj”, aby nagrać pierwszą sesję.');
    expect(html).toContain('Prezentuj</a>');
    expect(html).not.toContain('Ćwicz');
    expect(html).toContain('href="/presentations/p1/rehearse?start=1"');
  });

  it('shows the first page with report links and metrics and counts all rehearsals', () => {
    mocks.data = { presentation, sessions: Array.from({ length: 51 }, (_, i) => session(`s${i}`)) };
    const html = renderHistory();
    expect(html).toContain('51 sesji');
    expect(html.match(/href="\/session\//g)).toHaveLength(10);
    expect(html).not.toContain('href="/session/s50"');
    expect(html).toContain('Strona 1 z 6');
    expect(html).toContain('5,0 syl/s');
    expect(html).toContain('Fragmenty za długo bez oddechu');
    expect(html).toContain(new Date(1000).toLocaleString('pl-PL'));
    expect(html.match(/Wyniki kwartalne/g)).toHaveLength(1);
    expect(html).not.toContain('>Próba prezentacji');
    expect(html.match(/<time /g)).toHaveLength(10);
    expect(html).toContain(`dateTime="${new Date(1000).toISOString()}"`);
    expect(html).toContain(`Czas trwania: ${formatMs(65000)}`);
  });

  it('keeps presentation titles and session modes in the general history', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <SessionList sessions={[session('s1')]} titles={new Map([[presentation.id, presentation.title]])} />
      </MemoryRouter>,
    );
    expect(html).toContain('Próba prezentacji: Wyniki kwartalne');
    expect(html).toContain(new Date(1000).toLocaleString('pl-PL'));
    expect(html).toContain('href="/session/s1"');
    expect(html).toContain('5,0 syl/s');
  });

  it('queries only this presentation, newest first', async () => {
    vi.mocked(getPresentation).mockResolvedValue(presentation);
    vi.mocked(listSessions).mockResolvedValue([session('newest'), session('oldest')]);

    renderHistory();
    const result = await mocks.query?.();
    expect(getPresentation).toHaveBeenCalledWith('p1');
    expect(listSessions).toHaveBeenCalledWith('p1');
    expect(result).toEqual({ presentation, sessions: [session('newest'), session('oldest')] });
  });

  it('navigates the whole presentation history and resets the page for another presentation', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = async () => {
      await act(async () => root.render(<MemoryRouter><PresentationHistory /></MemoryRouter>));
    };
    try {
      mocks.data = { presentation, sessions: Array.from({ length: 51 }, (_, i) => session(`s${i}`)) };
      await render();
      for (let i = 0; i < 5; i++) {
        const next = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Następna')!;
        await act(async () => next.click());
      }
      expect(host.querySelector('a[href="/session/s50"]')).not.toBeNull();
      expect(host.textContent).toContain('Strona 6 z 6');
      mocks.id = 'p2';
      mocks.data = { presentation: { ...presentation, id: 'p2' }, sessions: Array.from({ length: 11 }, (_, i) => session(`other${i}`)) };
      await render();
      expect(host.textContent).toContain('Strona 1 z 2');
      expect(host.querySelector('a[href="/session/other0"]')).not.toBeNull();
      mocks.data = { presentation: { ...presentation, id: 'p2' }, sessions: [] };
      await render();
      expect(host.textContent).toContain('Brak sesji tej prezentacji');
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
