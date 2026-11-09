import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LiveStats } from '@/audio/liveAnalyzer';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import type { Presentation } from '@/types';
import type { SettingsState } from '@/store/settings';
import { DEFAULT_SETTINGS } from '@/store/settings';
import PresentationRehearsal from './PresentationRehearsal';

const PRESENTATION: Presentation = {
  id: 'p1',
  title: 'Wyniki kwartalne',
  text: 'Dzień dobry państwu. Dziś opowiem o wynikach naszego zespołu w ostatnim kwartale.',
  targetDurationSeconds: 300,
  createdAt: 1,
  updatedAt: 1,
};

const mocks = vi.hoisted(() => ({
  phase: 'idle' as SessionPhase,
  stats: null as LiveStats | null,
  presentation: undefined as Presentation | null | undefined,
  start: vi.fn(),
  autoScroll: true,
  maxBreathSeconds: 8,
  setSettings: vi.fn(),
  toggleScroll: undefined as ((checked: boolean) => void) | undefined,
  readingProps: undefined as { autoScroll: boolean; syllablesRead: number | null } | undefined,
}));

vi.mock('@/store/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/settings')>();
  return {
    ...actual,
    useSettings: (selector: (settings: SettingsState) => unknown) => selector({
      ...actual.useSettings.getState(), readingAutoScroll: mocks.autoScroll, maxContinuousSpeechSeconds: mocks.maxBreathSeconds, set: mocks.setSettings,
    }),
  };
});
vi.mock('@/components/ui/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/primitives')>();
  return {
    ...actual,
    Switch: (props: React.ComponentProps<typeof actual.Switch>) => {
      mocks.toggleScroll = props.onCheckedChange;
      return <actual.Switch {...props} />;
    },
  };
});
vi.mock('@/components/RehearsalText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/RehearsalText')>();
  return {
    RehearsalText: (props: React.ComponentProps<typeof actual.RehearsalText>) => {
      mocks.readingProps = props;
      return <actual.RehearsalText {...props} />;
    },
  };
});

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: 'p1' }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => mocks.presentation,
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

function liveStats(rate: number | null, calibrating = false): LiveStats {
  return {
    elapsedMs: 5000,
    calibrating,
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

describe('presentation rehearsal', () => {
  beforeEach(() => {
    mocks.phase = 'idle';
    mocks.stats = null;
    mocks.presentation = PRESENTATION;
    mocks.start.mockClear();
    mocks.autoScroll = DEFAULT_SETTINGS.readingAutoScroll;
    mocks.maxBreathSeconds = DEFAULT_SETTINGS.maxContinuousSpeechSeconds;
    mocks.toggleScroll = undefined;
    mocks.readingProps = undefined;
    mocks.setSettings.mockReset();
    mocks.setSettings.mockImplementation(({ readingAutoScroll }: { readingAutoScroll: boolean }) => {
      mocks.autoScroll = readingAutoScroll;
    });
  });

  it('shows the presentation text and limit before recording', () => {
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain('Wyniki kwartalne');
    expect(html).toContain('Dziś opowiem o wynikach');
    expect(html).toContain('limit 5:00');
    expect(html).toContain('href="/presentations/p1"');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('Tempo czytania');
    expect(html).not.toContain('Live HUD');
  });

  it('records the session as a rehearsal of this presentation', () => {
    renderToStaticMarkup(<PresentationRehearsal />);
    expect(mocks.start).toHaveBeenCalledWith({
      mode: 'presentation', targetText: PRESENTATION.text, presentationId: 'p1', targetDurationSeconds: 300,
    });
  });

  it.each(['idle', 'starting', 'recording', 'processing'] as const)('enables auto-scroll by default with a switch during %s', (phase) => {
    mocks.phase = phase;
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain('Automatyczne przewijanie tekstu');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('id="reading-auto-scroll"');
  });

  it('lets the user disable and re-enable auto-scroll during recording', () => {
    mocks.phase = 'recording';
    mocks.stats = liveStats(5);
    renderToStaticMarkup(<PresentationRehearsal />);
    mocks.toggleScroll!(false);
    const disabled = renderToStaticMarkup(<PresentationRehearsal />);
    expect(mocks.setSettings).toHaveBeenCalledWith({ readingAutoScroll: false });
    expect(disabled).toContain('aria-checked="false"');
    expect(mocks.readingProps).toMatchObject({ autoScroll: false, syllablesRead: 15 });
    mocks.toggleScroll!(true);
    const enabled = renderToStaticMarkup(<PresentationRehearsal />);
    expect(enabled).toContain('aria-checked="true"');
    expect(mocks.readingProps).toMatchObject({ autoScroll: true, syllablesRead: 15 });
  });

  it.each([
    ['starting', liveStats(5)],
    ['recording', liveStats(5, true)],
    ['processing', liveStats(5)],
    ['recording', null],
  ] as const)('does not follow syllables during %s without active calibrated recording', (phase, stats) => {
    mocks.phase = phase;
    mocks.stats = stats;
    renderToStaticMarkup(<PresentationRehearsal />);
    expect(mocks.readingProps?.syllablesRead).toBeNull();
  });

  it('shows a message when the presentation does not exist', () => {
    mocks.presentation = null;
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain('Nie znaleziono tej prezentacji');
    expect(html).not.toContain('Nagrywanie');
  });

  it('shows elapsed and remaining time next to the text', () => {
    mocks.phase = 'recording';
    mocks.stats = liveStats(5);
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain('role="timer"');
    expect(html).toContain('0:05');
    expect(html).toContain('Pozostało 4:55');
  });

  it.each([
    ['ok', 1000, 'border-ok', 'Rób krótkie pauzy'],
    ['warn', 7000, 'border-warn', 'Zaplanuj oddech'],
    ['critical', 9000, 'border-bad', 'Weź oddech!'],
  ] as const)('shows the %s breath indicator in the sticky header beside the pace', (state, runMs, cls, label) => {
    mocks.phase = 'recording';
    mocks.stats = { ...liveStats(5), breathState: state, breathRunMs: runMs };
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    const header = html.slice(html.indexOf('sticky top-0'), html.indexOf('<p class="text-xl'));
    expect(header).toContain('Tempo czytania');
    expect(header).toContain('Oddech');
    expect(header).toContain('role="meter"');
    expect(header).toContain(cls);
    expect(header).toContain(label);
    expect(header).toContain(`${(runMs / 1000).toFixed(1)} <span`);
    expect(header).toContain('aria-valuemax="8"');
    expect(header).toContain(`aria-valuenow="${Math.min(runMs / 1000, 8)}"`);
  });

  it('uses the configured breath limit next to the text', () => {
    mocks.phase = 'recording';
    mocks.stats = liveStats(5);
    mocks.maxBreathSeconds = 12;
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain('aria-valuemax="12"');
    expect(html).toContain('/ 12 s');
  });

  it.each([
    ['starting', liveStats(7), 'Uruchamianie…'],
    ['recording', liveStats(7, true), 'Kalibracja…'],
    ['processing', liveStats(7), 'Analizowanie…'],
    ['recording', null, 'Oczekiwanie…'],
  ] as const)('keeps the breath panel mounted with a neutral status during %s', (phase, stats, label) => {
    mocks.phase = phase;
    mocks.stats = stats ? { ...stats, breathState: 'critical' } : null;
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain('role="meter"');
    expect(html).toContain('Oddech');
    expect(html).toContain(label);
    expect(html).toContain('aria-valuenow="0"');
    expect(html).not.toContain('Weź oddech!');
  });

  it('gives the pace a dedicated highlighted panel with a large value and fixed status space', () => {
    mocks.phase = 'recording';
    mocks.stats = liveStats(5);
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain('border-2 border-current bg-current/10');
    expect(html).toContain('text-4xl font-bold');
    expect(html).toContain('sm:text-5xl');
    expect(html).toContain('h-7 truncate text-lg font-bold');
    expect(html).toContain('grid w-full grid-cols-2');
  });

  it.each(['starting', 'recording', 'processing'] as const)('preserves original line breaks during %s', (phase) => {
    mocks.phase = phase;
    mocks.presentation = { ...PRESENTATION, text: 'Pierwszy wiersz.\nDrugi wiersz.\n\nNowy akapit.\r\n  1 000 - (koniec).' };
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    const paragraph = html.match(/<p class="[^"]*whitespace-pre-wrap">([\s\S]*?)<\/p>/)?.[1];
    expect(paragraph?.replace(/<\/?span>/g, '')).toBe(mocks.presentation.text);
  });

  it.each([
    [3, 'Bardzo wolno', 'text-info'],
    [3.8, 'Spokojnie', 'text-ok'],
    [4, 'Dobre tempo', 'text-ok'],
    [5.5, 'Dobre tempo', 'text-ok'],
    [6, 'Szybko', 'text-warn'],
    [6.5, 'Szybko', 'text-warn'],
    [7, 'Za szybko!', 'text-bad'],
  ])('shows rate %s next to the text with the shared gauge status', (rate, label, cls) => {
    mocks.phase = 'recording';
    mocks.stats = liveStats(rate);
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain(`border-current py-0 transition-colors duration-300 ${cls}`);
    expect(html).toContain(`<span role="status">${label}</span>`);
    expect(html).toContain(`${rate.toFixed(1)} <span`);
    expect(html.indexOf('Tempo czytania')).toBeLessThan(html.indexOf('<p class="text-xl'));
    expect(html).toContain('max-h-[65vh] overflow-y-auto');
    expect(html).toContain('sticky top-0');
    expect(html).toContain('Live HUD');
    expect(html).not.toContain('<textarea');
  });

  it.each([
    ['starting', null, 'Uruchamiam mikrofon…'],
    ['recording', null, 'Czytaj – mierzę tempo…'],
    ['recording', liveStats(7, true), 'Zachowaj ciszę – kalibracja'],
    ['processing', liveStats(7), 'Analizuję nagranie…'],
  ] as const)('shows a neutral status during %s without a valid live rate', (phase, stats, label) => {
    mocks.phase = phase;
    mocks.stats = stats;
    const html = renderToStaticMarkup(<PresentationRehearsal />);
    expect(html).toContain(`<span role="status">${label}</span>`);
    expect(html).toContain('border-current py-0 transition-colors duration-300 text-muted-foreground');
    expect(html).not.toContain('Za szybko!');
  });
});
