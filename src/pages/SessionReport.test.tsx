// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, useLocation } from 'react-router';
import type { TrainingSession } from '@/types';
import { formatDuration, textStats } from '@/lib/presentation';
import SessionReport from './SessionReport';
import { deleteSession } from '@/store/db';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  session: undefined as TrainingSession | undefined,
  query: vi.fn(),
}));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mocks.query }));
vi.mock('@/hooks/useSessionAudio', () => ({
  useSessionAudio: () => ({ available: false, playing: false, timeMs: 0 }),
}));
vi.mock('@/components/report/Timeline', () => ({ Timeline: () => null }));
vi.mock('@/store/db', () => ({
  db: { sessions: { get: vi.fn() }, presentations: { get: vi.fn() } },
  deleteSession: vi.fn(),
}));

function renderReport() {
  mocks.query.mockReset()
    .mockReturnValueOnce(mocks.session)
    .mockReturnValueOnce({ id: 'p1', title: 'Zmieniona prezentacja', text: 'Inny tekst' });
  return renderToStaticMarkup(<MemoryRouter><SessionReport /></MemoryRouter>);
}

beforeEach(() => {
  mocks.session = {
    schema: 2, id: 's1', presentationId: 'p1', mode: 'presentation', timestamp: 1000,
    targetText: 'Dzień dobry państwu. '.repeat(30),
    deviceLabel: '', durationSeconds: 52, audioKey: 's1', noiseFloorDb: -60,
    settings: { targetArticulationRate: [2, 3], maxContinuousSpeechSeconds: 8, syllableCorrection: 1, syllablesPerWord: 2 },
    metrics: {
      articulationRate: 5, speechRate: 4, wpm: 120, syllables: 100, speechMs: 20000,
      phraseCount: 2, breathCount: 1, breathsPerMinute: 3, longestPhraseMs: 10000,
      meanPhraseMs: 10000, overLimitPhrases: 1, fastPhrases: 0, meanPauseMs: 1000, snrDb: 40,
    },
    phrases: [], pauses: [], tips: [], tracks: { waveform: [], speechSegments: [], nucleiMs: [] }, warnings: [],
  };
});

describe('session report reading time', () => {
  it.each(['presentation', 'free_speech', 'calibration'] as const)('links back to the history tab from %s reports', (mode) => {
    mocks.session!.mode = mode;
    const html = renderReport();
    expect(html).toMatch(/href="\/history"[^>]*>.*?Historia<\/a>/);
    expect(html.indexOf('href="/history"')).toBeLessThan(html.indexOf('Raport sesji'));
  });

  it('links back to presenting with a neutral action label', () => {
    const html = renderReport();
    expect(html).toContain('href="/presentations/p1/rehearse?start=1"');
    expect(html).toContain('Prezentuj ponownie</a>');
    expect(html).not.toContain('Ćwicz ponownie');
  });

  describe('session deletion confirmation', () => {
    let host: HTMLDivElement;
    let root: Root;

    function Location() {
      return <output data-location>{useLocation().pathname}</output>;
    }

    beforeEach(() => {
      vi.mocked(deleteSession).mockReset().mockResolvedValue(undefined);
      mocks.query.mockReset().mockImplementation((_query, _deps, initial) => (
        initial === null ? mocks.session : undefined
      ));
      host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);
    });

    afterEach(async () => {
      await act(async () => root.unmount());
      host.remove();
    });

    async function mount() {
      await act(async () => root.render(
        <MemoryRouter initialEntries={['/session/s1']}><SessionReport /><Location /></MemoryRouter>,
      ));
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Usuń sesję"]')!.click());
    }

    function dialogButton(label: string) {
      const found = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((candidate) => candidate.textContent?.trim() === label);
      if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing dialog button: ${label}`);
      return found;
    }

    it('cancels without changes and returns to the history tab only after confirmed deletion', async () => {
      await mount();
      expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Ta sesja i jej nagranie zostaną usunięte.');
      expect(deleteSession).not.toHaveBeenCalled();
      await act(async () => dialogButton('Anuluj').click());
      expect(deleteSession).not.toHaveBeenCalled();
      expect(host.querySelector('[data-location]')?.textContent).toBe('/session/s1');
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Usuń sesję"]')!.click());
      await act(async () => dialogButton('Usuń sesję').click());
      expect(deleteSession).toHaveBeenCalledExactlyOnceWith('s1');
      expect(host.querySelector('[data-location]')?.textContent).toBe('/history');
    });

    it('stays on the report and shows an error when deletion fails', async () => {
      vi.mocked(deleteSession).mockRejectedValueOnce(new Error('Storage unavailable'));
      await mount();
      await act(async () => dialogButton('Usuń sesję').click());
      expect(document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain('Nie udało się usunąć sesji.');
      expect(host.querySelector('[data-location]')?.textContent).toBe('/session/s1');
    });
  });

  it('shows the saved text estimate beside elapsed time using the session target pace', () => {
    const session = mocks.session!;
    const estimated = textStats(session.targetText!, session.settings.targetArticulationRate).estimatedSeconds;
    const html = renderReport();
    const timeCard = html.slice(html.indexOf('grid gap-4 sm:grid-cols-2'), html.indexOf('grid gap-3 grid-cols-2'));
    expect(timeCard).toContain('Czas sesji');
    expect(timeCard).toContain('0:52');
    expect(timeCard).toContain('Szacowany czas czytania');
    expect(timeCard).toContain(`ok. ${formatDuration(estimated)}`);
    expect(timeCard).toContain('W tempie docelowym zapisanym w sesji, z uwzględnieniem pauz');
    expect(timeCard).not.toContain('Pozostało');
    expect(timeCard).not.toContain('Przekroczono');
  });

  it.each([undefined, '', '   '])('omits the estimate without saved readable text (%s)', (text) => {
    mocks.session!.targetText = text;
    const html = renderReport();
    expect(html).toContain('Czas sesji');
    expect(html).not.toContain('Szacowany czas czytania');
  });

  it.each(['free_speech', 'calibration'] as const)('omits the presentation estimate for %s sessions', (mode) => {
    mocks.session!.mode = mode;
    expect(renderReport()).not.toContain('Szacowany czas czytania');
  });
});
