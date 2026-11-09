import { useEffect, useState } from 'react';

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function polishVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('pl'));
}

/** Voices load asynchronously in Chrome; re-renders when they arrive. */
export function usePolishVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => polishVoices());
  useEffect(() => {
    if (!ttsSupported()) return;
    const upd = () => setVoices(polishVoices());
    upd();
    speechSynthesis.addEventListener('voiceschanged', upd);
    return () => speechSynthesis.removeEventListener('voiceschanged', upd);
  }, []);
  return voices;
}

/** Speaks Polish text; resolves when finished (or immediately if TTS is unavailable). */
export function speak(text: string, voiceURI: string | null, rate = 0.95): Promise<void> {
  if (!ttsSupported() || !text) return Promise.resolve();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pl-PL';
    u.rate = rate;
    const voices = polishVoices();
    const v = voices.find((x) => x.voiceURI === voiceURI) ?? voices[0];
    if (v) u.voice = v;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve();
    };
    // Safety net: some engines never fire onend.
    const guard = setTimeout(finish, 2000 + text.length * 120);
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel();
}
