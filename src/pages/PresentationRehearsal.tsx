import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Copy, Loader2, Pencil, Presentation as PresentationIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, Label, Switch } from '@/components/ui/primitives';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { LivePacePanel, useLiveIndicators } from '@/components/audio/LivePacePanel';
import { RehearsalText } from '@/components/RehearsalText';
import { PresentationContent } from '@/components/PresentationContent';
import { KeepScreenAwakeToggle } from '@/components/KeepScreenAwakeToggle';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { useMobileLayout } from '@/hooks/useMobileLayout';
import { getPresentation } from '@/store/db';
import { useSettings } from '@/store/settings';
import { formatDuration, textStats } from '@/lib/presentation';
import { cn } from '@/lib/utils';
import { presentationText } from '@/lib/presentationDocument';
import { langOf, useT } from '@/i18n';

export default function PresentationRehearsal() {
  const { id } = useParams();
  const presentation = useLiveQuery(() => (id ? getPresentation(id) : null), [id], undefined);
  const text = useMemo(() => presentationText(presentation?.text ?? '', presentation?.document), [presentation]);
  const language = langOf(presentation);
  const target = useSettings((s) => s.targetArticulationRate);
  const t = useT();
  const maxBreathSeconds = useSettings((s) => s.maxContinuousSpeechSeconds);
  const autoScroll = useSettings((s) => s.readingAutoScroll);
  const mobile = useMobileLayout();
  const setSettings = useSettings((s) => s.set);
  const setAutoScroll = useCallback((readingAutoScroll: boolean) => setSettings({ readingAutoScroll }), [setSettings]);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const stats = useMemo(() => textStats(text, target, language), [text, target, language]);
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';
  const { frameColor } = useLiveIndicators(ts.phase, ts.stats, target);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const [searchParams, setSearchParams] = useSearchParams();
  const autoStartAttempted = useRef(false);
  const startSession = ts.start;

  useEffect(() => {
    if (searchParams.get('start') !== '1' || autoStartAttempted.current || !presentation || stats.words < 1 || ts.phase !== 'idle') return;
    autoStartAttempted.current = true;
    const remainingParams = new URLSearchParams(searchParams);
    remainingParams.delete('start');
    setSearchParams(remainingParams, { replace: true });
    void startSession({
      mode: 'presentation',
      targetText: text.trim(),
      presentationId: presentation.id,
      language: langOf(presentation),
    });
  }, [searchParams, setSearchParams, presentation, stats.words, ts.phase, startSession, text]);

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
        <Loader2 className="size-6 animate-spin" aria-label={t.common.loading} />
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="space-y-4">
        <Alert variant="warn">{t.presentations.notFound}</Alert>
        <Button variant="outline" asChild><Link to="/presentations"><ArrowLeft className="size-4" aria-hidden /> {t.presentations.backToList}</Link></Button>
      </div>
    );
  }

  const start = () => ts.start({
    mode: 'presentation',
    targetText: text.trim(),
    presentationId: presentation.id,
    language,
  });
  const stop = async () => {
    const s = await ts.stop();
    if (s) nav(`/session/${s.id}`);
  };

  return (
    <div className={cn('space-y-5', active && 'presentation-rehearsal-active')}>
      <div className="rehearsal-intro">
        {!active && (
          <Link to="/presentations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-4" aria-hidden /> {t.presentations.title}
          </Link>
        )}
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1"><PresentationIcon className="size-6 text-primary" aria-hidden /> <span lang={language}>{presentation.title}</span></h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t.presentations.rehearsal.intro}
        </p>
        <p className="text-muted-foreground text-sm mt-1">
          {t.presentations.estimate(formatDuration(stats.estimatedSeconds))} ({t.presentations.estimateNote})
        </p>
      </div>

      <div className={mobile ? undefined : 'rehearsal-settings flex flex-wrap items-center gap-x-8 gap-y-3'}>
        {!mobile && (
          <div className="flex min-w-60 flex-1 items-center justify-between gap-4">
            <div>
              <Label htmlFor="reading-auto-scroll">{t.presentations.rehearsal.autoScroll}</Label>
              <p id="reading-auto-scroll-description" className="text-xs text-muted-foreground">
                {t.presentations.rehearsal.autoScrollHint}
              </p>
            </div>
            <Switch id="reading-auto-scroll" checked={autoScroll} onCheckedChange={setAutoScroll} aria-describedby="reading-auto-scroll-description" />
          </div>
        )}
        <KeepScreenAwakeToggle active={active} wakeOnMobile className="min-w-60 flex-1" />
      </div>

      {!active && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle>{t.presentations.rehearsal.textTitle}</CardTitle>
                <CardDescription>
                  {t.presentations.words(stats.words)} · {t.presentations.syllables(stats.syllables)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={copyText} disabled={copyStatus === 'copying'}>
                  <Copy className="size-4" aria-hidden /> {t.presentations.rehearsal.copy}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/presentations/${presentation.id}`}><Pencil className="size-4" aria-hidden /> {t.presentations.edit}</Link>
                </Button>
              </div>
            </div>
            <span role="status" className="text-sm text-muted-foreground">
              {copyStatus === 'copied' ? t.presentations.rehearsal.copied : ''}
            </span>
            {copyStatus === 'error' && (
              <Alert variant="bad">{t.presentations.rehearsal.copyError}</Alert>
            )}
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm" tabIndex={0} role="region" aria-label={t.presentations.rehearsal.preview} lang={language}>
              <PresentationContent text={text} document={presentation.document} />
            </div>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card className={cn('rehearsal-card gap-0 border-4 border-current py-0 transition-colors duration-300', frameColor)}>
          <RehearsalText
            text={text}
            document={presentation.document}
            lang={language}
            autoScroll={autoScroll && !mobile}
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

      {(ts.error || ts.deviceWarning) && (
        <div className="rehearsal-errors">
          <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
        </div>
      )}
      <div className="rehearsal-controls flex items-center gap-3">
        <RecordControls phase={ts.phase} onStart={start} onStop={stop} disabled={stats.words < 1} />
        {ts.phase === 'recording' && <span className="text-sm text-muted-foreground">{t.presentations.rehearsal.recordingHint}</span>}
      </div>
      {active && (
        <div className="rehearsal-diagnostics">
          <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} showBreath={false} compactMobile />
        </div>
      )}
    </div>
  );
}
