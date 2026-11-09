import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings as SettingsIcon, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { Label, NativeSelect, Slider, Switch, Alert } from '@/components/ui/primitives';
import { useSettings } from '@/store/settings';
import { clearAllData, getBaseline } from '@/store/db';
import { listMicrophones } from '@/audio/capture';
import { playBreathAlert, primeAlertAudio } from '@/lib/alert';

export default function Settings() {
  const s = useSettings();
  const baseline = useLiveQuery(() => getBaseline(), [], undefined);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void listMicrophones().then(setMics).catch(() => setMics([]));
  }, []);

  const clear = async () => {
    if (!confirm('Usunąć wszystkie prezentacje, sesje, nagrania i kalibrację? Tej operacji nie można cofnąć.')) return;
    await clearAllData();
    s.set({ liveSyllableCorrection: 1, syllablesPerWord: 2.3 });
    setMsg('Dane zostały usunięte.');
  };

  const testAlert = () => {
    primeAlertAudio();
    playBreathAlert();
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-semibold flex items-center gap-2"><SettingsIcon className="size-6 text-primary" aria-hidden /> Ustawienia</h1>
      {msg && <Alert variant="ok">{msg}</Alert>}

      <Card>
        <CardHeader><CardTitle>Wygląd</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="theme">Motyw</Label>
          <ThemeSwitch id="theme" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tempo i oddech</CardTitle>
          <CardDescription>Progi używane na żywo podczas nagrania i w raportach.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Docelowe tempo mowy</Label>
              <span className="tabular-nums">{s.targetArticulationRate[0].toFixed(1)}–{s.targetArticulationRate[1].toFixed(1)} syl/s</span>
            </div>
            <Slider min={3} max={7} step={0.1} minStepsBetweenThumbs={3} value={s.targetArticulationRate} onValueChange={(v) => s.set({ targetArticulationRate: [v[0], v[1]] })} aria-label="Docelowe tempo mowy" />
            <p className="text-xs text-muted-foreground">Sylaby na sekundę, bez wliczania pauz. Typowe wyraźne tempo to 4,5–5,5.</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>Maksymalnie bez oddechu</Label>
              <span className="tabular-nums">{s.maxContinuousSpeechSeconds} s</span>
            </div>
            <Slider min={4} max={15} step={1} value={[s.maxContinuousSpeechSeconds]} onValueChange={([v]) => s.set({ maxContinuousSpeechSeconds: v })} aria-label="Maksymalnie bez oddechu" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="breath-alert">Przypomnienie o oddechu</Label>
              <p className="text-xs text-muted-foreground">Krótki dźwięk (i wibracja na telefonie), gdy przekroczysz limit mówienia bez oddechu.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={testAlert} aria-label="Odtwórz przykładowe przypomnienie"><Volume2 className="size-4" /> Test</Button>
              <Switch id="breath-alert" checked={s.breathAlert} onCheckedChange={(v) => s.set({ breathAlert: v })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mikrofon i kalibracja</CardTitle>
          <CardDescription>
            {baseline
              ? `Skalibrowano ${new Date(baseline.createdAt).toLocaleDateString('pl-PL')} (${baseline.deviceLabel || 'mikrofon nieznany'}).`
              : 'Brak kalibracji – pomiar tempa używa ustawień domyślnych.'}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dane</CardTitle><CardDescription>Wszystkie dane są przechowywane wyłącznie lokalnie (IndexedDB).</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="destructive" onClick={() => void clear()}>Usuń wszystkie dane</Button>
          <Button variant="outline" onClick={() => { if (confirm('Przywrócić ustawienia domyślne?')) s.reset(); }}>Przywróć ustawienia domyślne</Button>
        </CardContent>
      </Card>
    </div>
  );
}
