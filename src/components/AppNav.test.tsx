// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function containerFor(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('app navigation', () => {
  const initialSettings = useSettings.getState();
  beforeEach(() => useSettings.setState({ appLanguage: 'pl', theme: 'system' }));
  afterEach(() => {
    useSettings.setState(initialSettings);
    vi.restoreAllMocks();
  });

  it.each([
    ['/speaking', 'speaking'],
    ['/presentations', 'presentations'],
    ['/presentations/new', 'presentations'],
    ['/presentations/p1/rehearse', 'presentations'],
    ['/presentations/p1/history', 'presentations'],
    ['/history', 'history'],
    ['/session/s1', 'history'],
    ['/calibration', null],
    ['/settings', 'settings'],
    ['/settings/appearance', 'settings'],
    ['/settings-other', null],
    ['/', null],
  ] as const)('maps %s to the %s tab', (path, tab) => {
    expect(activeTab(path)).toBe(tab);
  });

  it('renders four ordered tabs in the bottom bar and marks the active one', () => {
    const html = render('/presentations/p1', <BottomTabBar />);
    const container = containerFor(html);
    expect(Array.from(container.querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual([
      '/speaking', '/presentations', '/history', '/settings',
    ]);
    expect(container.querySelector('ul')?.className).toContain('grid-cols-4');
    expect(html).toContain('aria-label="Swobodne mówienie"');
    expect(currentLinks(html)).toEqual(['/presentations']);
    expect(html).toContain('md:hidden');
  });

  it.each(['pl', 'en'] as const)('marks Settings active with localized labels in %s', (appLanguage) => {
    useSettings.setState({ appLanguage });
    const html = render('/settings', <BottomTabBar />);
    const settings = containerFor(html).querySelector('a[href="/settings"]');
    const label = appLanguage === 'pl' ? 'Ustawienia' : 'Settings';
    expect(settings?.getAttribute('aria-label')).toBe(label);
    expect(settings?.textContent).toBe(label);
    expect(currentLinks(html)).toEqual(['/settings']);
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

  it('places Settings once as the fourth desktop main item and leaves Calibration in tools', () => {
    const html = render('/settings', <Sidebar />);
    const container = containerFor(html);
    const navs = container.querySelectorAll('nav');
    expect(Array.from(navs[0].querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual([
      '/speaking', '/presentations', '/history', '/settings',
    ]);
    expect(Array.from(navs[1].querySelectorAll('a'), (link) => link.getAttribute('href'))).toEqual(['/calibration']);
    expect(container.querySelectorAll('a[href="/settings"]')).toHaveLength(1);
    expect(currentLinks(html)).toEqual(['/settings']);
  });

  it('keeps only logo and theme in the mobile header', () => {
    const html = render('/settings', <MobileHeader />);
    expect(html).not.toContain('href="/calibration"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('href="/settings"');
    expect(currentLinks(html)).toEqual([]);
    expect(html).not.toContain('href="/history"');
    expect(html).toContain('aria-label="Narzędzia"');
    expect(html).not.toContain('aria-label="Język aplikacji"');
    expect(html).toContain('aria-label="Ciemny motyw"');
    expect(html).toContain('md:hidden');
    const container = containerFor(html);
    const tools = container.querySelector('nav');
    expect(tools?.querySelectorAll('a')).toHaveLength(0);
    expect(tools?.querySelectorAll('button[role="switch"]')).toHaveLength(1);
  });

  it.each([
    ['light', true, false],
    ['dark', false, true],
    ['system', false, false],
    ['system', true, true],
  ] as const)('toggles the shared theme from %s with system dark=%s', (theme, systemDark, expectedDark) => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: systemDark,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    }));
    useSettings.setState({ theme });
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      act(() => root.render(
        <MemoryRouter><MobileHeader /><Sidebar /></MemoryRouter>,
      ));
      const toggle = host.querySelector<HTMLButtonElement>('header button[role="switch"]')!;
      const desktopToggle = host.querySelector('aside button[role="switch"]')!;
      expect(toggle.getAttribute('aria-checked')).toBe(String(expectedDark));
      act(() => toggle.click());
      expect(useSettings.getState().theme).toBe(expectedDark ? 'light' : 'dark');
      expect(toggle.getAttribute('aria-checked')).toBe(String(!expectedDark));
      expect(desktopToggle.getAttribute('aria-checked')).toBe(String(!expectedDark));
      act(() => toggle.click());
      expect(useSettings.getState().theme).toBe(expectedDark ? 'dark' : 'light');
      expect(toggle.getAttribute('aria-checked')).toBe(String(expectedDark));
      expect(desktopToggle.getAttribute('aria-checked')).toBe(String(expectedDark));
    } finally {
      act(() => root.unmount());
    }
  });

  it('renders English labels when the app language is English', () => {
    useSettings.setState({ appLanguage: 'en' });
    const bar = render('/speaking', <BottomTabBar />);
    expect(bar).toContain('aria-label="Free speaking"');
    expect(bar).toContain('aria-label="Main navigation"');
    expect(bar).toContain('>Speaking<');
    const header = render('/settings', <MobileHeader />);
    expect(header).toContain('aria-label="Dark theme"');
    const side = render('/speaking', <Sidebar />);
    for (const label of ['Presentations', 'History', 'Calibration', 'Settings', 'Theme']) {
      expect(side).toContain(`>${label}<`);
    }
    expect(side).not.toContain('Prezentacje');
  });
});
