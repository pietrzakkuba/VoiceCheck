import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BookOpenText, Repeat } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, Textarea, Label, Alert } from '@/components/ui/primitives';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { TargetText } from '@/components/TargetText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { READING_TEXTS } from '@/data/exercises';
import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';

const MAX_CHARS = 4000;

export default function TrainReading() {
  const [params] = useSearchParams();
  const repeatId = params.get('repeat');
  const repeatText = params.get('text');
  const [text, setText] = useState(repeatText ?? READING_TEXTS[0].text);
  const [preset, setPreset] = useState(repeatText ? '' : READING_TEXTS[0].id);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const tokens = useMemo(() => normalizeText(text), [text]);
  const syl = useMemo(() => countTextSyllables(tokens.map((t) => t.word)), [tokens]);
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';

  const start = () =>
    ts.start({
      mode: 'free_reading',
      targetText: text.trim(),
      repeatOf: repeatId && repeatText ? { sessionId: repeatId, sentence: repeatText } : undefined,
    });
  const stop = async () => {
    const s = await ts.stop();
    if (s) nav(`/session/${s.id}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><BookOpenText className="size-6 text-primary" aria-hidden /> Czytanie tekstu</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Wklej własny tekst (np. prezentację) i przeczytaj go na głos. Ocenimy tempo, pauzy na interpunkcji, wyrazistość głosek i pominięte słowa.
        </p>
      </div>

      {repeatId && (
        <Alert variant="info"><Repeat className="size-4 mt-0.5" aria-hidden /> Powtórka zdania z wcześniejszej sesji – po nagraniu zobaczysz porównanie „przed / po”.</Alert>
      )}

      {!active && (
        <Card>
          <CardHeader>
            <CardTitle>Tekst do przeczytania</CardTitle>
            <CardDescription>{tokens.length} słów · {syl} sylab · przy 5 syl/s ok. {Math.round(syl / 5)} s czytania</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!repeatId && (
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
            )}
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
        <Card>
          <CardContent>
            <TargetText tokens={tokens} />
          </CardContent>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      <div className="flex items-center gap-3">
        <RecordControls phase={ts.phase} onStart={start} onStop={stop} disabled={tokens.length < 1} />
        {ts.phase === 'recording' && <span className="text-sm text-muted-foreground">Czytaj naturalnie. Kliknij „Zakończ”, gdy skończysz.</span>}
      </div>
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} captions={ts.captions} />}
    </div>
  );
}
