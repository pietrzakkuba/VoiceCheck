import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { BookOpenText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, Textarea, Label } from '@/components/ui/primitives';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { rateZone } from '@/components/audio/SpeedometerGauge';
import { TargetText } from '@/components/TargetText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { READING_TEXTS } from '@/data/readingTexts';
import { useSettings } from '@/store/settings';
import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import { cn } from '@/lib/utils';

const MAX_CHARS = 4000;

export default function TrainReading() {
  const [text, setText] = useState(READING_TEXTS[0].text);
  const [preset, setPreset] = useState(READING_TEXTS[0].id);
  const target = useSettings((s) => s.targetArticulationRate);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const tokens = useMemo(() => normalizeText(text), [text]);
  const syl = useMemo(() => countTextSyllables(tokens.map((t) => t.word)), [tokens]);
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';
  const rate = ts.phase === 'recording' && !ts.stats?.calibrating ? ts.stats?.syllableRate ?? null : null;
  const pace = rateZone(rate, target);
  const paceLabel = ts.phase === 'starting' ? 'Uruchamiam mikrofon…'
    : ts.phase === 'processing' ? 'Analizuję nagranie…'
    : ts.stats?.calibrating ? 'Zachowaj ciszę – kalibracja'
    : rate === null ? 'Czytaj – mierzę tempo…'
    : pace.label;

  const start = () => ts.start({ mode: 'reading', targetText: text.trim() });
  const stop = async () => {
    const s = await ts.stop();
    if (s) nav(`/session/${s.id}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><BookOpenText className="size-6 text-primary" aria-hidden /> Czytanie tekstu</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wybierz lub wklej tekst (np. prezentację) i przeczytaj go na głos. Na bieżąco widzisz tempo, a pasek oddechu przypomni Ci o wdechu, gdy mówisz zbyt długo bez przerwy.
        </p>
      </div>

      {!active && (
        <Card>
          <CardHeader>
            <CardTitle>Tekst do przeczytania</CardTitle>
            <CardDescription>{tokens.length} słów · {syl} sylab · w Twoim tempie docelowym ok. {Math.round(syl / ((target[0] + target[1]) / 2))} s czytania</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="preset">Gotowe teksty</Label>
              <NativeSelect
                id="preset"
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                  const t = READING_TEXTS.find((r) => r.id === e.target.value);
                  if (t) setText(t.text);
                }}
              >
                <option value="">— własny tekst —</option>
                {READING_TEXTS.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="text">Treść</Label>
              <Textarea
                id="text"
                value={text}
                maxLength={MAX_CHARS}
                rows={7}
                onChange={(e) => { setText(e.target.value); setPreset(''); }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card className={cn('gap-0 border-4 border-current py-0 transition-colors duration-300', pace.cls)}>
          <div className="max-h-[65vh] overflow-y-auto rounded-lg text-card-foreground" tabIndex={0} role="region" aria-label="Tekst do czytania z podglądem tempa">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-card px-5 py-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tempo czytania</div>
                <div className={cn('flex items-center gap-2 text-lg font-semibold', pace.cls)}>
                  <span className="size-4 shrink-0 rounded-full bg-current" aria-hidden />
                  <span role="status">{paceLabel}</span>
                </div>
              </div>
              <div className={cn('text-2xl font-semibold tabular-nums', pace.cls)}>
                {rate !== null ? rate.toFixed(1) : '–'} <span className="text-sm font-normal text-muted-foreground">syl/s</span>
              </div>
            </div>
            <CardContent className="py-5">
              <TargetText tokens={tokens} />
            </CardContent>
          </div>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      <div className="flex items-center gap-3">
        <RecordControls phase={ts.phase} onStart={start} onStop={stop} disabled={tokens.length < 1} />
        {ts.phase === 'recording' && <span className="text-sm text-muted-foreground">Czytaj naturalnie. Kliknij „Zakończ”, gdy skończysz.</span>}
      </div>
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} />}
    </div>
  );
}
