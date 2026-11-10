import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, History, Info, Loader2, Mic, Pause, Play, RefreshCw, Trash2, Wind } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { SessionTime } from '@/components/SessionTime';
import { Alert } from '@/components/ui/primitives';
import { Timeline } from '@/components/report/Timeline';
import { rateZone } from '@/components/audio/SpeedometerGauge';
import { useSessionAudio } from '@/hooks/useSessionAudio';
import { db, deleteSession } from '@/store/db';
import { calibrationFor, useSettings, type SettingsState } from '@/store/settings';
import { recomputeSession } from '@/lib/sessionPipeline';
import { localizeTip, localizeWarning } from '@/lib/tips';
import { sessionTips } from '@/engine/session';
import { LANGUAGE_NAMES, formatDateTime, formatDecimal, langOf, useLang, useT } from '@/i18n';
import { formatDuration, textStats } from '@/lib/presentation';
import { cn, formatMs } from '@/lib/utils';
import type { PhraseTempo, TipSeverity, TrainingSession } from '@/types';

const TEMPO_VARIANT: Record<PhraseTempo, 'ok' | 'warn' | 'bad' | 'info' | 'secondary'> = {
  short: 'secondary',
  slow: 'info',
  ok: 'ok',
  fast: 'warn',
  too_fast: 'bad',
};

const TIP_ICON: Record<TipSeverity, typeof Info> = { bad: AlertTriangle, warn: AlertTriangle, ok: CheckCircle2, info: Info };

function settingsDiffer(s: TrainingSession, cur: SettingsState) {
  const a = s.settings;
  const calibration = calibrationFor(langOf(s), cur);
  return (
    a.targetArticulationRate[0] !== cur.targetArticulationRate[0] ||
    a.targetArticulationRate[1] !== cur.targetArticulationRate[1] ||
    a.maxContinuousSpeechSeconds !== cur.maxContinuousSpeechSeconds ||
    a.syllableCorrection !== calibration.liveSyllableCorrection ||
    a.syllablesPerWord !== calibration.syllablesPerWord
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: React.ReactNode; sub?: React.ReactNode; cls?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('text-2xl font-semibold tabular-nums', cls)}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function SessionReport() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const debug = params.get('debug') === '1';
  const nav = useNavigate();
  const session = useLiveQuery(() => (id ? db.sessions.get(id) : undefined), [id], null);
  const presentationId = session?.presentationId;
  const presentation = useLiveQuery(() => (presentationId ? db.presentations.get(presentationId) : undefined), [presentationId]);
  const settings = useSettings();
  const t = useT();
  const tr = t.report;
  const lang = useLang();
  const fmt1 = (v: number) => formatDecimal(v, 1, lang);
  const audio = useSessionAudio(session?.audioKey, session?.audioOffsetMs ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stale = useMemo(() => (session && session.schema === 2 ? settingsDiffer(session, settings) : false), [session, settings]);

  if (session === null) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {tr.loading}</div>;
  if (!session) {
    return (
      <Alert variant="warn">
        {tr.notFound} <Link className="underline" to="/history">{tr.backToHistory}</Link>
      </Alert>
    );
  }
  if (session.schema !== 2) {
    return (
      <Alert variant="info">
        <Loader2 className="size-4 mt-0.5 animate-spin" aria-hidden /> {tr.migrating}
      </Alert>
    );
  }

  const m = session.metrics;
  const [lo, hi] = session.settings.targetArticulationRate;
  const limitS = session.settings.maxContinuousSpeechSeconds;
  const zone = rateZone(m.syllables > 0 ? m.articulationRate : null, [lo, hi]);
  const sessionLang = langOf(session);
  const readingStats = session.mode === 'presentation' && session.targetText
    ? textStats(session.targetText, session.settings.targetArticulationRate, sessionLang)
    : null;
  const tips = sessionTips(session);

  const playPhrase = (i: number) => {
    const p = session.phrases[i];
    if (p && audio.available) audio.playRange(Math.max(0, p.startMs - 200), p.endMs + 200);
  };

  const recompute = async () => {
    setBusy(true);
    setErr(null);
    try {
      await recomputeSession(session.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `voicecheck-${session.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const remove = async () => {
    await deleteSession(session.id);
    nav('/history');
  };

  return (
    <div className="space-y-5">
      <Button variant="outline" size="sm" asChild>
        <Link to="/history"><ArrowLeft className="size-4" aria-hidden /> {tr.history}</Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{tr.title(presentation?.title)}</h1>
          <p className="text-sm text-muted-foreground">
            {t.common.modes[session.mode]} · {formatDateTime(session.timestamp, lang)} · {formatMs(session.durationSeconds * 1000)} · {t.common.language.session(LANGUAGE_NAMES[sessionLang])} · {tr.microphone(session.deviceLabel || tr.unknownDevice)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {presentation && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/presentations/${presentation.id}/history`}><History className="size-4" aria-hidden /> {tr.presentationHistory}</Link>
            </Button>
          )}
          {presentation && (
            <Button size="sm" asChild>
              <Link to={`/presentations/${presentation.id}/rehearse?start=1`}><Mic className="size-4" aria-hidden /> {tr.presentAgain}</Link>
            </Button>
          )}
          {session.mode === 'free_speech' && (
            <Button size="sm" asChild>
              <Link to="/speaking"><Mic className="size-4" aria-hidden /> {tr.practiceAgain}</Link>
            </Button>
          )}
          {debug && <Button variant="outline" size="sm" onClick={exportJson}><Download className="size-4" /> JSON</Button>}
          <ConfirmDialog
            title={tr.deleteTitle}
            description={tr.deleteDescription}
            confirmLabel={tr.deleteConfirm}
            errorMessage={tr.deleteError}
            destructive
            onConfirm={remove}
          >
            <Button variant="ghost" size="sm" aria-label={tr.deleteConfirm}><Trash2 className="size-4" aria-hidden /></Button>
          </ConfirmDialog>
        </div>
      </div>

      {stale && (
        <Alert variant="info">
          <RefreshCw className="size-4 mt-0.5" aria-hidden />
          <div className="flex flex-wrap items-center gap-3">
            <span>{tr.stale}</span>
            <Button size="sm" variant="outline" onClick={() => void recompute()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {tr.recompute}
            </Button>
          </div>
        </Alert>
      )}
      {audio.available === false && <Alert variant="warn">{tr.noAudio}</Alert>}
      {err && <Alert variant="bad">{err}</Alert>}
      {session.warnings.map((w, i) => <Alert key={i} variant="warn">{localizeWarning(w, t)}</Alert>)}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SessionTime seconds={session.durationSeconds} />
          {readingStats && readingStats.words > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tr.readingTime}</div>
              <div className="text-2xl font-semibold tabular-nums text-foreground">{tr.readingTimeValue(formatDuration(readingStats.estimatedSeconds))}</div>
              <div className="text-xs text-muted-foreground">{tr.readingTimeHint}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          label={tr.pace}
          value={<>{fmt1(m.articulationRate)} <span className="text-sm font-normal text-muted-foreground">syl/s</span></>}
          sub={<><span className={zone.cls}>{zone.label}</span> · {tr.paceSub(fmt1(lo), fmt1(hi), Math.round(m.wpm))}</>}
          cls={zone.cls}
        />
        <Stat
          label={tr.longest}
          value={formatMs(m.longestPhraseMs)}
          sub={tr.longestSub(limitS, formatMs(m.meanPhraseMs))}
          cls={m.longestPhraseMs > limitS * 1000 ? 'text-bad' : 'text-ok'}
        />
        <Stat
          label={tr.overLimit}
          value={<>{m.overLimitPhrases} <span className="text-sm font-normal text-muted-foreground">{tr.ofPhrases(m.phraseCount)}</span></>}
          sub={m.fastPhrases > 0 ? tr.fastPhrases(m.fastPhrases) : tr.noFastPhrases}
          cls={m.overLimitPhrases > 0 ? 'text-warn' : 'text-ok'}
        />
        <Stat
          label={tr.breaths}
          value={<>{fmt1(m.breathsPerMinute)} <span className="text-sm font-normal text-muted-foreground">/ min</span></>}
          sub={tr.breathsSub(m.breathCount, fmt1(m.meanPauseMs / 1000))}
        />
      </div>

      <section aria-labelledby="tips" className="space-y-2">
        <h2 id="tips" className="text-lg font-semibold">{tr.tipsTitle}</h2>
        {tips.map((tip) => {
          const Icon = TIP_ICON[tip.severity];
          const text = localizeTip(tip, t);
          return (
            <Alert key={tip.key} variant={tip.severity}>
              <Icon className="size-4 mt-0.5" aria-hidden />
              <div className="flex-1 space-y-1">
                <p className="font-medium">{text.title}</p>
                <p className="text-sm opacity-90">{text.detail}</p>
              </div>
              {tip.atMs !== undefined && audio.available && (
                <Button size="sm" variant="ghost" onClick={() => audio.playRange(Math.max(0, tip.atMs! - 200))}>
                  <Play className="size-4" /> {tr.listen}
                </Button>
              )}
            </Alert>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{tr.timelineTitle}</CardTitle>
            <Button variant="outline" size="sm" onClick={audio.toggle} disabled={!audio.available}>
              {audio.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />} {audio.playing ? tr.pause : tr.play}
            </Button>
          </div>
          <CardDescription>
            {tr.timelineDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline session={session} currentMs={audio.timeMs} onSeek={audio.seek} onSelectPhrase={playPhrase} />
        </CardContent>
      </Card>

      {session.phrases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wind className="size-4 text-info" aria-hidden /> {tr.phrasesTitle}</CardTitle>
            <CardDescription>{tr.phrasesDescription}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="py-1 pr-3 font-normal">#</th>
                  <th className="py-1 pr-3 font-normal">{tr.colStart}</th>
                  <th className="py-1 pr-3 font-normal">{tr.colNoBreath}</th>
                  <th className="py-1 pr-3 font-normal">{tr.colTempo}</th>
                  <th className="py-1 pr-3 font-normal">{tr.colPauseAfter}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {session.phrases.map((p, i) => (
                  <tr key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => playPhrase(i)}>
                    <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-3">{formatMs(p.startMs)}</td>
                    <td className={cn('py-1.5 pr-3', p.overLimit && 'text-bad font-medium')}>
                      {formatMs(p.endMs - p.startMs)} {p.overLimit && <Badge variant="bad">{tr.overLimitBadge}</Badge>}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.tempo === 'short' ? '–' : `${fmt1(p.rate)} syl/s`} <Badge variant={TEMPO_VARIANT[p.tempo]}>{tr.tempo[p.tempo]}</Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{p.pauseAfterMs ? formatMs(p.pauseAfterMs) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {session.targetText && session.mode !== 'calibration' && (
        <details className="rounded-md border p-4 text-sm">
          <summary className="cursor-pointer font-medium">{tr.readText}</summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground" lang={sessionLang}>{session.targetText}</p>
        </details>
      )}

      {debug && (
        <Card>
          <CardHeader><CardTitle>Debug</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto max-h-96">{JSON.stringify({ ...session, tracks: undefined }, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
