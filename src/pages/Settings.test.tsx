// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import Settings from './Settings';
import { clearAllData } from '@/store/db';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { getT } from '@/i18n';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => undefined,
}));
vi.mock('@/audio/capture', () => ({
  listMicrophones: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/store/db', () => ({
  clearAllData: vi.fn(),
  getBaseline: vi.fn(),
}));

describe('settings return navigation', () => {
  it('places app installation second from the bottom, immediately above data', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <MemoryRouter><Settings /></MemoryRouter>,
    );
    const t = getT();
    const titles = Array.from(container.querySelectorAll('h3'), (heading) => heading.textContent);

    expect(titles).toEqual([
      t.settings.appearance,
      t.settings.paceTitle,
      t.settings.micTitle,
      t.pwa.install.title,
      t.settings.dataTitle,
    ]);
  });

  it('shows an accessible home link above the title when opened directly', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/settings']}><Settings /></MemoryRouter>,
    );
    const link = container.querySelector('a[href="/"]');
    const heading = container.querySelector('h1');

    expect(link?.textContent?.trim()).toBe('Strona główna');
    expect(link?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(link?.className).toContain('focus-visible:ring-');
    expect(heading?.textContent?.trim()).toBe('Ustawienia');
    expect(link && heading && Boolean(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(container.querySelector('a[href="/calibration?lang=pl"]')).not.toBeNull();
    expect(container.querySelector('a[href="/calibration?lang=en"]')).not.toBeNull();
  });

  describe('settings confirmation dialogs', () => {
    let host: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      vi.stubGlobal('matchMedia', vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })));
      vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
      });
      vi.mocked(clearAllData).mockReset().mockResolvedValue(undefined);
      useSettings.setState({
        ...DEFAULT_SETTINGS,
        maxContinuousSpeechSeconds: 12,
        appLanguage: 'pl',
        calibration: {
          ...DEFAULT_SETTINGS.calibration,
          pl: { liveSyllableCorrection: 1.4, syllablesPerWord: 2.8 },
        },
        micDeviceId: 'selected-mic',
      });
      host = document.createElement('div');
      document.body.append(host);
      root = createRoot(host);
    });

    afterEach(async () => {
      await act(async () => root.unmount());
      host.remove();
      useSettings.setState(DEFAULT_SETTINGS);
      vi.unstubAllGlobals();
    });

    function button(label: string, scope: ParentNode = document) {
      const found = Array.from(scope.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);
      if (!found) throw new Error(`Missing button: ${label}`);
      return found;
    }

    async function mount() {
      await act(async () => root.render(<MemoryRouter><Settings /></MemoryRouter>));
    }

    it('requires confirmation before restoring defaults and preserves calibration and microphone', async () => {
      await mount();
      await act(async () => button('Przywróć ustawienia domyślne').click());
      expect(useSettings.getState().maxContinuousSpeechSeconds).toBe(12);
      await act(async () => button('Anuluj').click());
      expect(useSettings.getState().maxContinuousSpeechSeconds).toBe(12);
      await act(async () => button('Przywróć ustawienia domyślne').click());
      await act(async () => button('Przywróć ustawienia').click());
      expect(useSettings.getState()).toMatchObject({
        maxContinuousSpeechSeconds: DEFAULT_SETTINGS.maxContinuousSpeechSeconds,
        calibration: { pl: { liveSyllableCorrection: 1.4, syllablesPerWord: 2.8 } },
        micDeviceId: 'selected-mic',
      });
      expect(clearAllData).not.toHaveBeenCalled();
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    });

    it('cancels deletion without changes and clears data only on confirmation', async () => {
      await mount();
      await act(async () => button('Usuń wszystkie dane', host).click());
      expect(clearAllData).not.toHaveBeenCalled();
      await act(async () => button('Anuluj').click());
      expect(clearAllData).not.toHaveBeenCalled();
      expect(useSettings.getState().calibration.pl.liveSyllableCorrection).toBe(1.4);
      await act(async () => button('Usuń wszystkie dane', host).click());
      await act(async () => button('Usuń wszystkie dane', document.querySelector('[role="alertdialog"]')!).click());
      expect(clearAllData).toHaveBeenCalledOnce();
      expect(useSettings.getState()).toMatchObject({ calibration: { pl: { liveSyllableCorrection: 1, syllablesPerWord: 2.3 } } });
      expect(host.textContent).toContain('Dane zostały usunięte.');
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    });

    it('shows a deletion failure without claiming success or changing calibration', async () => {
      vi.mocked(clearAllData).mockRejectedValueOnce(new Error('Storage unavailable'));
      await mount();
      await act(async () => button('Usuń wszystkie dane', host).click());
      await act(async () => button('Usuń wszystkie dane', document.querySelector('[role="alertdialog"]')!).click());
      expect(document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain('Nie udało się usunąć danych.');
      expect(useSettings.getState().calibration.pl.liveSyllableCorrection).toBe(1.4);
      expect(host.textContent).not.toContain('Dane zostały usunięte.');
    });
  });
});
