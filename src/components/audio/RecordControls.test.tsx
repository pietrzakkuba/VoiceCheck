import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import { RecordControls } from './LiveHud';

const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  deps: [] as Array<readonly unknown[]>,
  cleanups: [] as Array<void | (() => void)>,
  refs: [] as Array<{ current: unknown }>,
  effectIndex: 0,
  refIndex: 0,
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const index = mocks.refIndex++;
    return mocks.refs[index] ??= { current: initial };
  },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = mocks.effectIndex++;
    const previous = mocks.deps[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      mocks.deps[index] = deps;
      mocks.effects.push(() => {
        mocks.cleanups[index]?.();
        mocks.cleanups[index] = effect();
      });
    }
  },
}));

class Target {
  constructor(private selector = '', public isContentEditable = false) {}
  closest(selectors: string) {
    return selectors.split(', ').includes(this.selector) ? this : null;
  }
}

function render(phase: SessionPhase = 'idle', disabled = false) {
  mocks.effects = [];
  mocks.effectIndex = 0;
  mocks.refIndex = 0;
  const html = renderToStaticMarkup(
    <RecordControls phase={phase} disabled={disabled} onStart={mocks.start} onStop={mocks.stop} />,
  );
  mocks.effects.forEach((effect) => effect());
  return html;
}

function press(properties: Record<string, unknown> = {}, target = new Target()) {
  const event = new Event('keydown', { cancelable: true });
  const { defaultPrevented, ...keys } = properties;
  Object.assign(event, { key: ' ', ...keys });
  if (defaultPrevented) event.preventDefault();
  Object.defineProperty(event, 'target', { value: target });
  document.dispatchEvent(event);
  return event;
}

describe('recording space shortcut', () => {
  beforeEach(() => {
    mocks.effects = [];
    mocks.deps = [];
    mocks.cleanups = [];
    mocks.refs = [];
    mocks.start.mockReset();
    mocks.stop.mockReset();
    const listeners = new Set<EventListener>();
    vi.stubGlobal('document', {
      addEventListener: vi.fn((_type: string, listener: EventListener) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: EventListener) => listeners.delete(listener)),
      dispatchEvent: (event: Event) => {
        listeners.forEach((listener) => listener(event));
        return !event.defaultPrevented;
      },
    });
    vi.stubGlobal('HTMLElement', Target);
  });

  afterEach(() => {
    mocks.cleanups.forEach((cleanup) => cleanup?.());
    vi.unstubAllGlobals();
  });

  it('starts and stops with space, prevents page scrolling and updates the hint', () => {
    const idle = render();
    expect(idle).toContain('flex flex-wrap items-center gap-x-4 gap-y-3');
    expect(idle).toContain('Spacja');
    expect(idle).toContain('rozpocznij nagranie');
    expect(idle).toContain('aria-keyshortcuts="Space"');
    expect(press().defaultPrevented).toBe(true);
    expect(mocks.start).toHaveBeenCalledOnce();
    const recording = render('recording');
    expect(recording).toContain('zakończ nagranie');
    press();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it('handles space while the recording button is focused without a second native activation', () => {
    render();
    const button = new Target('button');
    mocks.refs[0].current = button;
    expect(press({}, button).defaultPrevented).toBe(true);
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it('ignores held space and duplicate events before the phase changes', () => {
    render();
    press();
    expect(press({ repeat: true }).defaultPrevented).toBe(true);
    press();
    render();
    press();
    expect(mocks.start).toHaveBeenCalledOnce();
    render('recording');
    press({ repeat: true });
    expect(mocks.stop).not.toHaveBeenCalled();
    press();
    press();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it.each(['starting', 'processing'] as const)('does not toggle during %s', (phase) => {
    const html = render(phase);
    expect(html).not.toContain('aria-keyshortcuts');
    expect(html).not.toContain('Spacja');
    expect(press().defaultPrevented).toBe(true);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('respects disabled starts but still allows an active recording to stop', () => {
    expect(render('idle', true)).not.toContain('Spacja');
    expect(press().defaultPrevented).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    render('recording', true);
    press();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });

  it('allows retrying after an error', () => {
    render('error');
    press();
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it.each([
    'input', 'textarea', 'select', 'button', 'a[href]', 'summary', 'audio', 'video',
    '[role="button"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
    '[role="slider"]', '[role="combobox"]', '[role="listbox"]', '[role="menu"]',
    '[role="menuitem"]', '[role="tab"]', '[role="dialog"]', '[role="alertdialog"]',
    '[aria-modal="true"]',
  ])('does not steal space from %s or its descendants', (selector) => {
    render();
    expect(press({}, new Target(selector)).defaultPrevented).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('does not interrupt content editing', () => {
    render();
    expect(press({}, new Target('', true)).defaultPrevented).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it.each([
    { key: 'Enter' }, { altKey: true }, { ctrlKey: true }, { metaKey: true },
    { shiftKey: true }, { isComposing: true }, { repeat: true },
  ])('ignores other keys, modifiers, composition and repeats: %j', (properties) => {
    render();
    press(properties);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('respects previously handled events', () => {
    render();
    press({ defaultPrevented: true });
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('registers in capture phase before text scrolling handlers and removes the listener', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    render();
    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    mocks.cleanups.forEach((cleanup) => cleanup?.());
    expect(remove).toHaveBeenCalledWith('keydown', add.mock.calls[0][1], true);
    press();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
