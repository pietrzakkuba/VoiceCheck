import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bot, MessageCircle, Square, Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/primitives';
import { HudCard, SessionErrors } from '@/components/audio/LiveHud';
import { useTrainingSession } from '@/hooks/useTrainingSession';
import { BOT_SCENARIOS, nextBotQuestion, type BotScenario } from '@/data/botScenarios';
import { speak, stopSpeaking, ttsSupported } from '@/lib/tts';
import { useSettings } from '@/store/settings';
import { uid } from '@/lib/utils';
import type { TrainingSession } from '@/types';

type Stage = 'choose' | 'speaking' | 'answering' | 'processing' | 'done';

interface Turn { question: string; session: TrainingSession | null }

export default function TrainBot() {
  const ts = useTrainingSession();
  const voiceURI = useSettings((s) => s.selectedVoiceURI);
  const [scenario, setScenario] = useState<BotScenario | null>(null);
  const [stage, setStage] = useState<Stage>('choose');
  const [botText, setBotText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const conv = useRef({ id: '', questionIndex: -1, usedFollowUps: [] as number[], lastWasFollowUp: false, noiseFloor: undefined as number | undefined, question: '' });
  const alive = useRef(true);
  const busy = useRef(false);
  const ended = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; stopSpeaking(); };
  }, []);

  const ask = async (sc: BotScenario, question: string, prefix = '') => {
    conv.current.question = question;
    setBotText(prefix ? `${prefix} ${question}` : question);
    setStage('speaking');
    // The mic is off while the bot speaks – no echo of the TTS in the analysis.
    await speak(prefix ? `${prefix} ${question}` : question, voiceURI);
    if (!alive.current || ended.current) return;
    setStage('answering');
    await ts.start(
      { mode: 'bot_conversation', conversationId: conv.current.id, question },
      { calibrateMs: conv.current.noiseFloor === undefined ? 1500 : 0, noiseFloorDb: conv.current.noiseFloor, stopOnSilence: true },
    );
    busy.current = false;
    void sc;
  };

  const finishAnswer = async () => {
    if (!scenario || busy.current || ended.current) return;
    busy.current = true;
    setStage('processing');
    const s = await ts.stop();
    if (!alive.current || ended.current) return;
    const question = conv.current.question;
    setTurns((t) => [...t, { question, session: s }]);
    if (s) conv.current.noiseFloor = s.noiseFloorDb;
    const next = nextBotQuestion(scenario, conv.current, s?.transcript ?? '');
    if (!next) {
      ended.current = true;
      setBotText(scenario.closing);
      setStage('done');
      await speak(scenario.closing, voiceURI);
      return;
    }
    conv.current.questionIndex = next.questionIndex;
    conv.current.lastWasFollowUp = next.followUp !== null;
    if (next.followUp !== null && next.followUp >= 0) conv.current.usedFollowUps.push(next.followUp);
    await ask(scenario, next.question);
  };

  // ≥3 s of silence after speaking ends the answer.
  ts.autoStop.current = () => { void finishAnswer(); };

  const begin = async (sc: BotScenario) => {
    setScenario(sc);
    setTurns([]);
    ended.current = false;
    busy.current = true;
    conv.current = { id: uid(), questionIndex: -1, usedFollowUps: [], lastWasFollowUp: false, noiseFloor: undefined, question: '' };
    const first = nextBotQuestion(sc, conv.current, '')!;
    conv.current.questionIndex = first.questionIndex;
    await ask(sc, first.question, sc.intro);
  };

  const end = async () => {
    const wasRecording = ts.phase === 'recording' && !busy.current;
    ended.current = true;
    stopSpeaking();
    setStage('done');
    if (wasRecording) {
      const question = conv.current.question;
      const s = await ts.stop();
      if (alive.current) setTurns((t) => [...t, { question, session: s }]);
    }
  };

  const answered = turns.filter((t) => t.session);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Bot className="size-6 text-primary" aria-hidden /> Rozmowa z botem</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bot zadaje pytania głosem, Ty odpowiadasz swobodnie. Odpowiedź kończy się przyciskiem „Skończyłem” lub po 3 sekundach ciszy.
          Oceniamy tempo, pauzy, wypełniacze („yyy”, „no”) i wyrazistość.
        </p>
      </div>
      {!ttsSupported() && <Alert variant="warn">Twoja przeglądarka nie obsługuje syntezy mowy – pytania zostaną tylko wyświetlone.</Alert>}

      {stage === 'choose' && (
        <div className="grid gap-3 md:grid-cols-2">
          {BOT_SCENARIOS.map((sc) => (
            <Card key={sc.id}>
              <CardHeader>
                <CardTitle>{sc.title}</CardTitle>
                <CardDescription>{sc.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => void begin(sc)}><MessageCircle className="size-4" aria-hidden /> Rozpocznij</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {stage !== 'choose' && scenario && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {scenario.title}
              <Badge variant="secondary">{stage === 'speaking' ? 'Bot mówi' : stage === 'answering' ? 'Twoja kolej' : stage === 'processing' ? 'Analiza…' : 'Koniec'}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3 items-start">
              <div className="rounded-full bg-primary/10 p-2"><Volume2 className="size-5 text-primary" aria-hidden /></div>
              <p className="text-lg" aria-live="polite">{botText}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stage === 'answering' && (
                <Button onClick={() => void finishAnswer()} disabled={ts.phase !== 'recording'}>
                  <Square className="size-4" aria-hidden /> Skończyłem
                </Button>
              )}
              {stage === 'speaking' && <Button variant="outline" onClick={() => stopSpeaking()}>Pomiń pytanie głosowe</Button>}
              {stage !== 'done' && <Button variant="ghost" onClick={() => void end()}>Zakończ rozmowę</Button>}
              {stage === 'done' && <Button onClick={() => setStage('choose')}>Nowa rozmowa</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      <SessionErrors error={ts.error} deviceWarning={ts.deviceWarning} />
      {stage === 'answering' && <HudCard stats={ts.stats} getDb={ts.getDb} getSpeaking={ts.getSpeaking} captions={ts.captions} />}

      {answered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Twoje odpowiedzi</CardTitle>
            <CardDescription>Każda odpowiedź ma osobny raport.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {answered.map((t, i) => (
                <li key={t.session!.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Pytanie {i + 1}</div>
                    <div className="truncate">{t.question}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.session!.analysisStatus === 'pending' ? <Badge variant="secondary">oczekuje</Badge> : <Badge variant={t.session!.scores.total >= 75 ? 'ok' : t.session!.scores.total >= 55 ? 'warn' : 'bad'}>{Math.round(t.session!.scores.total)}</Badge>}
                    <Button asChild size="sm" variant="outline"><Link to={`/session/${t.session!.id}`}>Raport</Link></Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
