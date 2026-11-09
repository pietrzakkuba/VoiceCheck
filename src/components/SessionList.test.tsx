// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSession } from '@/store/db';
import type { TrainingSession } from '@/types';
import { SessionList } from './SessionList';

vi.mock('@/store/db', () => ({ deleteSession: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

function sessions(count: number): TrainingSession[] {
  return Array.from({ length: count }, (_, i) => ({
    schema: 2, id: `s${i}`, presentationId: 'p1', mode: 'presentation', timestamp: 100000 - i * 1000,
    deviceLabel: '', durationSeconds: 65, audioKey: `audio-s${i}`, noiseFloorDb: -60,
    settings: { targetArticulationRate: [4.5, 5.5], maxContinuousSpeechSeconds: 8, syllableCorrection: 1, syllablesPerWord: 2 },
    metrics: {
      articulationRate: 5, speechRate: 4, wpm: 120, syllables: 100, speechMs: 20000,
      phraseCount: 2, breathCount: 1, breathsPerMinute: 3, longestPhraseMs: 10000,
      meanPhraseMs: 10000, overLimitPhrases: 1, fastPhrases: 0, meanPauseMs: 1000, snrDb: 40,
    },
    phrases: [], pauses: [], tips: [], tracks: { waveform: [], speechSegments: [], nucleiMs: [] }, warnings: [],
  }));
}

beforeEach(() => {
  vi.mocked(deleteSession).mockReset().mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(items: TrainingSession[], variant: 'default' | 'rehearsals' = 'default') {
  await act(async () => root.render(
    <MemoryRouter>
      <SessionList sessions={items} titles={new Map([['p1', 'Moja prezentacja']])} variant={variant} />
    </MemoryRouter>,
  ));
}

function button(text: string) {
  const found = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

const links = () => Array.from(host.querySelectorAll('a')).map((link) => link.getAttribute('href'));
const click = async (target: HTMLElement) => { await act(async () => target.click()); };
const removeButton = () => host.querySelector<HTMLButtonElement>('button[aria-label^="Usuń sesję:"]')!;

describe('session list', () => {
  it.each([0, 1, 10, 11, 51])('renders at most ten of %i sessions', async (count) => {
    await render(sessions(count));
    expect(links()).toHaveLength(Math.min(10, count));
    expect(host.querySelector('nav') !== null).toBe(count > 10);
    if (count > 10) expect(host.textContent).toContain(`Strona 1 z ${Math.ceil(count / 10)}`);
  });

  it('navigates both ways and reaches sessions beyond the old fifty-session limit', async () => {
    await render(sessions(51));
    expect(button('Poprzednia').disabled).toBe(true);
    expect(button('Następna').disabled).toBe(false);
    expect(links()).toEqual(Array.from({ length: 10 }, (_, i) => `/session/s${i}`));
    for (let i = 0; i < 5; i++) await click(button('Następna'));
    expect(host.textContent).toContain('Strona 6 z 6');
    expect(links()).toEqual(['/session/s50']);
    expect(button('Następna').disabled).toBe(true);
    await click(button('Poprzednia'));
    expect(host.textContent).toContain('Strona 5 z 6');
    expect(links()[0]).toBe('/session/s40');
  });

  it.each(['default', 'rehearsals'] as const)('preserves %s row content and separate delete controls', async (variant) => {
    const items = sessions(1);
    await render(items, variant);
    expect(host.textContent).toContain('5,0 syl/s');
    expect(host.textContent).toContain(new Date(items[0].timestamp).toLocaleString('pl-PL'));
    expect(links()).toEqual(['/session/s0']);
    expect(host.querySelector('a button')).toBeNull();
    expect(removeButton().getAttribute('aria-label')).toContain(new Date(items[0].timestamp).toLocaleString('pl-PL'));
    if (variant === 'default') expect(host.textContent).toContain('Próba prezentacji: Moja prezentacja');
    else {
      expect(host.querySelector('time')).not.toBeNull();
      expect(host.textContent).toContain('Czas trwania:');
      expect(host.textContent).not.toContain('Moja prezentacja');
    }
  });

  it('clamps a removed last page and does not restore it when records are added later', async () => {
    await render(sessions(21));
    await click(button('Następna'));
    await click(button('Następna'));
    await render(sessions(20));
    expect(host.textContent).toContain('Strona 2 z 2');
    expect(links()[0]).toBe('/session/s10');
    await render(sessions(21));
    expect(host.textContent).toContain('Strona 2 z 3');
    await render(sessions(0));
    expect(links()).toEqual([]);
    await render(sessions(21));
    expect(host.textContent).toContain('Strona 1 z 3');
  });

  it('cancels without deleting or following the report link', async () => {
    await render(sessions(1));
    await click(removeButton());
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Ta sesja i jej nagranie zostaną usunięte');
    expect(deleteSession).not.toHaveBeenCalled();
    await click(button('Anuluj'));
    expect(deleteSession).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(links()).toEqual(['/session/s0']);
  });

  it('deletes only the selected session after confirmation and blocks duplicate requests', async () => {
    let finish!: () => void;
    vi.mocked(deleteSession).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render(sessions(11));
    await click(button('Następna'));
    await click(removeButton());
    await click(button('Usuń sesję'));
    expect(deleteSession).toHaveBeenCalledExactlyOnceWith('s10');
    expect(button('Wykonywanie…').disabled).toBe(true);
    expect(button('Anuluj').disabled).toBe(true);
    await click(button('Wykonywanie…'));
    expect(deleteSession).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    await render(sessions(10));
    expect(links()).toHaveLength(10);
    expect(host.querySelector('nav')).toBeNull();
  });

  it('shows deletion errors without removing the row and permits retry', async () => {
    vi.mocked(deleteSession).mockRejectedValueOnce(new Error('Storage unavailable'));
    await render(sessions(1));
    await click(removeButton());
    await click(button('Usuń sesję'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Nie udało się usunąć sesji. Spróbuj ponownie.');
    expect(links()).toEqual(['/session/s0']);
    expect(button('Usuń sesję').disabled).toBe(false);
    await click(button('Usuń sesję'));
    expect(deleteSession).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
