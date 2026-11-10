import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CardContent } from '@/components/ui/card';
import { readingChunks, presentationText } from '@/lib/presentationDocument';
import { PresentationContent } from '@/components/PresentationContent';
import { useT, type Lang } from '@/i18n';
import type { PresentationDocument } from '@/types';

export function RehearsalText({ text, document, lang = 'pl', syllablesRead, autoScroll, onAutoScrollChange, children }: {
  text: string;
  document?: PresentationDocument;
  /** Language of the presentation text; drives syllable-based progress and the `lang` attribute. */
  lang?: Lang;
  syllablesRead: number | null;
  autoScroll: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
  children: ReactNode;
}) {
  const t = useT();
  const viewportRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const expectedScrollTop = useRef(0);
  const interruptedRef = useRef(false);
  const plainText = useMemo(() => presentationText(text, document), [text, document]);
  const chunks = useMemo(() => readingChunks(plainText, lang), [plainText, lang]);

  const disableAutoScroll = useCallback(() => {
    if (interruptedRef.current) return;
    interruptedRef.current = true;
    onAutoScrollChange(false);
  }, [onAutoScrollChange]);

  useEffect(() => {
    interruptedRef.current = false;
    expectedScrollTop.current = viewportRef.current?.scrollTop ?? 0;
  }, [autoScroll, plainText, document]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!autoScroll || !viewport) return;
    const onScroll = () => {
      if (Math.abs(viewport.scrollTop - expectedScrollTop.current) > 1) disableAutoScroll();
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && event.deltaY !== 0 && viewport.scrollHeight > viewport.clientHeight) disableAutoScroll();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && viewport.scrollHeight > viewport.clientHeight) disableAutoScroll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.target === viewport && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) disableAutoScroll();
    };
    const onPointerDown = (event: PointerEvent) => {
      const scrollbarStart = viewport.getBoundingClientRect().left + viewport.clientLeft + viewport.clientWidth;
      if (event.button === 0 && event.target === viewport && event.clientX >= scrollbarStart && viewport.scrollHeight > viewport.clientHeight) disableAutoScroll();
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
    viewport.addEventListener('wheel', onWheel, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: true });
    viewport.addEventListener('keydown', onKeyDown);
    viewport.addEventListener('pointerdown', onPointerDown);
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('keydown', onKeyDown);
      viewport.removeEventListener('pointerdown', onPointerDown);
    };
  }, [autoScroll, disableAutoScroll]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const header = headerRef.current;
    const paragraph = textRef.current;
    if (!autoScroll || interruptedRef.current || syllablesRead === null || !viewport || !header || !paragraph || viewport.clientHeight === 0) return;
    const next = chunks.findIndex((chunk) => chunk.endSyllable > syllablesRead);
    let word = paragraph.querySelector(`[data-reading-chunk="${next < 0 ? chunks.length - 1 : next}"]`);
    if (!word) {
      const fragments = paragraph.querySelectorAll('[data-reading-chunk]');
      word = fragments[fragments.length - 1];
    }
    if (!word) return;
    const headerHeight = header.getBoundingClientRect().height;
    const followY = headerHeight + Math.max(0, viewport.clientHeight - headerHeight) * 0.35;
    const wordY = viewport.scrollTop + word.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    viewport.scrollTop = Math.max(0, Math.min(wordY - followY, viewport.scrollHeight - viewport.clientHeight));
    expectedScrollTop.current = viewport.scrollTop;
  }, [autoScroll, syllablesRead, chunks]);

  return (
    <div className="rehearsal-text overflow-hidden rounded-[inherit] p-1 text-card-foreground">
      <div ref={viewportRef} className="rehearsal-viewport max-h-[65vh] overflow-y-auto rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 [overflow-anchor:none] [scrollbar-gutter:stable]" tabIndex={0} role="region" aria-label={t.presentations.rehearsal.readingRegion}>
        <div ref={headerRef} className="rehearsal-indicators sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-card px-5 py-3">
          {children}
        </div>
        <CardContent className="py-5">
          <div ref={textRef} lang={lang}>
            <PresentationContent text={plainText} document={document} chunks={chunks}
              className="text-xl md:text-2xl leading-relaxed md:leading-relaxed" />
          </div>
        </CardContent>
      </div>
    </div>
  );
}
