# VoiceCheck

**English** | [Polski](README.pl.md)

VoiceCheck is a browser-based speaking coach for rehearsing presentations and
practicing unscripted speech in English and Polish. Get live feedback on your
pace and pauses, then review your recording and session report. Audio processing
and data storage stay on your device; no analysis backend is required.

## Features

- **Presentation rehearsal:** save and format scripts, see estimated reading
  time, and rehearse with your text on screen.
- **Free speaking:** practice from memory or use notes outside the app.
- **Live feedback:** monitor articulation pace in syllables per second, time
  spent speaking without a pause, and microphone noise or clipping warnings.
- **Personal calibration:** read a reference text to adapt syllable estimates
  to your voice and microphone, separately for each language.
- **Session reports:** replay recordings, inspect a timeline of speech and
  pauses, review phrase-level metrics, and revisit previous attempts.
- **Installable and offline:** use the production app as a PWA after its
  resources have been cached.

The interface supports English and Polish, light and dark themes, and desktop
and mobile layouts.

## Getting started

1. Choose your interface and speech language. Optionally complete calibration
   for that language to improve estimates.
2. Open **Free speaking**, or create a script in **Presentations** and start
   presenting. Allow microphone access when prompted.
3. Use the pace and pause indicators while speaking. Adjust the target pace
   and continuous-speech limit in **Settings** to suit your practice.
4. Finish the session to review the recording and report in **History**.

### What the measurements mean

VoiceCheck estimates syllables from acoustic features and uses the local
**Silero VAD** machine-learning model to distinguish speech from silence.
It does not transcribe speech or use generative AI.

Pace is an estimate of articulation rate, excluding pauses. Reported “breaths”
are inferred from pauses, not measured breathing. Automatic script scrolling
estimates progress from syllable counts; it does not recognize which words you
have spoken. Reading-time estimates include an allowance for pauses, not a
personal prediction of delivery time.

Use the feedback as a practice aid, not a clinical assessment. Microphone
quality, background noise and calibration can affect the results.

## Privacy and local data

Recordings and analysis are processed locally in your browser. Presentations,
sessions, recordings and calibration records are stored in IndexedDB;
preferences are stored in localStorage. The app does not upload recordings to
an analysis service.

Data belongs to the current browser profile and site address. There is no
cross-device synchronization or automatic backup. Clearing site data also
removes your saved work; installing the PWA does not create a separate backup.
You can delete sessions and presentations in the app, or clear application
data in **Settings**.

## Local development

Use **Node.js 22.12 or later** and npm.

```sh
npm install
npm run dev
```

Open the address printed by Vite, normally <http://localhost:5173>.
Installation also copies the Silero VAD model and ONNX Runtime WASM assets
from dependencies into `public/vendor`; no API key or backend setup is needed.
Microphone access requires HTTPS or localhost.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Check TypeScript types |
| `npm run build` | Type-check and create the production build in `dist` |
| `npm run preview` | Serve the production build locally |
| `npm run icons` | Regenerate app icons |

## Deployment

Deploy the contents of `dist` to a static host over HTTPS. The current
configuration assumes the app is served at the domain root.

- Configure an SPA fallback to `index.html` so direct links such as
  `/presentations` and `/session/<id>` work. The repository includes
  `vercel.json` for Vercel.
- Serve static assets, including `sw.js`, `manifest.webmanifest`, `offline.html`
  and `icons/`, as actual files rather than the SPA fallback. Use
  `Cache-Control: no-cache` for `sw.js`.
- Recommended isolation headers are
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`. Vite's development and preview
  servers set them. The production service worker also provides isolation
  support on hosts without header configuration; the first visit may reload
  once before the interface starts.

### Installation, offline use and updates

PWA support is enabled in production builds, including when served with
`npm run preview`, not in the development server.

After a successful online visit and completed caching, the interface, VAD model
and WASM runtime are available offline. Check **Settings** for offline readiness
before disconnecting. First-time use without an internet connection is not
supported.

Install from **Settings** when your browser offers installation, or use its
installation menu. On iPhone and iPad, use Safari's **Share → Add to Home Screen**.
Installation and microphone support depend on the browser.

When an update is offered, finish recording and save any script edits before
applying it. Updating preserves local data but may reload the current window.

## Technology and code

| Area | Technology |
| --- | --- |
| Interface | React, TypeScript, Vite, Tailwind CSS, React Router |
| Script editor | Tiptap / ProseMirror |
| State and storage | Zustand, Dexie / IndexedDB |
| Audio | Web Audio / AudioWorklet, MediaRecorder, Silero VAD, ONNX Runtime Web |
| Offline support | Service worker, Workbox, vite-plugin-pwa |
| Tests | Vitest, jsdom |

The signal-analysis core lives in `src/engine`, microphone integration in
`src/audio`, and browser storage in `src/store`. See the
[architecture reference](documentation/architecture.md) for the data
flow and implementation details.

For diagnostic session data and JSON export, append `?debug=1` to a report URL,
for example `/session/<id>?debug=1`. Analysis thresholds are defined in
`src/engine/thresholds.ts`.
