import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Clock, Gauge, Loader2, Pencil, Presentation as PresentationIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, Label, Switch } from '@/components/ui/primitives';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { rateZone } from '@/components/audio/SpeedometerGauge';
import { BreathBar } from '@/components/audio/BreathBar';
import { SessionTime } from '@/components/SessionTime';
import { RehearsalText } from '@/components/RehearsalText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { getPresentation } from '@/store/db';
import { useSettings } from '@/store/settings';
import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import { formatDuration } from '@/lib/presentation';
import { cn } from '@/lib/utils';

export default function PresentationRehearsal() {
  const { id } = useParams();
  const presentation = useLiveQuery(() => (id ? getPresentation(id) : null), [id], undefined);
  const text = presentation?.text ?? '';
  const target = useSettings((s) => s.targetArticulationRate);
  const maxBreathSeconds = useSettings((s) => s.maxContinuousSpeechSeconds);
  const autoScroll = useSettings((s) => s.readingAutoScroll);
  const setSettings = useSettings((s) => s.set);
  const setAutoScroll = useCallback((readingAutoScroll: boolean) => setSettings({ readingAutoScroll }), [setSettings]);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const tokens = useMemo(() => normalizeText(text), [text]);
  const syl = useMemo(() => countTextSyllables(tokens.map((t) => t.word)), [tokens]);
  const estimated = Math.round(syl / ((target[0] + target[1]) / 2));
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';
  const rate = ts.phase === 'recording' && !ts.stats?.calibrating ? ts.stats?.syllableRate ?? null : null;
  const pace = rateZone(rate, target);
  const breathState = ts.phase === 'recording' && !ts.stats?.calibrating ? ts.stats?.breathState ?? 'ok' : 'ok';
  const frameColor = breathState === 'critical' || pace.cls === 'text-bad' ? 'text-bad'
    : breathState === 'warn' ? 'text-warn'
    : pace.cls;
  const breathInactiveLabel = ts.phase === 'starting' ? 'Uruchamianie…'
    : ts.phase === 'processing' ? 'Analizowanie…'
    : ts.stats?.calibrating ? 'Kalibracja…'
    : !ts.stats ? 'Oczekiwanie…'
    : undefined;
  const paceLabel = ts.phase === 'starting' ? 'Uruchamiam mikrofon…'
    : ts.phase === 'processing' ? 'Analizuję nagranie…'
    : ts.stats?.calibrating ? 'Zachowaj ciszę – kalibracja'
    : rate === null ? 'Czytaj – mierzę tempo…'
    : pace.label;

  if (presentation === undefined) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-label="Ładowanie" />
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="space-y-4">
        <Alert variant="warn">Nie znaleziono tej prezentacji – mogła zostać usunięta.</Alert>
        <Button variant="outline" asChild><Link to="/"><ArrowLeft className="size-4" aria-hidden /> Wróć do listy</Link></Button>
      </div>
    );
  }

  const start = () => ts.start({
    mode: 'presentation',
    targetText: text.trim(),
    presentationId: presentation.id,
    targetDurationSeconds: presentation.targetDurationSeconds,
  });
  const stop = async () => {
    const s = await ts.stop();
    if (s) nav(`/session/${s.id}`);
  };

  return (
    <div className="space-y-5">
      <div>
        {!active && (
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-4" aria-hidden /> Prezentacje
          </Link>
        )}
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1"><PresentationIcon className="size-6 text-primary" aria-hidden /> {presentation.title}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wygłoś prezentację na głos. Na bieżąco widzisz tempo, a pasek oddechu przypomni Ci o wdechu, gdy mówisz zbyt długo bez przerwy.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="reading-auto-scroll">Automatyczne przewijanie tekstu</Label>
          <p id="reading-auto-scroll-description" className="text-xs text-muted-foreground">
            Szacuje postęp na podstawie wykrytych sylab. Zatrzymuje się podczas ciszy.
          </p>
        </div>
        <Switch id="reading-auto-scroll" checked={autoScroll} onCheckedChange={setAutoScroll} aria-describedby="reading-auto-scroll-description" />
      </div>

      {!active && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle>Tekst prezentacji</CardTitle>
                <CardDescription>
                  {tokens.length} słów · {syl} sylab · w Twoim tempie docelowym ok. {formatDuration(estimated)} mówienia
                  {presentation.targetDurationSeconds !== undefined && (
                    <span className="inline-flex items-center gap-1"> · <Clock className="size-3" aria-hidden /> limit {formatDuration(presentation.targetDurationSeconds)}</span>
                  )}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/presentations/${presentation.id}`}><Pencil className="size-4" aria-hidden /> Edytuj</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm" tabIndex={0} role="region" aria-label="Podgląd tekstu prezentacji">
              {text}
            </div>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card className={cn('gap-0 border-4 border-current py-0 transition-colors duration-300', frameColor)}>
          <RehearsalText
            text={text}
            autoScroll={autoScroll}
            onAutoScrollChange={setAutoScroll}
            syllablesRead={ts.phase === 'recording' && ts.stats && !ts.stats.calibrating ? ts.stats.syllables : null}
          >
            <div className="grid w-full grid-cols-2 gap-3">
              <div className={cn('min-w-0 rounded-lg border-2 border-current bg-current/10 p-3 transition-colors duration-300', pace.cls)}>
                <div className="flex h-6 items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                  <Gauge className="size-5 shrink-0" aria-hidden /> <span className="truncate">Tempo czytania</span>
                </div>
                <div className="h-12 whitespace-nowrap text-4xl font-bold leading-[3rem] tabular-nums sm:text-5xl">
                  {rate !== null ? rate.toFixed(1) : '–'} <span className="text-sm font-normal text-muted-foreground">syl/s</span>
                </div>
                <div className="my-1 flex h-4 items-center gap-2" aria-hidden>
                  <span className="h-2 w-full rounded-full bg-current" />
                </div>
                <div className="h-7 truncate text-lg font-bold leading-7" title={paceLabel}>
                  <span role="status">{paceLabel}</span>
                </div>
              </div>
              <BreathBar
                runMs={ts.stats?.breathRunMs ?? 0}
                maxMs={maxBreathSeconds * 1000}
                state={ts.stats?.breathState ?? 'ok'}
                inactiveLabel={breathInactiveLabel}
              />
              <div className="col-span-2 min-w-0">
                <SessionTime seconds={(ts.stats?.elapsedMs ?? 0) / 1000} targetSeconds={presentation.targetDurationSeconds} compact />
              </div>
            </div>
          </RehearsalText>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      <div className="flex items-center gap-3">
        <RecordControls phase={ts.phase} onStart={start} onStop={stop} disabled={tokens.length < 1} />
        {ts.phase === 'recording' && <span className="text-sm text-muted-foreground">Mów naturalnie. Kliknij „Zakończ”, gdy skończysz.</span>}
      </div>
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} showBreath={false} />}
    </div>
  );
}
