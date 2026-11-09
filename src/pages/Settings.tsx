import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings as SettingsIcon, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label, NativeSelect, Slider, Switch, Alert } from '@/components/ui/primitives';
import { useSettings, DEFAULT_SETTINGS } from '@/store/settings';
import { clearAllData, getBaseline } from '@/store/db';
import { initModels, useModelStore } from '@/workers/client';
import { listMicrophones } from '@/audio/capture';
import { liveCaptionsSupported } from '@/audio/liveCaptions';
import { speak, usePolishVoices } from '@/lib/tts';
import { SCORE_LABELS } from '@/lib/labels';
import type { ScoreWeights } from '@/types';

export default function Settings() {
  const s = useSettings();
  const model = useModelStore();
  const voices = usePolishVoices();
  const baseline = useLiveQuery(() => getBaseline(), [], undefined);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void listMicrophones().then(setMics).catch(() => setMics([]));
  }, []);

  const setTier = (t: typeof s.modelTier) => {
    s.set({ modelTier: t });
    void initModels();
  };

  const weightSum = Object.values(s.scoreWeights).reduce((a, b) => a + b, 0);
  const setWeight = (k: keyof ScoreWeights, v: number) => s.set({ scoreWeights: { ...s.scoreWeights, [k]: v } });

  const clear = async () => {
    if (!confirm('Usunąć wszystkie sesje, nagrania i kalibrację? Tej operacji nie można cofnąć.')) return;
    await clearAllData();
    setMsg('Dane zostały usunięte.');
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-semibold flex items-center gap-2"><SettingsIcon className="size-6 text-primary" aria-hidden /> Ustawienia</h1>
      {msg && <Alert variant="ok">{msg}</Alert>}

      <Card>
        <CardHeader><CardTitle>Wygląd</CardTitle></CardHeader>
        <CardContent>
          <Label htmlFor="theme">Motyw</Label>
          <NativeSelect id="theme" value={s.theme} onChange={(e) => s.set({ theme: e.target.value as typeof s.theme })} className="mt-1.5 max-w-xs">
            <option value="system">Systemowy</option>
            <option value="light">Jasny</option>
            <option value="dark">Ciemny</option>
          </NativeSelect>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cele treningowe</CardTitle>
          <CardDescription>Progi używane w ocenie tempa i w podpowiedziach na żywo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Docelowe tempo artykulacji</Label>
              <span className="tabular-nums">{s.targetArticulationRate[0].toFixed(1)}–{s.targetArticulationRate[1].toFixed(1)} syl/s</span>
            </div>
            <Slider min={3} max={7} step={0.1} minStepsBetweenThumbs={3} value={s.targetArticulationRate} onValueChange={(v) => s.set({ targetArticulationRate: [v[0], v[1]] })} aria-label="Docelowe tempo artykulacji" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Maksymalny ciąg mowy bez oddechu</Label>
              <span className="tabular-nums">{s.maxContinuousSpeechSeconds} s</span>
            </div>
            <Slider min={4} max={15} step={1} value={[s.maxContinuousSpeechSeconds]} onValueChange={([v]) => s.set({ maxContinuousSpeechSeconds: v })} aria-label="Maksymalny ciąg mowy bez oddechu" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Wagi składowych wyniku</Label>
              <Button size="sm" variant="ghost" onClick={() => s.set({ scoreWeights: { ...DEFAULT_SETTINGS.scoreWeights } })}>Domyślne</Button>
            </div>
            {(Object.keys(SCORE_LABELS) as (keyof ScoreWeights)[]).map((k) => (
              <div key={k} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                <span>{SCORE_LABELS[k]}</span>
                <Slider min={0} max={1} step={0.05} value={[s.scoreWeights[k]]} onValueChange={([v]) => setWeight(k, v)} aria-label={`Waga: ${SCORE_LABELS[k]}`} />
                <span className="tabular-nums text-right">{weightSum > 0 ? Math.round((s.scoreWeights[k] / weightSum) * 100) : 0}%</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Wagi są normalizowane do 100%. Zmiana dotyczy nowych i ponownie analizowanych sesji.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mikrofon i kalibracja</CardTitle>
          <CardDescription>
            {baseline ? `Skalibrowano ${new Date(baseline.createdAt).toLocaleDateString('pl-PL')} (${baseline.deviceLabel || 'mikrofon nieznany'}).` : 'Brak kalibracji – ocena używa ustawień domyślnych.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="mic">Mikrofon</Label>
            <NativeSelect id="mic" className="mt-1.5" value={s.micDeviceId ?? ''} onChange={(e) => s.set({ micDeviceId: e.target.value || null })}>
              <option value="">Domyślny systemowy</option>
              {mics.map((m, i) => <option key={m.deviceId || i} value={m.deviceId}>{m.label || `Mikrofon ${i + 1}`}</option>)}
            </NativeSelect>
            {mics.length > 0 && mics.every((m) => !m.label) && <p className="text-xs text-muted-foreground mt-1">Nazwy urządzeń pojawią się po pierwszym udzieleniu dostępu do mikrofonu.</p>}
          </div>
          <Button asChild variant="outline"><Link to="/calibration">{baseline ? 'Kalibruj ponownie' : 'Przeprowadź kalibrację'}</Link></Button>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="captions">Napisy na żywo podczas nagrania</Label>
              <p className="text-xs text-muted-foreground">
                {liveCaptionsSupported()
                  ? 'Używa rozpoznawania mowy przeglądarki – w Chrome dźwięk może być wysyłany do serwerów Google. Nie wpływa na ocenę.'
                  : 'Niedostępne w tej przeglądarce.'}
              </p>
            </div>
            <Switch id="captions" checked={s.liveCaptions} disabled={!liveCaptionsSupported()} onCheckedChange={(v) => s.set({ liveCaptions: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Głos bota</CardTitle>
          <CardDescription>Syntezator mowy używany w trybie rozmowy.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          {voices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak polskiego głosu w systemie – zainstaluj go w ustawieniach systemu operacyjnego.</p>
          ) : (
            <>
              <NativeSelect value={s.selectedVoiceURI ?? ''} onChange={(e) => s.set({ selectedVoiceURI: e.target.value || null })} className="max-w-sm" aria-label="Głos">
                <option value="">Automatyczny</option>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
              </NativeSelect>
              <Button variant="outline" onClick={() => void speak('Dzień dobry, opowiedz mi o sobie.', s.selectedVoiceURI)}><Volume2 className="size-4" /> Test</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modele AI</CardTitle>
          <CardDescription>
            Status: {model.status === 'ready' ? `gotowe (${model.tier}, ${model.backend}${model.ctc ? '' : ', bez modelu fonetycznego'})` : model.status === 'loading' ? 'pobieranie…' : model.status === 'error' ? `błąd – ${model.error}` : 'nie pobrano'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <NativeSelect value={s.modelTier} onChange={(e) => setTier(e.target.value as typeof s.modelTier)} className="max-w-sm" aria-label="Wariant modelu">
            <option value="auto">Automatycznie (wg urządzenia)</option>
            <option value="lite">Lite – najmniejszy, bez oceny głosek</option>
            <option value="standard">Standard</option>
            <option value="pro">Pro – najdokładniejszy (WebGPU)</option>
          </NativeSelect>
          <p className="text-xs text-muted-foreground">Modele są pobierane raz i przechowywane w pamięci przeglądarki. Po zmianie wariantu sesje możesz przeanalizować ponownie z poziomu raportu.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dane</CardTitle><CardDescription>Wszystkie dane są przechowywane wyłącznie lokalnie (IndexedDB).</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => void clear()}>Usuń wszystkie sesje i kalibrację</Button>
          <Button variant="outline" onClick={() => { if (confirm('Przywrócić ustawienia domyślne?')) s.reset(); }}>Przywróć ustawienia domyślne</Button>
        </CardContent>
      </Card>
    </div>
  );
}
