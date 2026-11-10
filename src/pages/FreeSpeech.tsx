import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenText } from 'lucide-react';
import { CalibrationPrompt } from '@/components/CalibrationPrompt';
import { KeepScreenAwakeToggle } from '@/components/KeepScreenAwakeToggle';
import { DeleteSessionsButton } from '@/components/DeleteSessionsButton';
import { SessionList } from '@/components/SessionList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HudCard, RecordControls, SessionErrors } from '@/components/audio/LiveHud';
import { LivePacePanel, useLiveIndicators } from '@/components/audio/LivePacePanel';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { useSettings } from '@/store/settings';
import { db } from '@/store/db';
import { cn } from '@/lib/utils';
import { LanguageSelect } from '@/components/LanguageSelect';
import { useLang, useT, type Lang } from '@/i18n';

/** Reading a text that is not stored in the app – only pace and breathing are tracked. */
export default function FreeSpeech() {
  const target = useSettings((s) => s.targetArticulationRate);
  const maxBreathSeconds = useSettings((s) => s.maxContinuousSpeechSeconds);
  const ts = useTrainingSession();
  const t = useT();
  const appLang = useLang();
  const [chosenLang, setLanguage] = useState<Lang | null>(null);
  const language = chosenLang ?? appLang;
  const allSessions = useLiveQuery(() => db.sessions.where({ mode: 'free_speech' }).reverse().sortBy('timestamp'), [], []);
  const sessions = allSessions.filter((session) => session.schema === 2);
  const nav = useNavigate();
  const active = ts.phase === 'recording' || ts.phase === 'processing' || ts.phase === 'starting';
  const { frameColor } = useLiveIndicators(ts.phase, ts.stats, target);

  const start = () => ts.start({ mode: 'free_speech', language });
  const stop = async () => {
    const s = await ts.stop();
    if (s) nav(`/session/${s.id}`);
  };

  return (
    <div className={cn('space-y-5', active && 'recording-active')}>
      {!active && <CalibrationPrompt lang={language} />}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><BookOpenText className="size-6 text-primary" aria-hidden /> {t.sessions.freeSpeech.title}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t.sessions.freeSpeech.intro}
        </p>
      </div>

      {!active && (
        <Card>
          <CardHeader>
            <CardTitle>{t.sessions.freeSpeech.howTitle}</CardTitle>
            <CardDescription>{t.sessions.freeSpeech.howDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageSelect
              className="max-w-xs"
              value={language}
              onChange={setLanguage}
              label={t.common.language.speech}
              hint={t.common.language.speechHint}
            />
          </CardContent>
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
      <KeepScreenAwakeToggle active={active} />
      <div className="flex items-center gap-3">
        <RecordControls phase={ts.phase} onStart={start} onStop={stop} />
        {ts.phase === 'recording' && <span className="text-sm text-muted-foreground">{t.sessions.freeSpeech.recordingHint}</span>}
      </div>
      {active && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} showBreath={false} />}
      {!active && (
        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>{t.sessions.freeSpeech.historyTitle}</CardTitle>
              <CardDescription>{t.sessions.freeSpeech.historyCount(sessions.length)}</CardDescription>
            </div>
            <DeleteSessionsButton scope={{ mode: 'free_speech' }} disabled={allSessions.length === 0} />
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.sessions.freeSpeech.empty}</p>
            ) : (
              <SessionList sessions={sessions} titles={new Map()} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
