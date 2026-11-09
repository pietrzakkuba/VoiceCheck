import { Fragment, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/core';
import type { PresentationDocument } from '@/types';
import { blockSeparator, type ReadingChunk } from '@/lib/presentationDocument';
import { cn } from '@/lib/utils';

export function PresentationContent({ text, document, chunks, className }: {
  text: string;
  document?: PresentationDocument;
  chunks?: ReadingChunk[];
  className?: string;
}) {
  let offset = 0;
  let chunkIndex = 0;
  const renderText = (value: string): ReactNode => {
    const start = offset;
    offset += value.length;
    if (!chunks) return value;
    const pieces: ReactNode[] = [];
    while (chunkIndex < chunks.length && chunks[chunkIndex].end <= start) chunkIndex++;
    for (let i = chunkIndex; i < chunks.length && chunks[i].start < offset; i++) {
      const chunk = chunks[i];
      pieces.push(
        <span key={i} data-reading-chunk={i}>
          {value.slice(Math.max(start, chunk.start) - start, Math.min(offset, chunk.end) - start)}
        </span>,
      );
    }
    return pieces;
  };

  const renderNode = (node: JSONContent): ReactNode => {
    if (node.type === 'text') {
      let rendered = renderText(node.text ?? '');
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') rendered = <strong>{rendered}</strong>;
        else if (mark.type === 'italic') rendered = <em>{rendered}</em>;
        else throw new Error(`Unsupported presentation mark: ${mark.type}`);
      }
      return rendered;
    }
    if (node.type === 'hardBreak') {
      offset++;
      return <br />;
    }
    const children = (node.content ?? []).map((child, index) => {
      if (index > 0) offset += blockSeparator(node).length;
      return <Fragment key={index}>{renderNode(child)}</Fragment>;
    });
    switch (node.type) {
      case 'doc': return children;
      case 'paragraph': return <p>{children.length ? children : <br />}</p>;
      case 'heading': return node.attrs?.level === 3 ? <h3>{children}</h3> : <h2>{children}</h2>;
      case 'bulletList': return <ul>{children}</ul>;
      case 'orderedList': return <ol start={typeof node.attrs?.start === 'number' ? node.attrs.start : undefined}>{children}</ol>;
      case 'listItem': return <li>{children}</li>;
      default: throw new Error(`Unsupported presentation node: ${node.type}`);
    }
  };

  if (!document) {
    return <p className={cn(className, 'whitespace-pre-wrap')}>{renderText(text)}</p>;
  }
  if (document.version !== 1) throw new Error('Unsupported presentation document version');
  return <div className={cn('presentation-content', className)}>{renderNode(document.content)}</div>;
}
