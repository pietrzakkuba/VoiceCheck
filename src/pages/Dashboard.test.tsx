import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { Presentation } from '@/types';
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
    expect(html.indexOf('Wyniki kwartalne')).toBeLessThan(html.indexOf('Historia sesji'));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toContain('href="/presentations"');
    expect(html).not.toContain('Wykresy postępów');
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
});
