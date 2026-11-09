import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Loader2, Pause, Play, RefreshCw, Trash2, Hourglass } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/primitives';
import { AnnotatedTranscript } from '@/components/report/AnnotatedTranscript';
import { WordDetails } from '@/components/report/WordDetails';
import { Timeline } from '@/components/report/Timeline';
import { TopIssues } from '@/components/report/TopIssues';
import { ScoreRing, ScoreBars } from '@/components/report/Scores';
import { RepeatComparison } from '@/components/report/RepeatComparison';
import { useSessionAudio } from '@/hooks/useSessionAudio';
import { db, deleteSession } from '@/store/db';
import { exportAnalysisInput, reanalyzeSession } from '@/lib/analysisPipeline';
import { useModelStore } from '@/workers/client';
import { useSettings } from '@/store/settings';
import { MODE_LABELS } from '@/lib/labels';
import { formatMs } from '@/lib/utils';

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function SessionReport() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const debug = params.get('debug') === '1';
  const nav = useNavigate();
  const session = useLiveQuery(() => (id ? db.sessions.get(id) : undefined), [id], null);
  const modelStatus = useModelStore((s) => s.status);
  const target = useSettings((s) => s.targetArticulationRate);
  const audio = useSessionAudio(session?.audioKey, session?.audioOffsetMs ?? 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const conversation = useLiveQuery(
    async () => (session?.conversationId ? (await db.sessions.where('conversationId').equals(session.conversationId).sortBy('timestamp')) : []),
    [session?.conversationId],
    [],
  );

  const selectWord = (i: number) => {
    setSelected(i);
    const w = session?.words[i];
    if (w && w.status !== 'skipped' && audio.available) audio.playRange(Math.max(0, w.startMs - 300), w.endMs + 300);
  };

  const reanalyze = async () => {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      await reanalyzeSession(session.id);
      setSelected(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    if (!session) return;
    download(JSON.stringify(session, null, 2), `clearvoice-${session.id}.json`);
  };

  const exportCorpus = async () => {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const data = await exportAnalysisInput(session.id);
      download(JSON.stringify(data), `clearvoice-input-${session.id}.json`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!session || !confirm('Usunąć tę sesję wraz z nagraniem?')) return;
    await deleteSession(session.id);
    nav('/');
  };

  const counts = useMemo(() => {
    const c = { skipped: 0, mumbled: 0, rushed: 0, filler: 0 };
    for (const w of session?.words ?? []) if (w.status in c) c[w.status as keyof typeof c]++;
    return c;
  }, [session]);

  if (session === null) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Wczytywanie…</div>;
  if (!session) {
    return (
      <Alert variant="warn">
        Nie znaleziono sesji. <Link className="underline" to="/">Wróć do pulpitu</Link>
      </Alert>
    );
  }

  const pending = session.analysisStatus === 'pending';
  const m = session.metrics;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Raport sesji</h1>
          <p className="text-sm text-muted-foreground">
            {MODE_LABELS[session.mode]} · {new Date(session.timestamp).toLocaleString('pl-PL')} · {formatMs(session.durationSeconds * 1000)} · mikrofon: {session.deviceLabel || 'nieznany'} · model: {session.modelTier}
          </p>
          {session.question && <p className="mt-1 text-sm"><span className="text-muted-foreground">Pytanie:</span> {session.question}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={audio.toggle} disabled={!audio.available}>
            {audio.playing ? <Pause className="size-4" /> : <Play className="size-4" />} {audio.playing ? 'Pauza' : 'Odtwórz'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void reanalyze()} disabled={busy || modelStatus !== 'ready'} title="Przeanalizuj nagranie ponownie bieżącym modelem i kalibracją">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Analizuj ponownie
          </Button>
          {debug && <Button variant="outline" size="sm" onClick={exportJson}><Download className="size-4" /> JSON</Button>}
          {debug && <Button variant="outline" size="sm" onClick={() => void exportCorpus()} disabled={busy || modelStatus !== 'ready'} title="Eksport wejścia silnika dla scripts/evaluate-corpus.ts"><Download className="size-4" /> Korpus</Button>}
          <Button variant="ghost" size="sm" onClick={() => void remove()} aria-label="Usuń sesję"><Trash2 className="size-4" /></Button>
        </div>
      </div>

      {pending && (
        <Alert variant="info">
          <Hourglass className="size-4 mt-0.5" aria-hidden />
          <div>
            Analiza mowy oczekuje na modele AI. Poniżej widzisz pomiary akustyczne (tempo, pauzy, intonacja); pełny raport
            z transkrypcją i oceną głosek pojawi się automatycznie po pobraniu modeli.
          </div>
        </Alert>
      )}
      {audio.available === false && <Alert variant="warn">Nagranie tej sesji nie jest dostępne – odtwarzanie wyłączone.</Alert>}
      {err && <Alert variant="bad">{err}</Alert>}
      {session.warnings.map((w, i) => <Alert key={i} variant="warn">{w}</Alert>)}

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <Card className="items-center justify-center px-6">
          <ScoreRing value={session.scores.total} label="Wynik" muted={pending} />
        </Card>
        <Card>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ScoreBars scores={session.scores} pending={pending} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Tempo artykulacji</dt>
              <dd className="tabular-nums">
                {m.articulationRate.toFixed(1)} syl/s{' '}
                <Badge variant={m.articulationRate > target[1] ? 'warn' : m.articulationRate < target[0] - 0.5 ? 'info' : 'ok'}>cel {target[0]}–{target[1]}</Badge>
              </dd>
              <dt className="text-muted-foreground">Tempo mówienia</dt><dd className="tabular-nums">{m.speechRate.toFixed(1)} syl/s · {Math.round(m.wpm)} sł/min</dd>
              <dt className="text-muted-foreground">Najdłuższy ciąg bez pauzy</dt><dd className="tabular-nums">{(m.longestIpuMs / 1000).toFixed(1)} s</dd>
              <dt className="text-muted-foreground">Średnia pauza</dt><dd className="tabular-nums">{(m.meanPauseMs / 1000).toFixed(2)} s</dd>
              <dt className="text-muted-foreground">Wypełniacze</dt><dd className="tabular-nums">{m.fillersPerMinute.toFixed(1)} / min</dd>
              <dt className="text-muted-foreground">Rozpiętość intonacji</dt><dd className="tabular-nums">{m.f0RangeSemitones.toFixed(1)} półtonów</dd>
              <dt className="text-muted-foreground">Stosunek sygnału do szumu</dt><dd className="tabular-nums">{m.snrDb.toFixed(0)} dB</dd>
              {!pending && <><dt className="text-muted-foreground">Słowa: pominięte / niewyraźne</dt><dd className="tabular-nums">{counts.skipped} / {counts.mumbled}</dd></>}
            </dl>
          </CardContent>
        </Card>
      </div>

      {session.repeatOf && <RepeatComparison session={session} />}

      <section aria-labelledby="top-issues">
        <h2 id="top-issues" className="text-lg font-semibold mb-2">Najważniejsze do poprawy</h2>
        <TopIssues session={session} onSelectWord={selectWord} />
      </section>

      {session.words.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transkrypcja</CardTitle>
            <CardDescription>Kliknij słowo, aby je odsłuchać i zobaczyć szczegóły wymowy.</CardDescription>
          </CardHeader>
          <CardContent>
            <AnnotatedTranscript session={session} selected={selected} onSelect={selectWord} currentMs={audio.playing ? audio.timeMs : undefined} />
          </CardContent>
        </Card>
      )}

      {selected !== null && (
        <WordDetails session={session} index={selected} onPlay={audio.playRange} onClose={() => setSelected(null)} canPlay={!!audio.available} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Oś czasu</CardTitle>
          <CardDescription>Kliknij, aby przewinąć nagranie. Kolorowe znaczniki u góry to wykryte problemy.</CardDescription>
        </CardHeader>
        <CardContent>
          <Timeline session={session} currentMs={audio.timeMs} onSeek={(ms) => { audio.seek(ms); }} onSelectWord={selectWord} />
        </CardContent>
      </Card>

      {conversation.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Pozostałe odpowiedzi z tej rozmowy</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {conversation.map((c, i) => (
                <li key={c.id} className="py-2 flex justify-between gap-3">
                  <span className="truncate">{i + 1}. {c.question}</span>
                  {c.id === session.id ? <Badge variant="secondary">ta odpowiedź</Badge> : <Link className="underline shrink-0" to={`/session/${c.id}`}>wynik {Math.round(c.scores.total)}</Link>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {debug && (
        <Card>
          <CardHeader><CardTitle>Debug</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto max-h-96">{JSON.stringify({ ...session, tracks: undefined, words: session.words.map((w) => ({ ...w, chars: undefined })) }, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
