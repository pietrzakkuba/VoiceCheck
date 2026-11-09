import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Copy, Loader2, Pencil, Presentation as PresentationIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, Label, Switch } from '@/components/ui/primitives';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { LivePacePanel, liveIndicators } from '@/components/audio/LivePacePanel';
import { RehearsalText } from '@/components/RehearsalText';
import { PresentationContent } from '@/components/PresentationContent';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { getPresentation } from '@/store/db';
import { useSettings } from '@/store/settings';
import { formatDuration, textStats } from '@/lib/presentation';
import { cn } from '@/lib/utils';
import { presentationText } from '@/lib/presentationDocument';

export default function PresentationRehearsal() {
  const { id } = useParams();
  const presentation = useLiveQuery(() => (id ? getPresentation(id) : null), [id], undefined);
  const text = useMemo(() => presentationText(presentation?.text ?? '', presentation?.document), [presentation]);
  const target = useSettings((s) => s.targetArticulationRate);
  const maxBreathSeconds = useSettings((s) => s.maxContinuousSpeechSeconds);
  const autoScroll = useSettings((s) => s.readingAutoScroll);
  const setSettings = useSettings((s) => s.set);
  const setAutoScroll = useCallback((readingAutoScroll: boolean) => setSettings({ readingAutoScroll }), [setSettings]);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const stats = useMemo(() => textStats(text, target), [text, target]);
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';
  const { frameColor } = liveIndicators(ts.phase, ts.stats, target);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  const copyText = async () => {
    setCopyStatus('copying');
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

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
        <p className="text-muted-foreground text-sm mt-1">
          Szacowany czas czytania: ok. {formatDuration(stats.estimatedSeconds)} (w Twoim tempie docelowym, bez pauz)
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
                  {stats.words} słów · {stats.syllables} sylab
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={copyText} disabled={copyStatus === 'copying'}>
                  <Copy className="size-4" aria-hidden /> Kopiuj tekst
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/presentations/${presentation.id}`}><Pencil className="size-4" aria-hidden /> Edytuj</Link>
                </Button>
              </div>
            </div>
            <span role="status" className="text-sm text-muted-foreground">
              {copyStatus === 'copied' ? 'Skopiowano tekst.' : ''}
            </span>
            {copyStatus === 'error' && (
              <Alert variant="bad">Nie udało się skopiować tekstu. Sprawdź uprawnienia schowka lub zaznacz i skopiuj tekst ręcznie.</Alert>
            )}
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm" tabIndex={0} role="region" aria-label="Podgląd tekstu prezentacji">
              <PresentationContent text={text} document={presentation.document} />
            </div>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card className={cn('gap-0 border-4 border-current py-0 transition-colors duration-300', frameColor)}>
          <RehearsalText
            text={text}
            document={presentation.document}
            autoScroll={autoScroll}
            onAutoScrollChange={setAutoScroll}
            syllablesRead={ts.phase === 'recording' && ts.stats && !ts.stats.calibrating ? ts.stats.syllables : null}
          >
            <LivePacePanel
              phase={ts.phase}
              stats={ts.stats}
              target={target}
              maxBreathSeconds={maxBreathSeconds}
            />
          </RehearsalText>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      <div className="flex items-center gap-3">
        <RecordControls phase={ts.phase} onStart={start} onStop={stop} disabled={stats.words < 1} />
        {ts.phase === 'recording' && <span className="text-sm text-muted-foreground">Mów naturalnie. Kliknij „Zakończ”, gdy skończysz.</span>}
      </div>
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} showBreath={false} />}
    </div>
  );
}
