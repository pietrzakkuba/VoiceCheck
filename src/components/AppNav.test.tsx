// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { TooltipProvider } from '@/components/ui/overlay';
import { activeTab, BottomTabBar, MobileHeader, Sidebar } from './AppNav';
import { useSettings } from '@/store/settings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
window.matchMedia ??= ((query: string) => ({
  matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;

function render(path: string, node: React.ReactNode) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(
    <TooltipProvider><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></TooltipProvider>,
  ));
  const html = host.innerHTML;
  act(() => root.unmount());
  return html;
}

const currentLinks = (html: string) => [...html.matchAll(/<a[^>]*aria-current="page"[^>]*href="([^"]+)"|<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)]
  .map((m) => m[1] ?? m[2]);

describe('app navigation', () => {
  beforeEach(() => useSettings.setState({ appLanguage: 'pl' }));

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
    expect(html).toContain('aria-label="Język aplikacji"');
    expect(html).toContain('hidden md:flex');
  });

  it('keeps only logo and settings in the mobile header', () => {
    const html = render('/settings', <MobileHeader />);
    expect(html).not.toContain('href="/calibration"');
    expect(html).toContain('href="/"');
    expect(currentLinks(html)).toEqual(['/settings']);
    expect(html).not.toContain('href="/history"');
    expect(html).toContain('aria-label="Narzędzia"');
    expect(html).not.toContain('aria-label="Język aplikacji"');
    expect(html).not.toContain('aria-label="Ciemny motyw"');
    const container = document.createElement('div');
    container.innerHTML = html;
    const tools = container.querySelector('nav');
    expect(tools?.querySelectorAll('a')).toHaveLength(1);
    expect(tools?.querySelector('a')?.getAttribute('href')).toBe('/settings');
    expect(tools?.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders English labels when the app language is English', () => {
    useSettings.setState({ appLanguage: 'en' });
    const bar = render('/speaking', <BottomTabBar />);
    expect(bar).toContain('aria-label="Free speaking"');
    expect(bar).toContain('aria-label="Main navigation"');
    expect(bar).toContain('>Speaking<');
    const side = render('/speaking', <Sidebar />);
    for (const label of ['Presentations', 'History', 'Calibration', 'Settings', 'Theme']) {
      expect(side).toContain(`>${label}<`);
    }
    expect(side).not.toContain('Prezentacje');
  });
});
