import { describe, expect, it } from 'vitest';
import { documentFromText, documentText, presentationText, readingChunks } from './presentationDocument';
import { textStats } from './presentation';
import type { PresentationDocument } from '@/types';

describe('presentation documents', () => {
  it.each(['', '  Ala ma kota.\r\n\nDwa  zdania.\n', '\n\n', 'Pierwszy\nDrugi'])(
    'round-trips legacy whitespace and empty paragraphs: %j', (text) => {
      expect(presentationText('', documentFromText(text))).toBe(text);
      expect(presentationText(text)).toBe(text);
    },
  );

  it('uses explicit separators for paragraphs, headings, hard breaks and nested lists', () => {
    const document: PresentationDocument = {
      version: 1,
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Wstęp' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [
          { type: 'text', text: 'Dzień ' },
          { type: 'text', text: 'dobry', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'państwu.', marks: [{ type: 'italic' }] },
        ] },
        { type: 'orderedList', attrs: { start: 3 }, content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Pierwszy' }] },
            { type: 'bulletList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Szczegóły' }] }] },
            ] },
          ] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Drugi' }] }] },
        ] },
      ] },
    };
    expect(presentationText('stale text', document)).toBe('Wstęp\n\nDzień dobry\npaństwu.\nPierwszy\nSzczegóły\nDrugi');
    expect(documentText(JSON.parse(JSON.stringify(document)).content)).toBe(presentationText('', document));
  });

  it('does not split words or change statistics when marks split a word into text nodes', () => {
    const document = documentFromText('Prezentacja np. 12 wyników.');
    document.content.content = [{ type: 'paragraph', content: [
      { type: 'text', text: 'Pre' },
      { type: 'text', text: 'zent', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'acja', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' np. 12 wyników.' },
    ] }];
    const text = presentationText('', document);
    expect(textStats(text, [4, 6])).toEqual(textStats('Prezentacja np. 12 wyników.', [4, 6]));
    const chunks = readingChunks(text);
    expect(chunks[0].raw).toBe('Prezentacja');
    expect(chunks.at(-1)?.endSyllable).toBe(textStats(text, [4, 6]).syllables);
    for (const chunk of chunks) expect(text.slice(chunk.start, chunk.end)).toBe(chunk.raw);
  });

  it('rejects unsupported document nodes instead of silently losing content', () => {
    expect(() => documentText({ type: 'image' })).toThrow('Unsupported presentation node');
  });
});
