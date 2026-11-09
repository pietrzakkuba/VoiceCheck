import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenText, Crosshair, Loader2, MessageCircle, Wind, X } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/primitives';
import { db, getBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';
import { MODE_LABELS } from '@/lib/labels';
import { formatMs } from '@/lib/utils';
import type { TrainingSession } from '@/types';

const MODES = [
  { to: '/reading', icon: BookOpenText, title: 'Czytanie tekstu', desc: 'Czytaj na głos gotowy lub własny tekst' },
  { to: '/speaking', icon: MessageCircle, title: 'Swobodne mówienie', desc: 'Mów własnymi słowami na dowolny temat' },
  { to: '/calibration', icon: Crosshair, title: 'Kalibracja', desc: 'Dopasuj pomiar tempa do swojego głosu' },
];

const shortDate = (t: number) => new Date(t).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' });
const tooltipStyle = { background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 };

function rateVariant(s: TrainingSession): 'ok' | 'warn' | 'bad' | 'info' {
  const r = s.metrics.articulationRate;
  const [lo, hi] = s.settings.targetArticulationRate;
  if (r > hi + 1) return 'bad';
  if (r > hi) return 'warn';
  if (r < lo - 1) return 'info';
  return 'ok';
}

export default function Dashboard() {
  const all = useLiveQuery(() => db.sessions.orderBy('timestamp').reverse().toArray(), [], []);
  const baseline = useLiveQuery(() => getBaseline(), [], undefined);
  const { onboardingDismissed, targetArticulationRate, maxContinuousSpeechSeconds, set } = useSettings();

  const sessions = useMemo(() => all.filter((s) => s.schema === 2), [all]);
  const migrating = all.length - sessions.length;
  const training = useMemo(() => sessions.filter((s) => s.mode !== 'calibration' && s.metrics.phraseCount > 0), [sessions]);

  const trend = useMemo(
    () =>
      training.slice(0, 40).reverse().map((s) => ({
        date: shortDate(s.timestamp),
        tempo: +s.metrics.articulationRate.toFixed(2),
        najdluzsza: +(s.metrics.longestPhraseMs / 1000).toFixed(1),
        ponadLimit: Math.round((s.metrics.overLimitPhrases / Math.max(1, s.metrics.phraseCount)) * 100),
      })),
    [training],
  );

  const showOnboarding = baseline === null && !onboardingDismissed;

  return (
    <div className="space-y-6">
      {showOnboarding && (
        <Alert variant="info">
          <Crosshair className="size-4 mt-0.5" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">Zacznij od kalibracji</p>
            <p className="text-sm">Minuta czytania pozwoli dokładniej mierzyć tempo Twojej mowy na Twoim mikrofonie.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" asChild><Link to="/calibration">Przejdź do kalibracji</Link></Button>
              <Button size="sm" variant="ghost" onClick={() => set({ onboardingDismissed: true })}>Później</Button>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => set({ onboardingDismissed: true })} aria-label="Zamknij"><X className="size-4" /></Button>
        </Alert>
      )}

      <div>
        <h1 className="text-2xl font-semibold">Pulpit</h1>
        <p className="text-sm text-muted-foreground">
          Mierz tempo mówienia i pamiętaj o oddechu. Wszystko działa lokalnie – nagrania nie opuszczają Twojego komputera.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <Link key={m.to} to={m.to} className="group rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition">
            <m.icon className="size-6 text-primary mb-2" aria-hidden />
            <div className="font-medium group-hover:text-primary">{m.title}</div>
            <div className="text-sm text-muted-foreground">{m.desc}</div>
          </Link>
        ))}
      </div>

      {migrating > 0 && (
        <Alert variant="info">
          <Loader2 className="size-4 mt-0.5 animate-spin" aria-hidden /> Przeliczam {migrating} {migrating === 1 ? 'sesję' : 'sesji'} z poprzedniej wersji aplikacji…
        </Alert>
      )}

      {trend.length >= 2 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tempo mowy</CardTitle>
              <CardDescription>Sylaby na sekundę (bez pauz); zielony pas = Twój cel {targetArticulationRate[0]}–{targetArticulationRate[1]}</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <ReferenceArea y1={targetArticulationRate[0]} y2={targetArticulationRate[1]} fill="var(--color-ok)" fillOpacity={0.12} />
                  <XAxis dataKey="date" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[2, 8]} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="tempo" name="syl/s" stroke="var(--color-primary)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wind className="size-4 text-info" aria-hidden /> Oddech</CardTitle>
              <CardDescription>Najdłuższy fragment bez oddechu (s); przerywana linia = limit {maxContinuousSpeechSeconds} s</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <ReferenceLine y={maxContinuousSpeechSeconds} stroke="var(--color-bad)" strokeDasharray="5 5" />
                  <XAxis dataKey="date" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="najdluzsza" name="najdłuższa fraza (s)" stroke="var(--color-info)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="text-sm text-muted-foreground">Wykresy postępów pojawią się po co najmniej dwóch sesjach treningowych.</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historia sesji</CardTitle>
          <CardDescription>{sessions.length} sesji{baseline ? ` · kalibracja z ${new Date(baseline.createdAt).toLocaleDateString('pl-PL')}` : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak sesji. Wybierz tryb treningu powyżej.</p>
          ) : (
            <ul className="divide-y">
              {sessions.slice(0, 50).map((s) => (
                <li key={s.id}>
                  <Link to={`/session/${s.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-accent rounded px-2 -mx-2">
                    <div className="min-w-0">
                      <div className="font-medium">{MODE_LABELS[s.mode]}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {new Date(s.timestamp).toLocaleString('pl-PL')} · {formatMs(s.durationSeconds * 1000)}
                        {s.targetText && s.mode === 'reading' ? ` · ${s.targetText.slice(0, 60)}${s.targetText.length > 60 ? '…' : ''}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {s.metrics.overLimitPhrases > 0 && (
                        <Badge variant="warn" title="Fragmenty za długo bez oddechu"><Wind className="size-3" aria-hidden /> {s.metrics.overLimitPhrases}</Badge>
                      )}
                      {s.metrics.syllables > 0 && (
                        <Badge variant={rateVariant(s)}>{s.metrics.articulationRate.toFixed(1).replace('.', ',')} syl/s</Badge>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
