// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RehearsalText } from './RehearsalText';
import { documentFromText, presentationText } from '@/lib/presentationDocument';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('follows whole words across marked fragments, headings and nested lists using real DOM queries', async () => {
  const documentValue = documentFromText('');
  documentValue.content.content = [
    { type: 'heading', attrs: { level: 2 }, content: [
      { type: 'text', text: 'A' },
      { type: 'text', text: 'la', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ma kota.' },
    ] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Dwa ' }, { type: 'text', text: 'zdania.', marks: [{ type: 'italic' }] }] },
      ] },
    ] },
  ];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  const text = presentationText('', documentValue);
  const render = async (syllablesRead: number | null, autoScroll = true) => {
    await act(async () => root.render(
      <RehearsalText text={text} document={documentValue} syllablesRead={syllablesRead}
        autoScroll={autoScroll} onAutoScrollChange={changed}><div>Tempo</div></RehearsalText>,
    ));
  };
  try {
    await render(null);
    const viewport = host.querySelector<HTMLElement>('[role="region"]')!;
    const header = host.querySelector<HTMLElement>('.sticky')!;
    Object.defineProperties(viewport, {
      clientHeight: { value: 600 }, scrollHeight: { value: 1600 },
    });
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 600));
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 100));
    for (const fragment of host.querySelectorAll<HTMLElement>('[data-reading-chunk]')) {
      const top = Number(fragment.dataset.readingChunk) >= 8 ? 900 : fragment.closest('li') ? 500 : 100;
      vi.spyOn(fragment, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, top - viewport.scrollTop, 50, 30));
    }
    expect(host.querySelectorAll('[data-reading-chunk="0"]')).toHaveLength(2);
    await render(0);
    expect(viewport.scrollTop).toBe(0);
    await render(5);
    expect(viewport.scrollTop).toBe(225);
    await render(6);
    expect(viewport.scrollTop).toBe(625);
    await render(6);
    expect(viewport.scrollTop).toBe(625);
    await act(async () => viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 })));
    expect(changed).toHaveBeenCalledWith(false);
    await render(0, false);
    expect(viewport.scrollTop).toBe(625);
    await render(0, true);
    expect(viewport.scrollTop).toBe(0);
    await render(100);
    expect(viewport.scrollTop).toBe(625);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  }
});
