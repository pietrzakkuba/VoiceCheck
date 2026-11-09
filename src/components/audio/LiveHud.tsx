import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Loader2, Mic, MicOff, Square, VolumeX } from 'lucide-react';
import type { LiveStats } from '@/audio/liveAnalyzer';
import { Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BreathBar } from './BreathBar';
import { WaveformCanvas } from './WaveformCanvas';
import { useSettings } from '@/store/settings';
import { formatMs } from '@/lib/utils';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import { T } from '@/engine/thresholds';

export function LiveHud({ stats, getDb, getSpeaking, showBreath = true }: {
  stats: LiveStats | null;
  getDb: () => ArrayLike<number> | null;
  getSpeaking: () => boolean;
  showBreath?: boolean;
}) {
  const s = useSettings();
  return (
    <div className="space-y-3">
      {stats?.calibrating && (
        <Alert variant="info" className="justify-center text-base font-medium">
          <MicOff className="size-5" aria-hidden /> Zachowaj ciszę (2 s) – mierzę szum tła…
        </Alert>
      )}
        <div className="space-y-3">
          {showBreath && <BreathBar runMs={stats?.breathRunMs ?? 0} maxMs={s.maxContinuousSpeechSeconds * 1000} state={stats?.breathState ?? 'ok'} />}
          <WaveformCanvas getDb={getDb} getSpeaking={getSpeaking} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>Czas: {formatMs(stats?.elapsedMs ?? 0)}</span>
            <span>Mowa: {formatMs(stats?.speechMs ?? 0)}</span>
            <span>SNR: {stats?.snrDb != null ? `${stats.snrDb.toFixed(0)} dB` : '–'}</span>
            <span className={stats?.speaking ? 'text-primary font-medium' : ''}>{stats?.speaking ? '● mówisz' : '○ cisza'}</span>
        </div>
      </div>
      {stats?.snrDb != null && stats.snrDb < T.snrWarnDb && (
        <Alert variant="warn"><VolumeX className="size-4 mt-0.5" aria-hidden /> Duży szum tła (SNR {stats.snrDb.toFixed(0)} dB). Wyniki mogą być mniej wiarygodne – przejdź w cichsze miejsce lub przybliż mikrofon.</Alert>
      )}
      {stats?.clipping && (
        <Alert variant="bad"><AlertTriangle className="size-4 mt-0.5" aria-hidden /> Przesterowanie! Odsuń mikrofon lub zmniejsz jego czułość w systemie.</Alert>
      )}
    </div>
  );
}

/** Start/stop control with processing state. */
export function RecordControls({ phase, onStart, onStop, startLabel = 'Rozpocznij nagranie', stopLabel = 'Zakończ', disabled }: {
  phase: SessionPhase;
  onStart: () => void;
  onStop: () => void;
  startLabel?: string;
  stopLabel?: string;
  disabled?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const actionPending = useRef(false);
  const hintId = useId();
  const busy = phase === 'starting' || phase === 'processing';
  const unavailable = busy || (phase !== 'recording' && disabled);

  useEffect(() => {
    actionPending.current = false;
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable ||
        (target !== buttonRef.current && target.closest('input, textarea, select, button, a[href], summary, audio, video, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"], [role="tab"], [role="dialog"], [role="alertdialog"], [aria-modal="true"]'))
      )) return;
      if (unavailable && !busy) return;
      event.preventDefault();
      if (event.repeat || unavailable || actionPending.current) return;
      actionPending.current = true;
      if (phase === 'recording') onStop();
      else onStart();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [phase, onStart, onStop, busy, unavailable]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Button
        ref={buttonRef}
        size="lg"
        variant={phase === 'recording' ? 'destructive' : 'default'}
        onClick={phase === 'recording' ? onStop : onStart}
        disabled={unavailable}
        aria-keyshortcuts={unavailable ? undefined : 'Space'}
        aria-describedby={unavailable ? undefined : hintId}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : phase === 'recording' ? <Square aria-hidden /> : <Mic aria-hidden />}
        {phase === 'starting' ? 'Uruchamiam mikrofon…' : phase === 'processing' ? 'Analizuję…' : phase === 'recording' ? stopLabel : startLabel}
      </Button>
      {!unavailable && (
        <p id={hintId} className="text-sm leading-7 text-muted-foreground">
          <kbd className="rounded border bg-muted px-2 py-1 font-sans text-xs">Spacja</kbd>
          {' — '}{phase === 'recording' ? 'zakończ nagranie' : 'rozpocznij nagranie'}
        </p>
      )}
    </div>
  );
}

export function SessionErrors({ error, deviceWarning }: { error: string | null; deviceWarning: string | null }) {
  if (!error && !deviceWarning) return null;
  return (
    <div className="space-y-2">
      {error && <Alert variant="bad"><AlertTriangle className="size-4 mt-0.5" aria-hidden /> {error}</Alert>}
      {deviceWarning && <Alert variant="warn"><AlertTriangle className="size-4 mt-0.5" aria-hidden /> {deviceWarning}</Alert>}
    </div>
  );
}

export function HudCard(props: React.ComponentProps<typeof LiveHud>) {
  return (
    <Card>
      <CardContent>
        <LiveHud {...props} />
      </CardContent>
    </Card>
  );
}
