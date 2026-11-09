const MIME_PREFERENCE = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/** MediaRecorder (Opus) recording of the same stream – used for playback in the report (stored in IndexedDB). */
export class AudioRecorder {
  private rec: MediaRecorder;
  private parts: Blob[] = [];
  readonly mimeType: string;
  startedAt = 0;

  constructor(stream: MediaStream) {
    const mime = pickMimeType();
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    this.mimeType = this.rec.mimeType || mime || 'audio/webm';
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.parts.push(e.data);
    };
  }

  start() {
    this.startedAt = performance.now();
    this.rec.start(1000);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (this.rec.state === 'inactive') {
        resolve(new Blob(this.parts, { type: this.mimeType }));
        return;
      }
      this.rec.onstop = () => resolve(new Blob(this.parts, { type: this.mimeType }));
      this.rec.stop();
    });
  }
}
