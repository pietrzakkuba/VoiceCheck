import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Mic2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { TargetText } from '@/components/TargetText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { DICTION_CATEGORIES, EXERCISES, type DictionCategory } from '@/data/exercises';
import { MINIMAL_PAIRS } from '@/data/minimalPairs';
import { normalizeText } from '@/engine/normalize';
import { db } from '@/store/db';
import { cn } from '@/lib/utils';

interface Item { id: string; text: string; label: string; hint?: string }

export default function TrainDiction() {
  const [params, setParams] = useSearchParams();
  const catParam = params.get('category');
  const category: DictionCategory = DICTION_CATEGORIES.some((c) => c.id === catParam) ? (catParam as DictionCategory) : 'szumiace';
  const tab = params.get('tab') === 'pairs' ? 'pairs' : 'twisters';
  const [selected, setSelected] = useState<Item | null>(null);
  const ts = useTrainingSession();
  const nav = useNavigate();
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';
  const info = DICTION_CATEGORIES.find((c) => c.id === category)!;

  const items: Item[] = useMemo(() => {
    if (tab === 'pairs') {
      return MINIMAL_PAIRS.filter((p) => p.category === category).map((p) => ({
        id: p.id,
        // Each set is read three times to give the scorer enough tokens.
        text: Array.from({ length: 3 }, () => p.words.join(', ')).join('. ') + '.',
        label: `${p.contrast}: ${p.words.join(' – ')}`,
        hint: p.hint,
      }));
    }
    return EXERCISES.filter((e) => e.category === category).map((e) => ({ id: e.id, text: e.text, label: `Poziom ${e.level}` }));
  }, [tab, category]);

  useEffect(() => setSelected(null), [tab, category]);

  const history = useLiveQuery(
    () => db.sessions.where('mode').equals('tongue_twisters').reverse().sortBy('timestamp').then((s) => s.filter((x) => x.dictionCategory === category).slice(0, 5)),
    [category],
  );

  const tokens = useMemo(() => normalizeText(selected?.text ?? ''), [selected]);

  const update = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };

  const start = () => {
    if (!selected) return;
    void ts.start({ mode: 'tongue_twisters', targetText: selected.text, exerciseId: selected.id, dictionCategory: category });
  };
  const stop = async () => {
    const s = await ts.stop();
    if (s) nav(`/session/${s.id}`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Mic2 className="size-6 text-primary" aria-hidden /> Laboratorium dykcji</h1>
        <p className="text-muted-foreground text-sm mt-1">Łamańce językowe i pary minimalne. Wynik liczony jest jako odsetek wyraźnie wymówionych głosek.</p>
      </div>

      {!active && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Kategoria głosek">
            {DICTION_CATEGORIES.map((c) => (
              <Button key={c.id} size="sm" variant={c.id === category ? 'default' : 'outline'} onClick={() => update('category', c.id)}>
                {c.label}
              </Button>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{info.label} <span className="text-muted-foreground font-normal text-sm">({info.sounds})</span></CardTitle>
              <CardDescription>{info.tip}</CardDescription>
            </CardHeader>
            {history && history.length > 0 && (
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Ostatnie wyniki:</span>
                {history.map((h) => (
                  <Badge key={h.id} variant={h.scores.articulation >= 80 ? 'ok' : h.scores.articulation >= 60 ? 'warn' : 'bad'} className="cursor-pointer" onClick={() => nav(`/session/${h.id}`)}>
                    {Math.round(h.scores.articulation)}
                  </Badge>
                ))}
              </CardContent>
            )}
          </Card>

          <Tabs value={tab} onValueChange={(v) => update('tab', v)}>
            <TabsList>
              <TabsTrigger value="twisters">Łamańce językowe</TabsTrigger>
              <TabsTrigger value="pairs">Pary minimalne</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-3">
              {items.length === 0 && <p className="text-sm text-muted-foreground">Brak ćwiczeń w tej kategorii.</p>}
              <ul className="grid gap-2 md:grid-cols-2">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(it)}
                      className={cn(
                        'w-full text-left rounded-lg border p-3 hover:bg-accent transition-colors',
                        selected?.id === it.id && 'border-primary ring-2 ring-primary/30',
                      )}
                      aria-pressed={selected?.id === it.id}
                    >
                      <div className="text-xs text-muted-foreground mb-1">{it.label}</div>
                      <div>{tab === 'pairs' ? it.label.split(': ')[1] : it.text}</div>
                      {it.hint && <div className="text-xs text-muted-foreground mt-1">{it.hint}</div>}
                    </button>
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </>
      )}

      {selected && (
        <Card>
          <CardContent>
            <TargetText tokens={tokens} />
            {!active && <p className="text-xs text-muted-foreground mt-2">Najpierw przeczytaj powoli i starannie, potem spróbuj szybciej – raport pokaże, które głoski tracą wyrazistość.</p>}
          </CardContent>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      <RecordControls phase={ts.phase} onStart={start} onStop={stop} disabled={!selected} startLabel={selected ? 'Nagraj' : 'Wybierz ćwiczenie'} />
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} compact />}
    </div>
  );
}
