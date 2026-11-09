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
import { useSettings } from '@/store/settings';
import { recomputeSession } from '@/lib/sessionPipeline';
import { MODE_LABELS } from '@/lib/labels';
import { formatDuration, textStats } from '@/lib/presentation';
import { cn, formatMs } from '@/lib/utils';
import type { PhraseTempo, TipSeverity, TrainingSession } from '@/types';

const TEMPO_BADGE: Record<PhraseTempo, { label: string; variant: 'ok' | 'warn' | 'bad' | 'info' | 'secondary' }> = {
  short: { label: 'krótka', variant: 'secondary' },
  slow: { label: 'wolno', variant: 'info' },
  ok: { label: 'dobrze', variant: 'ok' },
  fast: { label: 'szybko', variant: 'warn' },
  too_fast: { label: 'za szybko', variant: 'bad' },
};

const TIP_ICON: Record<TipSeverity, typeof Info> = { bad: AlertTriangle, warn: AlertTriangle, ok: CheckCircle2, info: Info };

const fmt1 = (v: number) => v.toFixed(1).replace('.', ',');

function settingsDiffer(s: TrainingSession, cur: { targetArticulationRate: [number, number]; maxContinuousSpeechSeconds: number; liveSyllableCorrection: number; syllablesPerWord: number }) {
  const a = s.settings;
  return (
    a.targetArticulationRate[0] !== cur.targetArticulationRate[0] ||
    a.targetArticulationRate[1] !== cur.targetArticulationRate[1] ||
    a.maxContinuousSpeechSeconds !== cur.maxContinuousSpeechSeconds ||
    a.syllableCorrection !== cur.liveSyllableCorrection ||
    a.syllablesPerWord !== cur.syllablesPerWord
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
  const audio = useSessionAudio(session?.audioKey, session?.audioOffsetMs ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stale = useMemo(() => (session && session.schema === 2 ? settingsDiffer(session, settings) : false), [session, settings]);

  if (session === null) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Wczytywanie…</div>;
  if (!session) {
    return (
      <Alert variant="warn">
        Nie znaleziono sesji. <Link className="underline" to="/">Wróć do pulpitu</Link>
      </Alert>
    );
  }
  if (session.schema !== 2) {
    return (
      <Alert variant="info">
        <Loader2 className="size-4 mt-0.5 animate-spin" aria-hidden /> Ta sesja pochodzi z poprzedniej wersji aplikacji i jest właśnie przeliczana…
      </Alert>
    );
  }

  const m = session.metrics;
  const [lo, hi] = session.settings.targetArticulationRate;
  const limitS = session.settings.maxContinuousSpeechSeconds;
  const zone = rateZone(m.syllables > 0 ? m.articulationRate : null, [lo, hi]);
  const readingStats = session.mode === 'presentation' && session.targetText
    ? textStats(session.targetText, session.settings.targetArticulationRate)
    : null;

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
    a.download = `czystamowa-${session.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const remove = async () => {
    await deleteSession(session.id);
    nav('/');
  };

  return (
    <div className="space-y-5">
      <Button variant="outline" size="sm" asChild>
        <Link to="/"><ArrowLeft className="size-4" aria-hidden /> Strona główna</Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Raport sesji{presentation ? `: ${presentation.title}` : ''}</h1>
          <p className="text-sm text-muted-foreground">
            {MODE_LABELS[session.mode]} · {new Date(session.timestamp).toLocaleString('pl-PL')} · {formatMs(session.durationSeconds * 1000)} · mikrofon: {session.deviceLabel || 'nieznany'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {presentation && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/presentations/${presentation.id}/history`}><History className="size-4" aria-hidden /> Historia prezentacji</Link>
            </Button>
          )}
          {presentation && (
            <Button size="sm" asChild>
              <Link to={`/presentations/${presentation.id}/rehearse`}><Mic className="size-4" aria-hidden /> Prezentuj ponownie</Link>
            </Button>
          )}
          {session.mode === 'free_speech' && (
            <Button size="sm" asChild>
              <Link to="/speaking"><Mic className="size-4" aria-hidden /> Ćwicz ponownie</Link>
            </Button>
          )}
          {debug && <Button variant="outline" size="sm" onClick={exportJson}><Download className="size-4" /> JSON</Button>}
          <ConfirmDialog
            title="Usunąć sesję?"
            description="Ta sesja i jej nagranie zostaną usunięte. Tej operacji nie można cofnąć."
            confirmLabel="Usuń sesję"
            errorMessage="Nie udało się usunąć sesji. Spróbuj ponownie."
            destructive
            onConfirm={remove}
          >
            <Button variant="ghost" size="sm" aria-label="Usuń sesję"><Trash2 className="size-4" aria-hidden /></Button>
          </ConfirmDialog>
        </div>
      </div>

      {stale && (
        <Alert variant="info">
          <RefreshCw className="size-4 mt-0.5" aria-hidden />
          <div className="flex flex-wrap items-center gap-3">
            <span>Od czasu tej sesji zmieniły się ustawienia lub kalibracja.</span>
            <Button size="sm" variant="outline" onClick={() => void recompute()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Przelicz z bieżącymi ustawieniami
            </Button>
          </div>
        </Alert>
      )}
      {audio.available === false && <Alert variant="warn">Nagranie tej sesji nie jest dostępne – odtwarzanie wyłączone.</Alert>}
      {err && <Alert variant="bad">{err}</Alert>}
      {session.warnings.map((w, i) => <Alert key={i} variant="warn">{w}</Alert>)}

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SessionTime seconds={session.durationSeconds} />
          {readingStats && readingStats.words > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Szacowany czas czytania</div>
              <div className="text-2xl font-semibold tabular-nums text-foreground">ok. {formatDuration(readingStats.estimatedSeconds)}</div>
              <div className="text-xs text-muted-foreground">W tempie docelowym zapisanym w sesji, bez pauz</div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Tempo mowy"
          value={<>{fmt1(m.articulationRate)} <span className="text-sm font-normal text-muted-foreground">syl/s</span></>}
          sub={<><span className={zone.cls}>{zone.label}</span> · cel {fmt1(lo)}–{fmt1(hi)} · ≈ {Math.round(m.wpm)} słów/min</>}
          cls={zone.cls}
        />
        <Stat
          label="Najdłużej bez oddechu"
          value={formatMs(m.longestPhraseMs)}
          sub={`limit ${limitS} s · średnio ${formatMs(m.meanPhraseMs)}`}
          cls={m.longestPhraseMs > limitS * 1000 ? 'text-bad' : 'text-ok'}
        />
        <Stat
          label="Frazy ponad limit"
          value={<>{m.overLimitPhrases} <span className="text-sm font-normal text-muted-foreground">z {m.phraseCount}</span></>}
          sub={m.fastPhrases > 0 ? `${m.fastPhrases} fraz za szybkich` : 'brak za szybkich fraz'}
          cls={m.overLimitPhrases > 0 ? 'text-warn' : 'text-ok'}
        />
        <Stat
          label="Oddechy"
          value={<>{fmt1(m.breathsPerMinute)} <span className="text-sm font-normal text-muted-foreground">/ min</span></>}
          sub={`${m.breathCount} pauz · średnio ${(m.meanPauseMs / 1000).toFixed(1).replace('.', ',')} s`}
        />
      </div>

      <section aria-labelledby="tips" className="space-y-2">
        <h2 id="tips" className="text-lg font-semibold">Wskazówki</h2>
        {session.tips.map((t) => {
          const Icon = TIP_ICON[t.severity];
          return (
            <Alert key={t.key} variant={t.severity}>
              <Icon className="size-4 mt-0.5" aria-hidden />
              <div className="flex-1 space-y-1">
                <p className="font-medium">{t.title}</p>
                <p className="text-sm opacity-90">{t.detail}</p>
              </div>
              {t.atMs !== undefined && audio.available && (
                <Button size="sm" variant="ghost" onClick={() => audio.playRange(Math.max(0, t.atMs! - 200))}>
                  <Play className="size-4" /> Odsłuchaj
                </Button>
              )}
            </Alert>
          );
        })}
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Oś czasu</CardTitle>
            <Button variant="outline" size="sm" onClick={audio.toggle} disabled={!audio.available}>
              {audio.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />} {audio.playing ? 'Pauza' : 'Odtwórz'}
            </Button>
          </div>
          <CardDescription>
            Środkowy pasek to frazy między oddechami, dolny — tempo każdej frazy na tle Twojego celu. Kliknij, aby przewinąć lub odsłuchać frazę.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline session={session} currentMs={audio.timeMs} onSeek={audio.seek} onSelectPhrase={playPhrase} />
        </CardContent>
      </Card>

      {session.phrases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wind className="size-4 text-info" aria-hidden /> Frazy</CardTitle>
            <CardDescription>Każda fraza to fragment mowy między dwoma oddechami. Kliknij wiersz, aby go odsłuchać.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted-foreground text-left">
                <tr>
                  <th className="py-1 pr-3 font-normal">#</th>
                  <th className="py-1 pr-3 font-normal">Start</th>
                  <th className="py-1 pr-3 font-normal">Bez oddechu</th>
                  <th className="py-1 pr-3 font-normal">Tempo</th>
                  <th className="py-1 pr-3 font-normal">Pauza po</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {session.phrases.map((p, i) => (
                  <tr key={i} className="cursor-pointer hover:bg-muted/50" onClick={() => playPhrase(i)}>
                    <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-3">{formatMs(p.startMs)}</td>
                    <td className={cn('py-1.5 pr-3', p.overLimit && 'text-bad font-medium')}>
                      {formatMs(p.endMs - p.startMs)} {p.overLimit && <Badge variant="bad">ponad limit</Badge>}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.tempo === 'short' ? '–' : `${fmt1(p.rate)} syl/s`} <Badge variant={TEMPO_BADGE[p.tempo].variant}>{TEMPO_BADGE[p.tempo].label}</Badge>
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
          <summary className="cursor-pointer font-medium">Czytany tekst</summary>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{session.targetText}</p>
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
