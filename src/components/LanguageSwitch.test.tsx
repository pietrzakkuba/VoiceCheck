// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/overlay';
import { useSettings } from '@/store/settings';
import { Sidebar } from './AppNav';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
window.matchMedia ??= ((query: string) => ({
  matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  useSettings.setState({ appLanguage: 'pl' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(
    <TooltipProvider><MemoryRouter initialEntries={['/speaking']}><Sidebar /></MemoryRouter></TooltipProvider>,
  ));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useSettings.setState({ appLanguage: 'pl' });
});

const langButton = (lang: string) => host.querySelector<HTMLButtonElement>(`[role="group"] button[lang="${lang}"]`)!;
const navText = () => host.querySelector('nav')!.textContent;

describe('LanguageSwitch', () => {
  it('reflects the current language with aria-pressed', () => {
    expect(langButton('pl').getAttribute('aria-pressed')).toBe('true');
    expect(langButton('en').getAttribute('aria-pressed')).toBe('false');
    expect(navText()).toContain('Swobodne mówienie');
  });

  it('switches the app language and the navigation labels to English and back', async () => {
    await act(async () => langButton('en').click());
    expect(useSettings.getState().appLanguage).toBe('en');
    expect(langButton('en').getAttribute('aria-pressed')).toBe('true');
    expect(langButton('pl').getAttribute('aria-pressed')).toBe('false');
    expect(navText()).toContain('Free speaking');
    expect(navText()).toContain('Presentations');
    expect(navText()).not.toContain('Prezentacje');
    expect(host.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('App language');

    await act(async () => langButton('pl').click());
    expect(useSettings.getState().appLanguage).toBe('pl');
    expect(navText()).toContain('Prezentacje');
  });
});
