import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Crosshair } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { TargetText } from '@/components/TargetText';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { CALIBRATION_TEXTS } from '@/data/calibrationText';
import { LanguageSelect } from '@/components/LanguageSelect';
import { formatDecimal, isLang, useLang, useT, type Lang } from '@/i18n';
import { normalizeText } from '@/engine/normalize';
import { countTextSyllables } from '@/engine/syllables';
import { T } from '@/engine/thresholds';
import { recomputeSession } from '@/lib/sessionPipeline';
import { saveBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';
import type { TrainingSession, UserBaseline } from '@/types';
import { cn } from '@/lib/utils';

const CALIBRATE_MS = 2000;

/**
 * Derives the per-user syllable-detector correction from a reading of the calibration text,
 * whose real syllable count is known. Returns null when the recording does not look like a full reading.
 */
export function calibrationFromSession(s: TrainingSession, textSyllables: number, textWords: number): UserBaseline | null {
  const raw = s.tracks.nucleiMs.filter((t) => s.phrases.some((p) => t >= p.startMs - 50 && t <= p.endMs + 50)).length;
  const speechSec = s.metrics.speechMs / 1000;
  if (raw < 20 || speechSec < 10) return null;
  const ratio = textSyllables / raw;
  if (ratio < 0.5 || ratio > 2) return null;
  return {
    createdAt: Date.now(),
    deviceLabel: s.deviceLabel,
    articulationRate: +(textSyllables / speechSec).toFixed(2),
    syllablesPerWord: +(textSyllables / Math.max(1, textWords)).toFixed(2),
    liveSyllableCorrection: +Math.min(T.correctionMax, Math.max(T.correctionMin, ratio)).toFixed(3),
  };
}

/** Calibration: read a known text naturally → syllable-count correction for this voice and microphone. */
export default function Calibration() {
  const ts = useTrainingSession();
  const nav = useNavigate();
  const set = useSettings((s) => s.set);
  const t = useT();
  const appLang = useLang();
  const [params, setParams] = useSearchParams();
  const requested = params.get('lang');
  const lang: Lang = isLang(requested) ? requested : appLang;
  const setLang = (l: Lang) => { setResult(null); setParams({ lang: l }, { replace: true }); };
  const text = CALIBRATION_TEXTS[lang];
  const tokens = useMemo(() => normalizeText(text, lang), [text, lang]);
  const textSyllables = useMemo(() => countTextSyllables(tokens.map((tk) => tk.word), lang), [tokens, lang]);
  const [result, setResult] = useState<{ session: TrainingSession; ok: boolean; msg: string } | null>(null);
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';

  const tsStop = ts.stop;
  const stop = useCallback(async () => {
    const s = await tsStop();
    if (!s) return;
    const b = calibrationFromSession(s, textSyllables, tokens.length);
    if (!b) {
      setResult({ session: s, ok: false, msg: t.calibration.failed });
      return;
    }
    await saveBaseline(lang, b);
    set({
      calibration: {
        ...useSettings.getState().calibration,
        [lang]: { liveSyllableCorrection: b.liveSyllableCorrection, syllablesPerWord: b.syllablesPerWord },
      },
      onboardingDismissed: true,
    });
    const updated = (await recomputeSession(s.id)) ?? s;
    setResult({
      session: updated,
      ok: true,
      msg: t.calibration.done(formatDecimal(b.articulationRate, 1, appLang)),
    });
  }, [tsStop, set, textSyllables, tokens.length, lang, t, appLang]);

  const start = () => {
    setResult(null);
    void ts.start({ mode: 'calibration', targetText: text, language: lang }, { calibrateMs: CALIBRATE_MS });
  };

  return (
    <div className={cn('calibration-view space-y-5', active && 'recording-active calibration-active')}>
      <div className="calibration-intro">
        {!active && (
          <Button asChild variant="ghost" size="sm" className="-ml-3 h-9 text-muted-foreground">
            <Link to="/"><ArrowLeft className="size-4" aria-hidden /> {t.common.home}</Link>
          </Button>
        )}
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1"><Crosshair className="size-6 text-primary" aria-hidden /> {t.calibration.title}</h1>
        <p className="calibration-intro-text text-muted-foreground text-sm mt-1">
          {t.calibration.intro}
        </p>
        {!active && (
          <LanguageSelect
            className="mt-3 max-w-xs"
            value={lang}
            onChange={setLang}
            label={t.common.language.calibration}
            hint={t.common.language.calibrationHint}
          />
        )}
      </div>
      {!active && !result && (
        <Card className="calibration-instructions">
          <CardHeader>
            <CardTitle>{t.calibration.howTitle}</CardTitle>
            <CardDescription>{t.calibration.howDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              <li>{t.calibration.step1}</li>
              <li>{t.calibration.step2Before}<strong>{t.calibration.step2Strong}</strong>{t.calibration.step2After}</li>
              <li>{t.calibration.step3}</li>
            </ol>
          </CardContent>
        </Card>
      )}
      {(active || !result) && (
        <Card className="calibration-text-card">
          <CardContent className="calibration-text" tabIndex={0} role="region" aria-label={t.calibration.textRegion} lang={lang}>
            <TargetText tokens={tokens} />
          </CardContent>
        </Card>
      )}
      {(ts.error || ts.deviceWarning) && (
        <div className="calibration-errors">
          <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
        </div>
      )}
      {result && (
        <Alert variant={result.ok ? 'ok' : 'warn'}>
          {result.ok ? <CheckCircle2 className="size-4 mt-0.5" aria-hidden /> : <AlertTriangle className="size-4 mt-0.5" aria-hidden />}
          <div className="space-y-2">
            <p>{result.msg}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => nav(`/session/${result.session.id}`)}>{t.calibration.viewReport}</Button>
              <Button size="sm" variant="outline" onClick={start}>{t.calibration.repeat}</Button>
              <Button size="sm" variant="ghost" onClick={() => nav('/')}>{t.common.home}</Button>
            </div>
          </div>
        </Alert>
      )}
      {!result && (
        <div className="calibration-controls">
          <RecordControls phase={ts.phase} onStart={start} onStop={stop} startLabel={t.calibration.start} />
        </div>
      )}
      {active && (
        <div className="calibration-hud">
          <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} />
        </div>
      )}
    </div>
  );
}
