import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LiveStats } from '@/audio/liveAnalyzer';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import FreeSpeech from './FreeSpeech';

const mocks = vi.hoisted(() => ({
  phase: 'idle' as SessionPhase,
  stats: null as LiveStats | null,
  start: vi.fn(),
}));

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('@/hooks/useTrainingSession', () => ({
  useTrainingSession: () => ({
    phase: mocks.phase,
    stats: mocks.stats,
    error: null,
    deviceWarning: null,
    start: mocks.start,
  }),
}));
vi.mock('@/components/audio/LiveHud', () => ({
  RecordControls: ({ onStart }: { onStart: () => void }) => {
    onStart();
    return <button>Nagrywanie</button>;
  },
  HudCard: () => <div>Live HUD</div>,
  SessionErrors: () => null,
}));

function liveStats(rate: number | null): LiveStats {
  return {
    elapsedMs: 65000,
    calibrating: false,
    levelDb: -20,
    noiseFloorDb: -60,
    snrDb: 40,
    speaking: true,
    syllableRate: rate,
    wpm: rate === null ? null : rate * 30,
    breathRunMs: 1000,
    breathState: 'ok',
    clipping: false,
    speechMs: 3000,
    syllables: 15,
  };
}

describe('free speech', () => {
  beforeEach(() => {
    mocks.phase = 'idle';
    mocks.stats = null;
    mocks.start.mockClear();
  });

  it('explains the mode before recording without live panels', () => {
    const html = renderToStaticMarkup(<FreeSpeech />);
    expect(html).toContain('Swobodne mówienie');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('Tempo czytania');
    expect(html).not.toContain('Live HUD');
  });

  it('records a free_speech session without text or time limit', () => {
    renderToStaticMarkup(<FreeSpeech />);
    expect(mocks.start).toHaveBeenCalledWith({ mode: 'free_speech' });
  });

  it('shows pace, breath and elapsed time without a limit during recording', () => {
    mocks.phase = 'recording';
    mocks.stats = { ...liveStats(7), breathState: 'warn', breathRunMs: 7000 };
    const html = renderToStaticMarkup(<FreeSpeech />);
    expect(html).toContain('Tempo czytania');
    expect(html).toContain('<span role="status">Za szybko!</span>');
    expect(html).toContain('role="meter"');
    expect(html).toContain('role="timer"');
    expect(html).toContain('1:05');
    expect(html).not.toContain('Pozostało');
    expect(html).toContain('border-current py-0 transition-colors duration-300 text-bad');
    expect(html).toContain('Live HUD');
  });
});
