import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PresentationContent } from './PresentationContent';
import { documentFromText, presentationText, readingChunks } from '@/lib/presentationDocument';

describe('presentation content', () => {
  it('renders only the supported semantic formatting and preserves empty paragraphs', () => {
    const document = documentFromText('');
    document.content.content = [
      { type: 'heading', attrs: { level: 2, onclick: 'alert(1)' }, content: [{ type: 'text', text: 'Wstęp' }] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Część pierwsza' }] },
      { type: 'paragraph' },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [
          { type: 'text', text: 'Akcent', marks: [{ type: 'bold' }, { type: 'italic' }] },
          { type: 'hardBreak' },
          { type: 'text', text: '<script>tekst</script>' },
        ] }] },
      ] },
      { type: 'orderedList', attrs: { start: 4 }, content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Koniec' }] }] },
      ] },
    ];
    const html = renderToStaticMarkup(<PresentationContent text="" document={document} />);
    expect(html).toContain('<h2>Wstęp</h2>');
    expect(html).toContain('<h3>Część pierwsza</h3>');
    expect(html).toContain('<p><br/></p>');
    expect(html).toContain('<ul><li><p><em><strong>Akcent</strong></em><br/>');
    expect(html).toContain('<ol start="4"><li>');
    expect(html).toContain('&lt;script&gt;tekst&lt;/script&gt;');
    expect(html).not.toContain('onclick');
  });

  it('maps fragments across marks and nested blocks to the same whole-word reading chunks', () => {
    const document = documentFromText('');
    document.content.content = [
      { type: 'paragraph', content: [
        { type: 'text', text: 'Pre' },
        { type: 'text', text: 'zentacja', marks: [{ type: 'bold' }] },
      ] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dalej' }] }] },
      ] },
    ];
    const text = presentationText('', document);
    const html = renderToStaticMarkup(<PresentationContent text={text} document={document} chunks={readingChunks(text)} />);
    expect(html).toContain('<span data-reading-chunk="0">Pre</span><strong><span data-reading-chunk="0">zentacja</span></strong>');
    expect(html).toContain('<li><p><span data-reading-chunk="2">Dalej</span></p></li>');
  });

  it('keeps unformatted legacy text as-is', () => {
    const html = renderToStaticMarkup(<PresentationContent text={'  Ala.\n\nKoniec.'} />);
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).toContain('  Ala.\n\nKoniec.');
  });
});
