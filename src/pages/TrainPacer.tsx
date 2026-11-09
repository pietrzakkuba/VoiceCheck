import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Gauge } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, NativeSelect, Slider, Textarea } from '@/components/ui/primitives';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { TargetText } from '@/components/TargetText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { usePacerPosition } from '@/hooks/usePacer';
import { READING_TEXTS } from '@/data/exercises';
import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import { buildPacerSchedule } from '@/engine/pacer';
import type { PacerInfo } from '@/types';

const CALIBRATE_MS = 2000;

export default function TrainPacer() {
  const [params] = useSearchParams();
  const initialRate = Math.min(6.5, Math.max(3, Number(params.get('rate')) || 4.5));
  const [rate, setRate] = useState(initialRate);
  const [preset, setPreset] = useState(READING_TEXTS[0].id);
  const [text, setText] = useState(READING_TEXTS[0].text);
  const [pacer, setPacer] = useState<PacerInfo | null>(null);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const tokens = useMemo(() => normalizeText(text), [text]);
  const syl = useMemo(() => countTextSyllables(tokens.map((t) => t.word)), [tokens]);
  const wpm = tokens.length ? (rate * 60 * tokens.length) / syl : 0;
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';

  const tsStop = ts.stop;
  const stop = useCallback(async () => {
    const s = await tsStop();
    if (s) nav(`/session/${s.id}`);
  }, [tsStop, nav]);

  const pos = usePacerPosition(pacer, ts.captureRef, ts.phase === 'recording', stop);

  const start = () => {
    const p = buildPacerSchedule(tokens, rate, CALIBRATE_MS);
    setPacer(p);
    void ts.start({ mode: 'pacer_karaoke', targetText: text.trim(), pacer: p }, { calibrateMs: CALIBRATE_MS });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Gauge className="size-6 text-primary" aria-hidden /> Pacer Karaoke</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Czytaj w rytmie podświetlenia. Czas każdego słowa zależy od liczby jego sylab; na przecinkach i kropkach pacer zatrzymuje się na oddech.
        </p>
      </div>

      {!active && (
        <Card>
          <CardHeader>
            <CardTitle>Ustawienia</CardTitle>
            <CardDescription>{tokens.length} słów · {syl} sylab</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <Label htmlFor="rate">Docelowe tempo</Label>
                <span className="tabular-nums font-medium">{rate.toFixed(1)} syl/s <span className="text-muted-foreground font-normal">≈ {Math.round(wpm)} słów/min dla tego tekstu</span></span>
              </div>
              <Slider id="rate" min={3} max={6.5} step={0.1} value={[rate]} onValueChange={([v]) => setRate(v)} aria-label="Docelowe tempo w sylabach na sekundę" />
              <p className="text-xs text-muted-foreground">Zalecany zakres dla wystąpień publicznych: 4,5–5,5 syl/s. Zacznij wolniej i stopniowo przyspieszaj.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pacer-preset">Tekst</Label>
              <NativeSelect id="pacer-preset" value={preset} onChange={(e) => { setPreset(e.target.value); const t = READING_TEXTS.find((r) => r.id === e.target.value); if (t) setText(t.text); }}>
                <option value="">— własny tekst —</option>
                {READING_TEXTS.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </NativeSelect>
              <Textarea value={text} rows={5} maxLength={3000} onChange={(e) => { setText(e.target.value); setPreset(''); }} aria-label="Tekst dla pacera" />
            </div>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card>
          <CardContent>
            {pos.countdown > 0 && <div className="text-center text-5xl font-bold text-primary mb-3 tabular-nums" aria-live="assertive">{pos.countdown}</div>}
            {ts.stats?.calibrating && <div className="text-center text-sm text-muted-foreground mb-3">Pacer wystartuje po pomiarze szumu…</div>}
            <TargetText tokens={tokens} activeToken={pos.active} doneUntil={pos.done} breathe={pos.breathe} />
          </CardContent>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      <RecordControls phase={ts.phase} onStart={start} onStop={stop} startLabel="Start" disabled={tokens.length < 2} />
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} compact />}
    </div>
  );
}
