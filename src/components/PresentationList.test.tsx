import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Presentation } from '@/types';
import { PresentationList } from './PresentationList';
import { formatDuration, textStats } from '@/lib/presentation';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: mocks.query,
}));
// Static rendering reads zustand's initial (server) snapshot; read the live state so tests can switch languages.
vi.mock('@/store/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/settings')>();
  const useSettings = Object.assign(
    (selector: (state: ReturnType<typeof actual.useSettings.getState>) => unknown) => selector(actual.useSettings.getState()),
    actual.useSettings,
  );
  return { ...actual, useSettings };
});

describe('presentation card layout', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    useSettings.setState({ appLanguage: 'pl' });
  });

  it('constrains long content to a single shrinkable column on narrow screens', () => {
    const presentation: Presentation & { targetDurationSeconds: number } = {
      id: 'long',
      title: 'Bardzo długi tytuł prezentacji '.repeat(10),
      text: 'NieprzerwanyTekst'.repeat(100),
      targetDurationSeconds: 300,
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.query.mockReturnValue([presentation]);

    const html = renderToStaticMarkup(
      <MemoryRouter><PresentationList /></MemoryRouter>,
    );

    expect(html).toContain('<ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">');
    expect(html).toContain('<li class="min-w-0">');
    expect(html).toMatch(/class="[^"]*\btruncate\b[^"]*"/);
    expect(html).toMatch(/class="[^"]*\bline-clamp-2\b[^"]*\bwrap-anywhere\b[^"]*"/);
    expect(html).toContain(presentation.title);
    expect(html).toContain(presentation.text);
    expect(html).toContain('href="/presentations/long/rehearse"');
    expect(html).toContain('href="/presentations/long/rehearse?start=1"');
    expect(html).toContain('Prezentuj</a>');
    expect(html).not.toContain('Ćwicz');
    expect(html).toContain('href="/presentations/long"');
    expect(html).toContain('href="/presentations/long/history"');
    const estimated = textStats(presentation.text, DEFAULT_SETTINGS.targetArticulationRate).estimatedSeconds;
    expect(html).toContain(`Szacowany czas czytania: ok. ${formatDuration(estimated)}`);
    expect(html).not.toContain('limit 5:00');
    expect(html).not.toContain('text-warn');
    expect(html).toContain('mt-auto flex flex-wrap gap-2 pt-1');
  });

  it('shows the language of each presentation and uses it for the estimate', () => {
    const english: Presentation = { id: 'en1', title: 'Results', text: 'Good morning everyone. Today I will talk about our results.', language: 'en', createdAt: 1, updatedAt: Date.UTC(2026, 0, 31) };
    const legacy: Presentation = { id: 'pl1', title: 'Wyniki', text: 'Dzień dobry państwu.', createdAt: 1, updatedAt: Date.UTC(2026, 0, 31) };
    mocks.query.mockReturnValue([english, legacy]);
    const html = renderToStaticMarkup(<MemoryRouter><PresentationList /></MemoryRouter>);
    const target = DEFAULT_SETTINGS.targetArticulationRate;
    expect(html).toContain(`Szacowany czas czytania: ok. ${formatDuration(textStats(english.text, target, 'en').estimatedSeconds)}`);
    expect(html).toContain('title="Język prezentacji: English"');
    expect(html).toContain('title="Język prezentacji: Polski"');
    expect(html).toContain('lang="en"');
    expect(html).toContain('31.01.2026');
    expect(html).toContain('3 słowa');
  });

  it('renders English labels in the English app', () => {
    useSettings.setState({ appLanguage: 'en' });
    mocks.query.mockReturnValue([{ id: 'p', title: 'Wyniki', text: 'Dzień dobry.', createdAt: 1, updatedAt: Date.UTC(2026, 0, 31) }]);
    const html = renderToStaticMarkup(<MemoryRouter><PresentationList /></MemoryRouter>);
    expect(html).toContain('Presentations');
    expect(html).toContain('New presentation');
    expect(html).toContain('Present</a>');
    expect(html).toContain('aria-label="Edit presentation Wyniki"');
    expect(html).toContain('2 words');
    expect(html).toContain('Estimated reading time: approx.');
    expect(html).toContain('31/01/2026');
    expect(html).toContain('>PL</abbr>');
    useSettings.setState({ appLanguage: 'pl' });
  });
});
