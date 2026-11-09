// Breath reminder: two short rising tones + vibration when the breath limit is exceeded.

let ctx: AudioContext | null = null;

/** Must be called from a user gesture (e.g. the "Start" click) so the browser allows audio output. */
export function primeAlertAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function playBreathAlert() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(200);
    } catch {
      /* not supported */
    }
  }
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (const [i, freq] of [660, 880].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = t0 + i * 0.16;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.15);
  }
}
