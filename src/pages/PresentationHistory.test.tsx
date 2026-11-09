import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { getPresentation, listSessions } from '@/store/db';
import type { Presentation, TrainingSession } from '@/types';
import PresentationHistory from './PresentationHistory';
import { PresentationList } from '@/components/PresentationList';

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
}));

vi.mock('react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router')>(),
  useParams: () => ({ id: 'p1' }),
}));

function renderHistory() {
  return renderToStaticMarkup(<MemoryRouter><PresentationHistory /></MemoryRouter>);
}

describe('presentation history', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.data = { presentation, sessions: [] };
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
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/presentations/p1/rehearse"');
  });

  it('shows an empty history with a rehearsal link', () => {
    const html = renderHistory();
    expect(html).toContain('Wyniki kwartalne');
    expect(html).toContain('Brak prób tej prezentacji');
    expect(html).toContain('href="/presentations/p1/rehearse"');
  });

  it('shows every rehearsal with its report link and metrics, without the dashboard limit', () => {
    mocks.data = { presentation, sessions: Array.from({ length: 51 }, (_, i) => session(`s${i}`)) };
    const html = renderHistory();
    expect(html).toContain('51 sesji');
    expect(html.match(/href="\/session\//g)).toHaveLength(51);
    expect(html).toContain('href="/session/s50"');
    expect(html).toContain('5,0 syl/s');
    expect(html).toContain('Fragmenty za długo bez oddechu');
    expect(html).toContain(new Date(1000).toLocaleString('pl-PL'));
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
});
