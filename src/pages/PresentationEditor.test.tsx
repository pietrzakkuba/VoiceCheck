// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PresentationEditor from './PresentationEditor';
import { documentFromText, presentationText } from '@/lib/presentationDocument';
import { formatDuration, MAX_PRESENTATION_CHARS, textStats } from '@/lib/presentation';
import { useSettings } from '@/store/settings';
import type { Presentation } from '@/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  id: 'p1',
  get: vi.fn<(id: string) => Promise<Presentation | null>>(),
  save: vi.fn<(presentation: Presentation) => Promise<void>>(),
  remove: vi.fn<(id: string) => Promise<void>>(),
  navigate: vi.fn(),
}));

vi.mock('@/store/db', () => ({
  getPresentation: mocks.get,
  savePresentation: mocks.save,
  deletePresentation: mocks.remove,
}));
vi.mock('react-router', () => ({
  useParams: () => ({ id: mocks.id }),
  useNavigate: () => mocks.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

let host: HTMLDivElement;
let root: Root;
let stored: Presentation & { targetDurationSeconds?: number };

beforeEach(() => {
  mocks.id = 'p1';
  mocks.navigate.mockReset();
  mocks.remove.mockReset().mockResolvedValue(undefined);
  stored = { id: 'p1', title: 'Próba', text: '  Ala ma kota.\n\nKoniec.\n', createdAt: 1, updatedAt: 2, targetDurationSeconds: 150 };
  mocks.get.mockReset().mockImplementation(async () => structuredClone(stored));
  mocks.save.mockReset().mockImplementation(async (presentation) => { stored = structuredClone(presentation); });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount() {
  await act(async () => root.render(<PresentationEditor />));
  const element = host.querySelector<HTMLElement & { editor: Editor }>('.tiptap');
  if (!element) throw new Error('Editor did not mount');
  element.editor.view.setProps({ handleScrollToSelection: () => true });
  return element.editor;
}

function clickSave(label = 'Zapisz') {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  button.click();
}

describe('presentation deletion confirmation', () => {
  function dialogButton(label: string) {
    const found = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((candidate) => candidate.textContent?.trim() === label);
    if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing dialog button: ${label}`);
    return found;
  }

  it('keeps rehearsal history and deletes only the selected presentation after confirmation', async () => {
    await mount();
    await act(async () => clickSave('Usuń'));
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Nagrane próby pozostaną w historii sesji.');
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('Próba');
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => dialogButton('Anuluj').click());
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => clickSave('Usuń'));
    await act(async () => dialogButton('Usuń prezentację').click());
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('p1');
    expect(mocks.navigate).toHaveBeenCalledWith('/');
  });

  it('keeps the editor and dialog open when deletion fails', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('Storage unavailable'));
    await mount();
    await act(async () => clickSave('Usuń'));
    await act(async () => dialogButton('Usuń prezentację').click());
    expect(document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toContain('Nie udało się usunąć prezentacji.');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(host.querySelector('.tiptap')).not.toBeNull();
  });
});

describe('presentation editor persistence', () => {
  it('loads legacy content, saves rich JSON with matching plain text and reopens the formatting', async () => {
    const originalText = stored.text;
    const editor = await mount();
    expect(presentationText('', { version: 1, content: editor.getJSON() })).toBe(originalText);
    await act(async () => {
      editor.commands.setTextSelection({ from: 3, to: 6 });
      editor.commands.toggleBold();
      editor.commands.setTextSelection(1);
      editor.commands.toggleHeading({ level: 2 });
    });
    await act(async () => clickSave());
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(stored.text).toBe(originalText);
    expect(stored.document?.version).toBe(1);
    expect(presentationText('', stored.document)).toBe(stored.text);
    expect(stored.createdAt).toBe(1);
    expect(stored).not.toHaveProperty('targetDurationSeconds');
    expect(mocks.navigate).toHaveBeenCalledWith('/');

    await act(async () => root.unmount());
    root = createRoot(host);
    await mount();
    expect(host.querySelector('.tiptap h2 strong')?.textContent).toBe('Ala');
    expect(host.querySelector('#minutes')).toBeNull();
  });

  it('creates a presentation and passes its ID to the rehearsal route', async () => {
    mocks.id = 'new';
    const editor = await mount();
    await act(async () => {
      const title = host.querySelector<HTMLInputElement>('#title')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'Nowa prezentacja');
      title.dispatchEvent(new Event('input', { bubbles: true }));
      editor.commands.insertContent('<h2>Wstęp</h2><p><strong>Dzień dobry</strong></p>');
    });
    await act(async () => clickSave('Zapisz i prezentuj'));
    expect(stored.title).toBe('Nowa prezentacja');
    expect(stored.text).toBe('Wstęp\nDzień dobry');
    expect(stored.document).toEqual({ version: 1, content: editor.getJSON() });
    expect(stored).not.toHaveProperty('targetDurationSeconds');
    expect(mocks.navigate).toHaveBeenCalledWith(`/presentations/${stored.id}/rehearse`);
  });

  it('shows an estimate instead of a manual time input and updates it while editing', async () => {
    const editor = await mount();
    const target = useSettings.getState().targetArticulationRate;
    const estimate = (text: string) => `Szacowany czas czytania: ok. ${formatDuration(textStats(text, target).estimatedSeconds)}`;
    expect(host.querySelector('#minutes')).toBeNull();
    expect(host.textContent).not.toContain('Czas na wystąpienie');
    expect(host.textContent).toContain(estimate(stored.text));
    const text = 'Dzień dobry państwu. '.repeat(20);
    await act(async () => { editor.commands.setContent(documentFromText(text).content); });
    expect(host.textContent).toContain(estimate(text));
    expect(host.textContent).toContain('bez pauz');
  });

  it('validates oversized legacy content on save instead of persisting an invalid presentation', async () => {
    stored.text = 'a'.repeat(MAX_PRESENTATION_CHARS + 1);
    await mount();
    await act(async () => clickSave());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain(`przekracza limit ${MAX_PRESENTATION_CHARS}`);
  });

  it('rejects empty documents and titles', async () => {
    stored.text = '';
    await mount();
    await act(async () => clickSave());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Wpisz tekst prezentacji.');
    await act(async () => root.unmount());
    root = createRoot(host);
    stored.title = ' ';
    stored.text = 'Tekst';
    await mount();
    await act(async () => clickSave());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Podaj tytuł prezentacji.');
  });

  it('restores editing and displays the save error without losing the document', async () => {
    stored.document = documentFromText(stored.text);
    mocks.save.mockRejectedValue(new Error('Storage unavailable'));
    const editor = await mount();
    await act(async () => clickSave());
    expect(host.textContent).toContain('Nie udało się zapisać prezentacji.');
    expect(editor.isEditable).toBe(true);
    expect(editor.getJSON()).toEqual(stored.document.content);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
