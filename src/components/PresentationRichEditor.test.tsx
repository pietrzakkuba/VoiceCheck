// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentationRichEditor, presentationCharacterLimit } from './PresentationRichEditor';
import { documentFromText, presentationText } from '@/lib/presentationDocument';
import { presentationExtensions } from '@/lib/presentationExtensions';
import { MAX_PRESENTATION_CHARS } from '@/lib/presentation';
import type { PresentationDocument } from '@/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('ClipboardEvent', class extends Event { readonly clipboardData = null; });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function currentEditor() {
  const element = host.querySelector<HTMLElement & { editor: Editor }>('.tiptap');
  if (!element) throw new Error('Editor did not mount');
  return element.editor;
}

async function renderEditor(initial = documentFromText('Ala ma kota.'), disabled = false) {
  const changed = vi.fn<(document: PresentationDocument) => void>();
  function Harness() {
    const [value, setValue] = useState(initial);
    return <>
      <label id="presentation-text-label">Tekst wystąpienia</label>
      <PresentationRichEditor document={value} disabled={disabled} onChange={(next) => {
        setValue(next);
        changed(next);
      }} />
      <p id="presentation-text-count">{presentationText('', value).length}</p>
    </>;
  }
  await act(async () => root.render(<Harness />));
  // jsdom has no layout; selection scrolling is covered by the rehearsal DOM tests.
  currentEditor().view.setProps({ handleScrollToSelection: () => true });
  return { editor: currentEditor(), changed };
}

function click(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing button: ${label}`);
  button.click();
}

describe('presentation rich editor', () => {
  it('edits text, applies formatting, exposes active controls and supports undo and redo', async () => {
    const { editor, changed } = await renderEditor();
    expect(editor.view.dom.getAttribute('aria-labelledby')).toBe('presentation-text-label');
    expect(editor.view.dom.getAttribute('aria-multiline')).toBe('true');
    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 4 });
      click('Pogrubienie');
    });
    expect(host.querySelector('strong')?.textContent).toBe('Ala');
    expect(host.querySelector('[aria-label="Pogrubienie"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(changed).toHaveBeenLastCalledWith({ version: 1, content: editor.getJSON() });
    expect(presentationText('', changed.mock.lastCall![0])).toBe('Ala ma kota.');
    await act(async () => click('Cofnij'));
    expect(host.querySelector('strong')).toBeNull();
    await act(async () => click('Ponów'));
    expect(host.querySelector('strong')?.textContent).toBe('Ala');
    await act(async () => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1);
      editor.view.dispatch(editor.state.tr.insertText(' Dalej.'));
    });
    expect(presentationText('', changed.mock.lastCall![0])).toBe('Ala ma kota. Dalej.');
  });

  it.each([
    ['Kursywa', 'em'],
    ['Nagłówek', 'h2'],
    ['Podnagłówek', 'h3'],
    ['Lista punktowana', 'ul'],
    ['Lista numerowana', 'ol'],
  ])('supports the %s control', async (label, tag) => {
    await renderEditor();
    await act(async () => {
      currentEditor().commands.selectAll();
      click(label);
    });
    expect(host.querySelector(`.tiptap ${tag}`)?.textContent).toBe('Ala ma kota.');
    expect(host.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-pressed')).toBe('true');
    if (tag === 'h2' || tag === 'h3') {
      await act(async () => click('Akapit'));
      expect(host.querySelector('.tiptap p')?.textContent).toBe('Ala ma kota.');
    }
  });

  it('pastes only supported formatting and strips foreign styles and executable elements', async () => {
    const { editor, changed } = await renderEditor(documentFromText(''));
    await act(async () => {
      editor.view.pasteHTML('<h2 style="color:red">Tytuł</h2><p><strong>Ważne</strong> <em>słowo</em> <a href="https://example.com">link</a><img src="x" onerror="alert(1)"/><script>alert(1)</script></p><ul><li>Punkt</li></ul>');
    });
    expect(editor.getHTML()).toContain('<h2>Tytuł</h2>');
    expect(editor.getHTML()).toContain('<strong>Ważne</strong>');
    expect(editor.getHTML()).toContain('<em>słowo</em>');
    expect(editor.getHTML()).toContain('<ul><li><p>Punkt</p></li></ul>');
    expect(editor.getHTML()).not.toMatch(/<script|<img|<a |style=|onerror/);
    expect(presentationText('', changed.mock.lastCall![0])).toBe('Tytuł\nWażne słowo link\nPunkt');
  });

  it('rejects typing and pasting beyond the text limit with an explicit error and without losing existing content', async () => {
    const { editor } = await renderEditor(documentFromText('a'.repeat(MAX_PRESENTATION_CHARS)));
    await act(async () => {
      editor.view.dispatch(editor.state.tr.insertText('x', 1));
    });
    expect(presentationText('', { version: 1, content: editor.getJSON() })).toHaveLength(MAX_PRESENTATION_CHARS);
    expect(host.textContent).toContain('Ostatnia zmiana nie została wprowadzona');
    await act(async () => {
      editor.view.pasteText('nadmiar');
    });
    expect(presentationText('', { version: 1, content: editor.getJSON() })).toBe('a'.repeat(MAX_PRESENTATION_CHARS));
    await act(async () => {
      editor.view.dispatch(editor.state.tr.delete(1, 5));
      editor.view.pasteText('kot');
    });
    expect(presentationText('', { version: 1, content: editor.getJSON() })).toHaveLength(MAX_PRESENTATION_CHARS - 1);
    expect(host.textContent).not.toContain('Ostatnia zmiana nie została wprowadzona');
  });

  it('counts structural line breaks toward the limit and allows formatting at the limit', () => {
    const exceeded = vi.fn();
    const editor = new Editor({
      extensions: [...presentationExtensions(), presentationCharacterLimit(exceeded)],
      content: documentFromText('a'.repeat(MAX_PRESENTATION_CHARS)).content,
    });
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(editor.getHTML()).toContain('<strong>');
    editor.commands.setTextSelection(2);
    editor.commands.splitBlock();
    expect(exceeded).toHaveBeenLastCalledWith(true);
    expect(editor.state.doc.childCount).toBe(1);
    editor.destroy();
  });

  it('can shorten an oversized legacy document instead of locking the user out', async () => {
    const { editor } = await renderEditor(documentFromText('a'.repeat(MAX_PRESENTATION_CHARS + 10)));
    await act(async () => editor.view.dispatch(editor.state.tr.delete(1, 12)));
    expect(presentationText('', { version: 1, content: editor.getJSON() })).toHaveLength(MAX_PRESENTATION_CHARS - 1);
  });

  it('keeps content and all controls disabled while saving', async () => {
    const { editor } = await renderEditor(undefined, true);
    expect(editor.isEditable).toBe(false);
    for (const button of host.querySelectorAll('button')) expect(button.disabled).toBe(true);
  });
});
