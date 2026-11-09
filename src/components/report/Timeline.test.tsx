import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TrainingSession } from '@/types';
import { Timeline } from './Timeline';

const mocks = vi.hoisted(() => ({
  viewport: { clientWidth: 1000, scrollWidth: 3600, scrollLeft: 0 },
  effects: [] as Array<() => void>,
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: () => ({ current: mocks.viewport }),
  useEffect: (effect: () => void) => { mocks.effects.push(effect); },
}));

const session: TrainingSession = {
  schema: 2, id: 'timeline', timestamp: 0, mode: 'presentation',
  deviceLabel: '', durationSeconds: 60, audioKey: '', noiseFloorDb: -60,
  settings: {
    targetArticulationRate: [4.5, 5.5], maxContinuousSpeechSeconds: 8,
    syllableCorrection: 1, syllablesPerWord: 2,
  },
  metrics: {
    articulationRate: 0, speechRate: 0, wpm: 0, syllables: 0, speechMs: 0,
    phraseCount: 0, breathCount: 0, breathsPerMinute: 0, longestPhraseMs: 0,
    meanPhraseMs: 0, overLimitPhrases: 0, fastPhrases: 0, meanPauseMs: 0, snrDb: 0,
  },
  phrases: [], pauses: [], tips: [], warnings: [],
  tracks: { waveform: [], speechSegments: [], nucleiMs: [] },
};

function updateTime(currentMs: number, durationSeconds = 60) {
  mocks.effects = [];
  renderToStaticMarkup(
    <Timeline session={{ ...session, durationSeconds }} currentMs={currentMs} onSeek={vi.fn()} onSelectPhrase={vi.fn()} />,
  );
  mocks.effects.forEach((effect) => effect());
}

describe('timeline auto-scroll', () => {
  beforeEach(() => {
    Object.assign(mocks.viewport, { clientWidth: 1000, scrollWidth: 3600, scrollLeft: 0 });
  });

  it('does not scroll while the playhead is before the follow position', () => {
    updateTime(10000);
    expect(mocks.viewport.scrollLeft).toBe(0);
  });

  it('follows playback with space ahead of the playhead', () => {
    updateTime(15000);
    expect(mocks.viewport.scrollLeft).toBe(100);
    updateTime(16000);
    expect(mocks.viewport.scrollLeft).toBe(160);
  });

  it('brings the playhead into view after seeking forward or backward', () => {
    updateTime(40000);
    expect(mocks.viewport.scrollLeft).toBe(1600);
    updateTime(20000);
    expect(mocks.viewport.scrollLeft).toBe(400);
    updateTime(0);
    expect(mocks.viewport.scrollLeft).toBe(0);
  });

  it('clamps scrolling at the end of the recording', () => {
    updateTime(60000);
    expect(mocks.viewport.scrollLeft).toBe(2600);
    updateTime(65000);
    expect(mocks.viewport.scrollLeft).toBe(2600);
  });

  it('keeps short recordings without horizontal overflow stationary', () => {
    mocks.viewport.scrollWidth = 1000;
    updateTime(5000, 5);
    expect(mocks.viewport.scrollLeft).toBe(0);
  });

  it('returns to the beginning for negative analysis time', () => {
    mocks.viewport.scrollLeft = 1000;
    updateTime(-200);
    expect(mocks.viewport.scrollLeft).toBe(0);
  });

  it('does not scroll a hidden viewport', () => {
    mocks.viewport.clientWidth = 0;
    updateTime(30000);
    expect(mocks.viewport.scrollLeft).toBe(0);
  });
});
