import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Settings as SettingsIcon, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { PwaInstall } from '@/components/PwaInstall';
import { Label, NativeSelect, Slider, Switch, Alert } from '@/components/ui/primitives';
import { DEFAULT_CALIBRATION, useSettings } from '@/store/settings';
import { LanguageSelect } from '@/components/LanguageSelect';
import { LANGS, LANGUAGE_NAMES, formatDate, formatDecimal, useT } from '@/i18n';
import { clearAllData, getBaseline } from '@/store/db';
import { listMicrophones } from '@/audio/capture';
import { playBreathAlert, primeAlertAudio } from '@/lib/alert';

export default function Settings() {
  const s = useSettings();
  const t = useT();
  const ts = t.settings;
  const lang = s.appLanguage;
  const baselines = useLiveQuery(() => Promise.all(LANGS.map((l) => getBaseline(l))), [], undefined);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void listMicrophones().then(setMics).catch(() => setMics([]));
  }, []);

  const clear = async () => {
    await clearAllData();
    s.set({ calibration: structuredClone(DEFAULT_CALIBRATION) });
    setMsg(ts.cleared);
  };

  const testAlert = () => {
    primeAlertAudio();
    playBreathAlert();
  };

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 h-9 text-muted-foreground">
          <Link to="/"><ArrowLeft className="size-4" aria-hidden /> {t.common.home}</Link>
        </Button>
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1"><SettingsIcon className="size-6 text-primary" aria-hidden /> {ts.title}</h1>
      </div>
      {msg && <Alert variant="ok">{msg}</Alert>}

      <Card>
        <CardHeader><CardTitle>{ts.appearance}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="theme">{ts.theme}</Label>
            <ThemeSwitch id="theme" />
          </div>
          <LanguageSelect
            value={lang}
            onChange={(appLanguage) => s.set({ appLanguage })}
            label={t.common.language.app}
            hint={t.common.language.appHint}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ts.paceTitle}</CardTitle>
          <CardDescription>{ts.paceDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>{ts.targetRate}</Label>
              <span className="tabular-nums">{formatDecimal(s.targetArticulationRate[0], 1, lang)}–{formatDecimal(s.targetArticulationRate[1], 1, lang)} syl/s</span>
            </div>
            <Slider min={3} max={7} step={0.1} minStepsBetweenThumbs={3} value={s.targetArticulationRate} onValueChange={(v) => s.set({ targetArticulationRate: [v[0], v[1]] })} aria-label={ts.targetRate} />
            <p className="text-xs text-muted-foreground">{ts.targetRateHint}</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <Label>{ts.maxBreath}</Label>
              <span className="tabular-nums">{s.maxContinuousSpeechSeconds} s</span>
            </div>
            <Slider min={4} max={15} step={1} value={[s.maxContinuousSpeechSeconds]} onValueChange={([v]) => s.set({ maxContinuousSpeechSeconds: v })} aria-label={ts.maxBreath} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="breath-alert">{ts.breathAlert}</Label>
              <p className="text-xs text-muted-foreground">{ts.breathAlertHint}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={testAlert} aria-label={ts.testAlert}><Volume2 className="size-4" /> {ts.test}</Button>
              <Switch id="breath-alert" checked={s.breathAlert} onCheckedChange={(v) => s.set({ breathAlert: v })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ts.micTitle}</CardTitle>
          <CardDescription>{ts.micDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="mic">{ts.mic}</Label>
            <NativeSelect id="mic" className="mt-1.5" value={s.micDeviceId ?? ''} onChange={(e) => s.set({ micDeviceId: e.target.value || null })}>
              <option value="">{ts.defaultMic}</option>
              {mics.map((m, i) => <option key={m.deviceId || i} value={m.deviceId}>{m.label || ts.micN(i + 1)}</option>)}
            </NativeSelect>
            {mics.length > 0 && mics.every((m) => !m.label) && <p className="text-xs text-muted-foreground mt-1">{ts.micNamesHint}</p>}
          </div>
          <ul className="space-y-3">
            {LANGS.map((l, i) => {
              const baseline = baselines?.[i];
              return (
                <li key={l} className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" lang={l}>{LANGUAGE_NAMES[l]}</p>
                    <p className="text-xs text-muted-foreground">
                      {baseline
                        ? ts.calibrated(formatDate(baseline.createdAt, lang), baseline.deviceLabel || ts.unknownMic)
                        : ts.notCalibrated}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/calibration?lang=${l}`} aria-label={`${baseline ? ts.recalibrate : ts.calibrate}: ${LANGUAGE_NAMES[l]}`}>
                      {baseline ? ts.recalibrate : ts.calibrate}
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <PwaInstall />

      <Card>
        <CardHeader><CardTitle>{ts.dataTitle}</CardTitle><CardDescription>{ts.dataDescription}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ConfirmDialog
            title={ts.clearTitle}
            description={ts.clearDescription}
            confirmLabel={ts.clearConfirm}
            errorMessage={ts.clearError}
            destructive
            onConfirm={clear}
          >
            <Button variant="destructive">{ts.clearConfirm}</Button>
          </ConfirmDialog>
          <ConfirmDialog
            title={ts.resetTitle}
            description={ts.resetDescription}
            confirmLabel={ts.resetConfirm}
            errorMessage={ts.resetError}
            onConfirm={s.reset}
          >
            <Button variant="outline">{ts.resetButton}</Button>
          </ConfirmDialog>
        </CardContent>
      </Card>
    </div>
  );
}
