import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RehearsalText } from './RehearsalText';

const mocks = vi.hoisted(() => ({
  viewport: {
    clientHeight: 600, scrollHeight: 1600, scrollTop: 0, clientWidth: 400, clientLeft: 0,
    getBoundingClientRect: () => ({ top: 0, left: 0 }),
    addEventListener: vi.fn<(type: string, listener: EventListener) => void>(),
    removeEventListener: vi.fn<(type: string, listener: EventListener) => void>(),
  },
  header: { getBoundingClientRect: () => ({ height: 100 }) },
  paragraph: { children: [] as Array<{ getBoundingClientRect: () => { top: number } }> },
  effects: [] as Array<() => void>,
  effectDeps: [] as Array<readonly unknown[]>,
  cleanups: [] as Array<void | (() => void)>,
  effectIndex: 0,
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  autoScroll: true,
  onAutoScrollChange: vi.fn<(enabled: boolean) => void>(),
  listeners: new Map<string, EventListener>(),
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: () => mocks.refs[mocks.refIndex++],
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = mocks.effectIndex++;
    const previous = mocks.effectDeps[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      mocks.effectDeps[index] = deps;
      mocks.effects.push(() => {
        mocks.cleanups[index]?.();
        mocks.cleanups[index] = effect();
      });
    }
  },
}));

function renderText(syllablesRead: number | null, autoScroll = mocks.autoScroll, text = 'Ala ma kota.\n\nDwa zdania.') {
  mocks.effects = [];
  mocks.refIndex = 0;
  mocks.effectIndex = 0;
  mocks.autoScroll = autoScroll;
  const html = renderToStaticMarkup(
    <RehearsalText text={text} syllablesRead={syllablesRead} autoScroll={autoScroll} onAutoScrollChange={mocks.onAutoScrollChange}>
      <div>Tempo</div>
    </RehearsalText>,
  );
  mocks.effects.forEach((effect) => effect());
  return html;
}

function dispatch(type: string, properties: Record<string, unknown> = {}, target: object = mocks.viewport) {
  const event = new Event(type);
  Object.defineProperty(event, 'target', { value: target });
  Object.assign(event, properties);
  mocks.listeners.get(type)?.(event);
}

describe('rehearsal text auto-scroll', () => {
  beforeEach(() => {
    mocks.autoScroll = true;
    mocks.onAutoScrollChange.mockReset().mockImplementation((enabled) => { mocks.autoScroll = enabled; });
    mocks.effectDeps = [];
    mocks.cleanups = [];
    mocks.listeners.clear();
    mocks.refs = [mocks.viewport, mocks.header, mocks.paragraph, 0, false].map((current) => ({ current }));
    mocks.viewport.addEventListener.mockReset().mockImplementation((type, listener) => {
      mocks.listeners.set(type, listener);
    });
    mocks.viewport.removeEventListener.mockReset().mockImplementation((type, listener) => {
      if (mocks.listeners.get(type) === listener) mocks.listeners.delete(type);
    });
    Object.assign(mocks.viewport, { clientHeight: 600, scrollHeight: 1600, scrollTop: 0 });
    mocks.paragraph.children = [100, 100, 100, 100, 500, 500, 900, 900, 1500].map((top) => ({
      getBoundingClientRect: () => ({ top: top - mocks.viewport.scrollTop }),
    }));
  });

  it('keeps the first words visible without scrolling', () => {
    renderText(0);
    expect(mocks.viewport.scrollTop).toBe(0);
    renderText(2);
    expect(mocks.viewport.scrollTop).toBe(0);
  });

  it('insets the scroll viewport inside a clipped frame without changing its scroll target', () => {
    const html = renderText(3);
    expect(html).toContain('<div class="overflow-hidden rounded-[inherit] p-1 text-card-foreground"><div class="max-h-[65vh] overflow-y-auto');
    expect(html).toContain('focus-visible:-outline-offset-2');
    expect(html).toContain('[scrollbar-gutter:stable]');
    expect(mocks.viewport.scrollTop).toBe(225);
    expect(mocks.listeners.size).toBe(5);
  });

  it('follows syllable progress and leaves reading space below the sticky header', () => {
    renderText(3);
    expect(mocks.viewport.scrollTop).toBe(225);
    renderText(5);
    expect(mocks.viewport.scrollTop).toBe(625);
  });

  it('does not drift when the syllable count stays unchanged during a pause', () => {
    renderText(3);
    renderText(3);
    expect(mocks.viewport.scrollTop).toBe(225);
  });

  it('stops scrolling when disabled and resumes at the current position when enabled', () => {
    renderText(3);
    renderText(5, false);
    expect(mocks.viewport.scrollTop).toBe(225);
    renderText(5, true);
    expect(mocks.viewport.scrollTop).toBe(625);
  });

  it('does not disable auto-scroll in response to its own scroll events', () => {
    renderText(3);
    dispatch('scroll');
    const html = renderText(5);
    expect(mocks.viewport.scrollTop).toBe(625);
    expect(html).not.toContain('Wznów śledzenie');
    expect(mocks.onAutoScrollChange).not.toHaveBeenCalled();
  });

  it('does not show a pause toolbar or reserve empty space after manual scrolling', () => {
    const following = renderText(3);
    dispatch('wheel', { deltaY: 100 });
    const paused = renderText(3);
    expect(following).not.toContain('flex h-8 w-full');
    expect(paused).not.toContain('flex h-8 w-full');
    expect(paused).not.toContain('Śledzenie wstrzymane');
    expect(paused).not.toContain('Wznów śledzenie');
    expect(mocks.onAutoScrollChange).toHaveBeenCalledWith(false);
    expect(mocks.viewport.scrollTop).toBe(225);
    expect(following).toContain('[overflow-anchor:none]');
    expect(following).toContain('[scrollbar-gutter:stable]');
  });

  it('disables auto-scroll immediately on wheel input instead of overriding manual movement', () => {
    renderText(3);
    dispatch('wheel', { deltaY: 100 });
    const html = renderText(5);
    expect(mocks.viewport.scrollTop).toBe(225);
    expect(html).not.toContain('Śledzenie wstrzymane');
    expect(html).not.toContain('Wznów śledzenie');
    expect(mocks.autoScroll).toBe(false);
    mocks.viewport.scrollTop = 500;
    dispatch('scroll');
    renderText(6);
    expect(mocks.viewport.scrollTop).toBe(500);
  });

  it('pauses when scroll position changes through the scrollbar or another manual input', () => {
    renderText(3);
    mocks.viewport.scrollTop = 700;
    dispatch('scroll');
    renderText(5);
    expect(mocks.viewport.scrollTop).toBe(700);
  });

  it('pauses as soon as the user grabs the scrollbar', () => {
    renderText(3);
    dispatch('pointerdown', { button: 0, clientX: 405 });
    renderText(5);
    expect(mocks.viewport.scrollTop).toBe(225);
  });

  it('pauses for a touch gesture', () => {
    renderText(3);
    dispatch('touchmove', { touches: [{}] });
    renderText(5);
    expect(mocks.viewport.scrollTop).toBe(225);
  });

  it.each(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])('pauses for the %s scroll key', (key) => {
    renderText(3);
    dispatch('keydown', { key });
    renderText(5);
    expect(mocks.viewport.scrollTop).toBe(225);
  });

  it('does not pause for zooming, horizontal wheel input, ordinary clicks or button keyboard events', () => {
    renderText(3);
    dispatch('wheel', { deltaY: 100, ctrlKey: true });
    dispatch('wheel', { deltaY: 0 });
    dispatch('touchmove', { touches: [{}, {}] });
    dispatch('keydown', { key: 'Enter' });
    dispatch('keydown', { key: ' ' });
    dispatch('keydown', { key: ' ' }, {});
    dispatch('pointerdown', { button: 0, clientX: 100 }, {});
    renderText(5);
    expect(mocks.viewport.scrollTop).toBe(625);
  });

  it('follows the latest reading position when the switch is enabled again', () => {
    renderText(3);
    dispatch('wheel', { deltaY: -100 });
    mocks.viewport.scrollTop = 50;
    renderText(5);
    expect(mocks.onAutoScrollChange).toHaveBeenCalledWith(false);
    const html = renderText(5, true);
    expect(mocks.viewport.scrollTop).toBe(625);
    expect(html).not.toContain('Wznów śledzenie');
    dispatch('scroll');
    renderText(6);
    expect(mocks.viewport.scrollTop).toBe(1000);
  });

  it('allows auto-scroll to be switched back on after manual scrolling', () => {
    renderText(3);
    dispatch('wheel', { deltaY: 100 });
    renderText(5);
    const disabled = renderText(5, false);
    expect(disabled).not.toContain('Wznów śledzenie');
    expect(mocks.viewport.scrollTop).toBe(225);
    renderText(5, true);
    expect(mocks.viewport.scrollTop).toBe(625);
  });

  it('preserves a manual position chosen during calibration when recording starts', () => {
    renderText(null);
    mocks.viewport.scrollTop = 400;
    dispatch('scroll');
    renderText(0);
    expect(mocks.viewport.scrollTop).toBe(400);
  });

  it('removes input listeners when auto-scroll is disabled or the component is unmounted', () => {
    renderText(3, true);
    expect(mocks.listeners.size).toBe(5);
    renderText(3, false);
    expect(mocks.listeners.size).toBe(0);
    renderText(3, true);
    expect(mocks.listeners.size).toBe(5);
    mocks.cleanups.forEach((cleanup) => cleanup?.());
    expect(mocks.listeners.size).toBe(0);
  });

  it('does not move before recording, during calibration or processing', () => {
    mocks.viewport.scrollTop = 300;
    renderText(null);
    expect(mocks.viewport.scrollTop).toBe(300);
  });

  it('clamps at the end even when speech exceeds the original text', () => {
    renderText(8);
    expect(mocks.viewport.scrollTop).toBe(1000);
    renderText(100);
    expect(mocks.viewport.scrollTop).toBe(1000);
  });

  it('returns to the beginning for a new recording', () => {
    renderText(6);
    renderText(0);
    expect(mocks.viewport.scrollTop).toBe(0);
  });

  it('leaves short and hidden viewports stationary', () => {
    mocks.viewport.scrollHeight = 600;
    renderText(5);
    expect(mocks.viewport.scrollTop).toBe(0);
    mocks.viewport.clientHeight = 0;
    renderText(6);
    expect(mocks.viewport.scrollTop).toBe(0);
  });

  it('handles empty text', () => {
    mocks.paragraph.children = [];
    renderText(0, true, '');
    expect(mocks.viewport.scrollTop).toBe(0);
  });

  it('preserves line breaks, blank lines, indentation and punctuation', () => {
    const text = '  Ala (ma) kota.\r\n\nDwa  zdania.\n';
    const html = renderText(null, true, text);
    const paragraph = html.match(/<p class="[^"]*whitespace-pre-wrap">([\s\S]*?)<\/p>/)?.[1];
    expect(paragraph?.replace(/<\/?span>/g, '')).toBe(text);
  });

  it('counts expanded numbers and abbreviations before advancing to the next word', () => {
    mocks.paragraph.children = [100, 100, 500, 500, 900].map((top) => ({
      getBoundingClientRect: () => ({ top: top - mocks.viewport.scrollTop }),
    }));
    renderText(1, true, 'np. 12 koniec');
    expect(mocks.viewport.scrollTop).toBe(0);
    renderText(4, true, 'np. 12 koniec');
    expect(mocks.viewport.scrollTop).toBe(225);
    renderText(7, true, 'np. 12 koniec');
    expect(mocks.viewport.scrollTop).toBe(625);
  });
});
