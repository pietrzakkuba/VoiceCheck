import type { JSONContent } from '@tiptap/core';
import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import type { PresentationDocument } from '@/types';

export function documentFromText(text: string): PresentationDocument {
  return {
    version: 1,
    content: {
      type: 'doc',
      content: text.split('\n').map((line) => ({
        type: 'paragraph',
        ...(line ? { content: [{ type: 'text', text: line }] } : {}),
      })),
    },
  };
}

export function blockSeparator(node: JSONContent): string {
  return ['doc', 'bulletList', 'orderedList', 'listItem'].includes(node.type ?? '') ? '\n' : '';
}

export function documentText(node: JSONContent): string {
  switch (node.type) {
    case 'text': return node.text ?? '';
    case 'hardBreak': return '\n';
    case 'doc':
    case 'paragraph':
    case 'heading':
    case 'bulletList':
    case 'orderedList':
    case 'listItem':
      return (node.content ?? []).map(documentText).join(blockSeparator(node));
    default: throw new Error(`Unsupported presentation node: ${node.type}`);
  }
}

export function presentationText(text: string, document?: PresentationDocument): string {
  if (!document) return text;
  if (document.version !== 1) throw new Error('Unsupported presentation document version');
  return documentText(document.content);
}

export interface ReadingChunk {
  raw: string;
  start: number;
  end: number;
  endSyllable: number;
}

export function readingChunks(text: string): ReadingChunk[] {
  let end = 0;
  let endSyllable = 0;
  return (text.match(/\s+|\S+/g) ?? []).map((raw) => {
    const start = end;
    end += raw.length;
    endSyllable += countTextSyllables(normalizeText(raw).map((token) => token.word));
    return { raw, start, end, endSyllable };
  });
}
