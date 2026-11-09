import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Presentation } from '@/types';
import { PresentationList } from './PresentationList';
import { formatDuration, textStats } from '@/lib/presentation';
import { DEFAULT_SETTINGS } from '@/store/settings';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: mocks.query,
}));

describe('presentation card layout', () => {
  beforeEach(() => {
    mocks.query.mockReset();
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
});
