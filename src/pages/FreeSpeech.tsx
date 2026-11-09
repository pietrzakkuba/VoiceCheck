import { Link, useNavigate } from 'react-router';
import { ArrowLeft, BookOpenText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { LivePacePanel, liveIndicators } from '@/components/audio/LivePacePanel';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/utils';

/** Reading a text that is not stored in the app – only pace and breathing are tracked. */
export default function FreeSpeech() {
  const target = useSettings((s) => s.targetArticulationRate);
  const maxBreathSeconds = useSettings((s) => s.maxContinuousSpeechSeconds);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';
  const { frameColor } = liveIndicators(ts.phase, ts.stats, target);

  const start = () => ts.start({ mode: 'free_speech' });
  const stop = async () => {
    const s = await ts.stop();
    if (s) nav(`/session/${s.id}`);
  };

  return (
    <div className="space-y-5">
      <div>
        {!active && (
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="size-4" aria-hidden /> Strona główna
          </Link>
        )}
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1"><BookOpenText className="size-6 text-primary" aria-hidden /> Swobodne mówienie</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Czytaj tekst z kartki, innego ekranu lub mów z pamięci. Aplikacja pilnuje tylko tempa i oddechu.
        </p>
      </div>

      {!active && (
        <Card>
          <CardHeader>
            <CardTitle>Jak to działa</CardTitle>
            <CardDescription>
              Po rozpoczęciu zachowaj 2 s ciszy na kalibrację mikrofonu, a potem zacznij czytać. Na bieżąco zobaczysz tempo,
              a pasek oddechu przypomni o wdechu, gdy mówisz zbyt długo bez przerwy. Tekst nie jest potrzebny ani zapisywany.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {active && (
        <Card className={cn('gap-0 border-4 border-current py-0 transition-colors duration-300', frameColor)}>
          <CardContent className="px-5 py-4 text-card-foreground">
            <LivePacePanel phase={ts.phase} stats={ts.stats} target={target} maxBreathSeconds={maxBreathSeconds} />
          </CardContent>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      <div className="flex items-center gap-3">
        <RecordControls phase={ts.phase} onStart={start} onStop={stop} />
        {ts.phase === 'recording' && <span className="text-sm text-muted-foreground">Mów naturalnie. Kliknij „Zakończ”, gdy skończysz.</span>}
      </div>
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} showBreath={false} />}
    </div>
  );
}
