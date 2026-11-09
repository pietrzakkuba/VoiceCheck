// Optional live captions via the Web Speech API (4.4) – display only, never used for scoring.

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const liveCaptionsSupported = () => getCtor() !== null;

export class LiveCaptions {
  private rec: SpeechRecognitionLike | null = null;
  private active = false;
  private finalText = '';

  constructor(private onText: (finalText: string, interim: string) => void) {}

  start() {
    const C = getCtor();
    if (!C) return false;
    this.active = true;
    const rec = new C();
    rec.lang = 'pl-PL';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      this.onText(this.finalText.trim(), interim);
    };
    rec.onend = () => {
      // Automatic restart (Chrome stops after silence).
      if (this.active) {
        try { rec.start(); } catch { /* already started */ }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.active = false;
    };
    this.rec = rec;
    try { rec.start(); } catch { return false; }
    return true;
  }

  stop() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* ignore */ }
    this.rec = null;
  }
}
