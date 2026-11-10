import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Crosshair } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { TargetText } from '@/components/TargetText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { CALIBRATION_TEXT } from '@/data/calibrationText';
import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import { T } from '@/engine/thresholds';
import { recomputeSession } from '@/lib/sessionPipeline';
import { saveBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';
import type { TrainingSession, UserBaseline } from '@/types';
import { cn } from '@/lib/utils';

const CALIBRATE_MS = 2000;

/**
 * Derives the per-user syllable-detector correction from a reading of the calibration text,
 * whose real syllable count is known. Returns null when the recording does not look like a full reading.
 */
export function calibrationFromSession(s: TrainingSession, textSyllables: number, textWords: number): UserBaseline | null {
  const raw = s.tracks.nucleiMs.filter((t) => s.phrases.some((p) => t >= p.startMs - 50 && t <= p.endMs + 50)).length;
  const speechSec = s.metrics.speechMs / 1000;
  if (raw < 20 || speechSec < 10) return null;
  const ratio = textSyllables / raw;
  if (ratio < 0.5 || ratio > 2) return null;
  return {
    createdAt: Date.now(),
    deviceLabel: s.deviceLabel,
    articulationRate: +(textSyllables / speechSec).toFixed(2),
    syllablesPerWord: +(textSyllables / Math.max(1, textWords)).toFixed(2),
    liveSyllableCorrection: +Math.min(T.correctionMax, Math.max(T.correctionMin, ratio)).toFixed(3),
  };
}

/** Calibration: read a known text naturally → syllable-count correction for this voice and microphone. */
export default function Calibration() {
  const ts = useTrainingSession();
  const nav = useNavigate();
  const set = useSettings((s) => s.set);
  const tokens = useMemo(() => normalizeText(CALIBRATION_TEXT), []);
  const textSyllables = useMemo(() => countTextSyllables(tokens.map((t) => t.word)), [tokens]);
  const [result, setResult] = useState<{ session: TrainingSession; ok: boolean; msg: string } | null>(null);
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';

  const tsStop = ts.stop;
  const stop = useCallback(async () => {
    const s = await tsStop();
    if (!s) return;
    const b = calibrationFromSession(s, textSyllables, tokens.length);
    if (!b) {
      setResult({ session: s, ok: false, msg: 'Nie udało się skalibrować — nagranie nie wygląda na przeczytanie całego tekstu. Przeczytaj go w całości i spróbuj ponownie.' });
      return;
    }
    await saveBaseline(b);
    set({ liveSyllableCorrection: b.liveSyllableCorrection, syllablesPerWord: b.syllablesPerWord, onboardingDismissed: true });
    const updated = (await recomputeSession(s.id)) ?? s;
    setResult({
      session: updated,
      ok: true,
      msg: `Gotowe! Twoje naturalne tempo: ${b.articulationRate.toFixed(1).replace('.', ',')} sylaby/s. Pomiar tempa jest teraz dopasowany do Twojego głosu i mikrofonu.`,
    });
  }, [tsStop, set, textSyllables, tokens.length]);

  const start = () => {
    setResult(null);
    void ts.start({ mode: 'calibration', targetText: CALIBRATION_TEXT }, { calibrateMs: CALIBRATE_MS });
  };

  return (
    <div className={cn('space-y-5', active && 'recording-active')}>
      <div>
        {!active && (
          <Button asChild variant="ghost" size="sm" className="-ml-3 h-9 text-muted-foreground">
            <Link to="/"><ArrowLeft className="size-4" aria-hidden /> Strona główna</Link>
          </Button>
        )}
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1"><Crosshair className="size-6 text-primary" aria-hidden /> Kalibracja</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Około minuty czytania. Znamy liczbę sylab w tym tekście, więc po nagraniu dopasujemy pomiar tempa do Twojego głosu i mikrofonu.
        </p>
      </div>
      {!active && !result && (
        <Card>
          <CardHeader>
            <CardTitle>Jak to zrobić?</CardTitle>
            <CardDescription>Usiądź w cichym miejscu, w zwykłej odległości od mikrofonu.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              <li>Po kliknięciu „Start” zachowaj 2 sekundy ciszy – zmierzymy szum tła.</li>
              <li>Przeczytaj <strong>cały tekst</strong> swoim naturalnym tempem.</li>
              <li>Na przecinkach i kropkach rób krótkie pauzy na oddech. Kliknij „Zakończ”, gdy skończysz.</li>
            </ol>
          </CardContent>
        </Card>
      )}
      {(active || !result) && (
        <Card>
          <CardContent>
            <TargetText tokens={tokens} />
          </CardContent>
        </Card>
      )}
      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      {result && (
        <Alert variant={result.ok ? 'ok' : 'warn'}>
          {result.ok ? <CheckCircle2 className="size-4 mt-0.5" aria-hidden /> : <AlertTriangle className="size-4 mt-0.5" aria-hidden />}
          <div className="space-y-2">
            <p>{result.msg}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => nav(`/session/${result.session.id}`)}>Zobacz raport</Button>
              <Button size="sm" variant="outline" onClick={start}>Powtórz kalibrację</Button>
              <Button size="sm" variant="ghost" onClick={() => nav('/')}>Strona główna</Button>
            </div>
          </div>
        </Alert>
      )}
      {!result && <RecordControls phase={ts.phase} onStart={start} onStop={stop} startLabel="Start" />}
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} />}
    </div>
  );
}
