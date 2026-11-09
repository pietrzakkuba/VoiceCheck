import { AlertTriangle, Loader2, Mic, MicOff, Square, VolumeX } from 'lucide-react';
import type { LiveStats } from '@/audio/liveAnalyzer';
import { Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SpeedometerGauge } from './SpeedometerGauge';
import { BreathBar } from './BreathBar';
import { WaveformCanvas } from './WaveformCanvas';
import { useSettings } from '@/store/settings';
import { formatMs } from '@/lib/utils';
import type { SessionPhase } from '@/hooks/useTrainingSession';
import { T } from '@/engine/thresholds';

export function LiveHud({ stats, getDb, getSpeaking, compact }: {
  stats: LiveStats | null;
  getDb: () => ArrayLike<number> | null;
  getSpeaking: () => boolean;
  compact?: boolean;
}) {
  const s = useSettings();
  return (
    <div className="space-y-3">
      {stats?.calibrating && (
        <Alert variant="info" className="justify-center text-base font-medium">
          <MicOff className="size-5" aria-hidden /> Zachowaj ciszę (2 s) – mierzę szum tła…
        </Alert>
      )}
      <div className={compact ? 'grid gap-3 sm:grid-cols-[200px_1fr] items-center' : 'grid gap-4 md:grid-cols-[260px_1fr] items-center'}>
        <SpeedometerGauge rate={stats?.syllableRate ?? null} wpm={stats?.wpm ?? null} target={s.targetArticulationRate} />
        <div className="space-y-3">
          <BreathBar runMs={stats?.breathRunMs ?? 0} maxMs={s.maxContinuousSpeechSeconds * 1000} state={stats?.breathState ?? 'ok'} />
          <WaveformCanvas getDb={getDb} getSpeaking={getSpeaking} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>Czas: {formatMs(stats?.elapsedMs ?? 0)}</span>
            <span>Mowa: {formatMs(stats?.speechMs ?? 0)}</span>
            <span>SNR: {stats?.snrDb != null ? `${stats.snrDb.toFixed(0)} dB` : '–'}</span>
            <span className={stats?.speaking ? 'text-primary font-medium' : ''}>{stats?.speaking ? '● mówisz' : '○ cisza'}</span>
          </div>
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
  if (phase === 'recording') {
    return <Button size="lg" variant="destructive" onClick={onStop}><Square aria-hidden /> {stopLabel}</Button>;
  }
  if (phase === 'processing' || phase === 'starting') {
    return (
      <Button size="lg" disabled><Loader2 className="animate-spin" aria-hidden /> {phase === 'starting' ? 'Uruchamiam mikrofon…' : 'Analizuję…'}</Button>
    );
  }
  return <Button size="lg" onClick={onStart} disabled={disabled}><Mic aria-hidden /> {startLabel}</Button>;
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
