import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/overlay';
import { activeTab, BottomTabBar, MobileHeader, Sidebar } from './AppNav';

function render(path: string, node: React.ReactNode) {
  return renderToStaticMarkup(
    <TooltipProvider><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></TooltipProvider>,
  );
}

const currentLinks = (html: string) => [...html.matchAll(/<a[^>]*aria-current="page"[^>]*href="([^"]+)"|<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)]
  .map((m) => m[1] ?? m[2]);

describe('app navigation', () => {
  it.each([
    ['/speaking', 'speaking'],
    ['/presentations', 'presentations'],
    ['/presentations/new', 'presentations'],
    ['/presentations/p1/rehearse', 'presentations'],
    ['/presentations/p1/history', 'presentations'],
    ['/history', 'history'],
    ['/session/s1', 'history'],
    ['/calibration', null],
    ['/settings', null],
    ['/', null],
  ] as const)('maps %s to the %s tab', (path, tab) => {
    expect(activeTab(path)).toBe(tab);
  });

  it('renders three tabs in the bottom bar and marks the active one', () => {
    const html = render('/presentations/p1', <BottomTabBar />);
    expect(html).toContain('href="/speaking"');
    expect(html).toContain('href="/presentations"');
    expect(html).toContain('href="/history"');
    expect(html).toContain('aria-label="Swobodne mówienie"');
    expect(currentLinks(html)).toEqual(['/presentations']);
    expect(html).toContain('md:hidden');
  });

  it('renders the tabs plus calibration, settings and theme in the desktop sidebar', () => {
    const html = render('/session/s1', <Sidebar />);
    for (const href of ['/speaking', '/presentations', '/history', '/calibration', '/settings']) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(currentLinks(html)).toEqual(['/history']);
    expect(html).toContain('aria-label="Ciemny motyw"');
    expect(html).toContain('hidden md:flex');
  });

  it('keeps calibration and settings in the mobile header', () => {
    const html = render('/settings', <MobileHeader />);
    expect(html).toContain('href="/calibration"');
    expect(currentLinks(html)).toEqual(['/settings']);
    expect(html).not.toContain('href="/history"');
  });
});
