import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Presentation } from '@/types';
import Presentations from './Presentations';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: mocks.query }));
vi.mock('@/components/CalibrationPrompt', () => ({ CalibrationPrompt: () => <div>Zacznij od kalibracji</div> }));

const presentation: Presentation = {
  id: 'p1', title: 'Wyniki kwartalne', text: 'Dzień dobry.', createdAt: 1, updatedAt: 1,
};

function render(items: Presentation[] | undefined) {
  mocks.query.mockReturnValue(items);
  return renderToStaticMarkup(<MemoryRouter><Presentations /></MemoryRouter>);
}

describe('presentations tab', () => {
  beforeEach(() => mocks.query.mockReset());

  it('shows the presentation library with its actions under a single page heading', () => {
    const html = render([presentation]);
    expect(html).toContain('Wyniki kwartalne');
    expect(html).toContain('href="/presentations/new"');
    expect(html).toContain('href="/presentations/p1/rehearse?start=1"');
    expect(html).toContain('href="/presentations/p1"');
    expect(html).toContain('href="/presentations/p1/history"');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.indexOf('Zacznij od kalibracji')).toBeLessThan(html.indexOf('Wyniki kwartalne'));
    expect(html).not.toContain('Historia sesji');
    expect(html).not.toContain('href="/speaking"');
  });

  it('keeps creating a presentation available when the library is empty', () => {
    const html = render([]);
    expect(html).toContain('Brak prezentacji');
    expect(html).toContain('href="/presentations/new"');
  });

  it('does not show an empty-library message while presentations are loading', () => {
    const html = render(undefined);
    expect(html).not.toContain('Brak prezentacji');
    expect(html).toContain('href="/presentations/new"');
  });
});
