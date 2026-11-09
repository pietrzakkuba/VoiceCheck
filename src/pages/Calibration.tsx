import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Crosshair } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { TargetText } from '@/components/TargetText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { usePacerPosition } from '@/hooks/usePacer';
import { CALIBRATION_TEXT } from '@/data/calibrationText';
import { normalizeText } from '@/engine/normalize';
import { buildPacerSchedule } from '@/engine/pacer';
import { baselineFromSession } from '@/engine/report';
import { median } from '@/engine/features';
import { saveBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';
import type { PacerInfo, TrainingSession } from '@/types';

const CALIBRATE_MS = 2000;
const RATE = 4.5;

/** Onboarding calibration (5.11): read a balanced text with a 4.5 syl/s pacer → user baseline. */
export default function Calibration() {
  const ts = useTrainingSession();
  const nav = useNavigate();
  const set = useSettings((s) => s.set);
  const tokens = useMemo(() => normalizeText(CALIBRATION_TEXT), []);
  const [pacer, setPacer] = useState<PacerInfo | null>(null);
  const [result, setResult] = useState<{ session: TrainingSession; ok: boolean; msg: string } | null>(null);
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';

  const tsStop = ts.stop;
  const stop = useCallback(async () => {
    const s = await tsStop();
    if (!s) return;
    if (s.analysisStatus === 'pending') {
      setResult({ session: s, ok: false, msg: 'Modele AI nie są jeszcze gotowe, więc profil nie mógł zostać obliczony. Poczekaj na pobranie modeli i powtórz kalibrację.' });
      return;
    }
    const intensities = (s.tracks?.intensityDb ?? []).filter((_, i) => s.tracks!.speechSegments.some((g) => i * 10 >= g.startMs && i * 10 <= g.endMs));
    const f0 = (s.tracks?.f0Hz ?? []).filter((v) => v > 0);
    const b = baselineFromSession(s, {
      deviceLabel: s.deviceLabel,
      medianIntensityDb: intensities.length ? +median(intensities).toFixed(1) : -30,
      f0MedianHz: f0.length ? Math.round(median(f0)) : 0,
    });
    await saveBaseline(b);
    set({ liveSyllableCorrection: b.liveSyllableCorrection, syllablesPerWord: b.syllablesPerWord, onboardingDismissed: true });
    const skipped = s.words.filter((w) => w.status === 'skipped').length;
    const ok = skipped / Math.max(1, s.words.length) < 0.2;
    setResult({
      session: s,
      ok,
      msg: ok
        ? `Profil zapisany. Twoje tempo artykulacji: ${b.articulationRate.toFixed(1)} syl/s, średnio ${b.syllablesPerWord} sylaby na słowo.`
        : 'Profil zapisany, ale pominięto sporo słów – dla lepszej dokładności powtórz kalibrację, czytając cały tekst.',
    });
  }, [tsStop, set]);

  const pos = usePacerPosition(pacer, ts.captureRef, ts.phase === 'recording', stop);

  const start = () => {
    setResult(null);
    const p = buildPacerSchedule(tokens, RATE, CALIBRATE_MS);
    setPacer(p);
    void ts.start({ mode: 'calibration', targetText: CALIBRATION_TEXT, pacer: p }, { calibrateMs: CALIBRATE_MS });
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Crosshair className="size-6 text-primary" aria-hidden /> Kalibracja</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Około minuty czytania. Na tej podstawie poznamy Twój naturalny sposób mówienia (wyrazistość poszczególnych grup głosek, tempo, głośność),
          a progi oceny dopasują się do Ciebie i Twojego mikrofonu.
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
              <li>Czytaj <strong>spokojnie i starannie</strong>, podążając za podświetleniem (4,5 sylaby/s).</li>
              <li>Na przecinkach i kropkach zrób krótką pauzę na oddech.</li>
            </ol>
          </CardContent>
        </Card>
      )}
      {(active || !result) && (
        <Card>
          <CardContent>
            {pos.countdown > 0 && <div className="text-center text-5xl font-bold text-primary mb-3 tabular-nums">{pos.countdown}</div>}
            <TargetText tokens={tokens} activeToken={pos.active} doneUntil={pos.done} breathe={pos.breathe} />
          </CardContent>
        </Card>
      )}
      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      {result && (
        <Alert variant={result.ok ? 'ok' : 'warn'}>
          <CheckCircle2 className="size-4 mt-0.5" aria-hidden />
          <div className="space-y-2">
            <p>{result.msg}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => nav(`/session/${result.session.id}`)}>Zobacz raport</Button>
              <Button size="sm" variant="outline" onClick={start}>Powtórz kalibrację</Button>
              <Button size="sm" variant="ghost" onClick={() => nav('/')}>Na pulpit</Button>
            </div>
          </div>
        </Alert>
      )}
      {!result && <RecordControls phase={ts.phase} onStart={start} onStop={stop} startLabel="Start" />}
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} compact />}
    </div>
  );
}
