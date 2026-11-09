import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bot, BookOpenText, Crosshair, Gauge, Mic2, X } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/primitives';
import { db, getBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';
import { MODE_LABELS, scoreColor } from '@/lib/labels';
import { CATEGORY_LABELS } from '@/engine/units';
import { formatMs } from '@/lib/utils';
import { UNIT_CATEGORIES } from '@/types';

const MODES = [
  { to: '/reading', icon: BookOpenText, title: 'Czytanie tekstu', desc: 'Własny tekst lub prezentacja' },
  { to: '/pacer', icon: Gauge, title: 'Pacer Karaoke', desc: 'Czytanie w zadanym tempie' },
  { to: '/diction', icon: Mic2, title: 'Laboratorium dykcji', desc: 'Łamańce i pary minimalne' },
  { to: '/bot', icon: Bot, title: 'Rozmowa z botem', desc: 'Swobodne odpowiedzi na pytania' },
];

const shortDate = (t: number) => new Date(t).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' });

export default function Dashboard() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('timestamp').reverse().toArray(), [], []);
  const baseline = useLiveQuery(() => getBaseline(), [], undefined);
  const { onboardingDismissed, targetArticulationRate, set } = useSettings();

  const complete = useMemo(() => sessions.filter((s) => s.analysisStatus !== 'pending' && s.mode !== 'calibration'), [sessions]);

  const trend = useMemo(
    () =>
      complete.slice(0, 40).reverse().map((s, i) => ({
        n: i + 1,
        date: shortDate(s.timestamp),
        Wynik: Math.round(s.scores.total),
        Tempo: Math.round(s.scores.tempo),
        Artykulacja: Math.round(s.scores.articulation),
        Płynność: Math.round(s.scores.fluency),
        Intonacja: Math.round(s.scores.prosody),
        ar: +s.metrics.articulationRate.toFixed(2),
      })),
    [complete],
  );

  const categories = useMemo(() => {
    const acc: Record<string, { ok: number; n: number }> = {};
    for (const s of complete.slice(0, 30)) {
      for (const [c, v] of Object.entries(s.categoryGop ?? {})) {
        if (!v) continue;
        const a = (acc[c] ??= { ok: 0, n: 0 });
        a.ok += v.okRatio * v.n;
        a.n += v.n;
      }
    }
    return UNIT_CATEGORIES.filter((c) => (acc[c]?.n ?? 0) >= 5).map((c) => ({
      name: CATEGORY_LABELS[c].split(' (')[0],
      full: CATEGORY_LABELS[c],
      Wyrazistość: Math.round((acc[c].ok / acc[c].n) * 100),
      n: acc[c].n,
    }));
  }, [complete]);

  const showOnboarding = baseline === null && !onboardingDismissed;

  return (
    <div className="space-y-6">
      {showOnboarding && (
        <Alert variant="info">
          <Crosshair className="size-4 mt-0.5" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">Zacznij od kalibracji</p>
            <p className="text-sm">Minuta czytania pozwoli dopasować ocenę wymowy i tempa do Twojego głosu i mikrofonu.</p>
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
        <p className="text-sm text-muted-foreground">Trenuj dykcję i tempo mówienia. Wszystko działa lokalnie – nagrania nie opuszczają Twojego komputera.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((m) => (
          <Link key={m.to} to={m.to} className="group rounded-xl border bg-card p-4 hover:border-primary hover:shadow-sm transition">
            <m.icon className="size-6 text-primary mb-2" aria-hidden />
            <div className="font-medium group-hover:text-primary">{m.title}</div>
            <div className="text-sm text-muted-foreground">{m.desc}</div>
          </Link>
        ))}
      </div>

      {trend.length >= 2 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Postępy</CardTitle>
              <CardDescription>Wynik ogólny i składowe w ostatnich sesjach</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[0, 100]} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <RTooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Wynik" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="Tempo" stroke="var(--color-info)" dot={false} strokeWidth={1.2} />
                  <Line type="monotone" dataKey="Artykulacja" stroke="var(--color-ok)" dot={false} strokeWidth={1.2} />
                  <Line type="monotone" dataKey="Płynność" stroke="var(--color-warn)" dot={false} strokeWidth={1.2} />
                  <Line type="monotone" dataKey="Intonacja" stroke="var(--color-bad)" dot={false} strokeWidth={1.2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tempo artykulacji</CardTitle>
              <CardDescription>Sylaby na sekundę (bez pauz); zielony pas = Twój cel {targetArticulationRate[0]}–{targetArticulationRate[1]}</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <ReferenceArea y1={targetArticulationRate[0]} y2={targetArticulationRate[1]} fill="var(--color-ok)" fillOpacity={0.12} />
                  <XAxis dataKey="date" fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis domain={[2, 8]} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <RTooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="ar" name="syl/s" stroke="var(--color-primary)" strokeWidth={2} />
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

      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Wyrazistość grup głosek</CardTitle>
            <CardDescription>Odsetek głosek wymówionych wyraźnie (ostatnie 30 sesji)</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" fontSize={11} stroke="var(--color-muted-foreground)" />
                <YAxis domain={[0, 100]} fontSize={11} stroke="var(--color-muted-foreground)" />
                <RTooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                <Bar dataKey="Wyrazistość" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
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
                        {s.question ? ` · ${s.question}` : s.targetText ? ` · ${s.targetText.slice(0, 60)}${s.targetText.length > 60 ? '…' : ''}` : ''}
                      </div>
                    </div>
                    {s.analysisStatus === 'pending' ? (
                      <Badge variant="secondary">oczekuje na analizę</Badge>
                    ) : (
                      <Badge variant={scoreColor(s.scores.total)}>{Math.round(s.scores.total)}</Badge>
                    )}
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
