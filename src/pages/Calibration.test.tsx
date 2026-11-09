// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import Calibration from './Calibration';

const mocks = vi.hoisted(() => ({
  phase: 'idle' as SessionPhase,
}));

vi.mock('@/hooks/useTrainingSession', () => ({
  useTrainingSession: () => ({
    phase: mocks.phase,
    stats: null,
    error: null,
    deviceWarning: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock('@/components/audio/LiveHud', () => ({
  RecordControls: () => <button>Start</button>,
  HudCard: () => <div>Live HUD</div>,
  SessionErrors: () => null,
}));
vi.mock('@/lib/sessionPipeline', () => ({
  recomputeSession: vi.fn(),
}));
vi.mock('@/store/db', () => ({
  saveBaseline: vi.fn(),
}));

function renderCalibration() {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/settings', '/calibration']}><Calibration /></MemoryRouter>,
  );
  return container;
}

describe('calibration return navigation', () => {
  beforeEach(() => {
    mocks.phase = 'idle';
  });

  it.each(['idle', 'error'] as const)('shows a home link above the title during %s, regardless of history', (phase) => {
    mocks.phase = phase;
    const container = renderCalibration();
    const link = container.querySelector('a[href="/"]');
    const heading = container.querySelector('h1');

    expect(link?.textContent?.trim()).toBe('Strona główna');
    expect(link?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(link?.className).toContain('focus-visible:ring-');
    expect(heading?.textContent?.trim()).toBe('Kalibracja');
    expect(link && heading && Boolean(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(container.textContent).toContain('Około minuty czytania.');
  });

  it.each(['starting', 'recording', 'processing'] as const)('hides the home link during %s without hiding the title', (phase) => {
    mocks.phase = phase;
    const container = renderCalibration();

    expect(container.querySelector('a[href="/"]')).toBeNull();
    expect(container.querySelector('h1')?.textContent?.trim()).toBe('Kalibracja');
    expect(container.textContent).toContain('Około minuty czytania.');
  });
});
