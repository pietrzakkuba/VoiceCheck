# VoiceCheck architecture

**English** | [Polski](architecture.pl.md) | [README](../README.md)

This document describes the implemented system: component responsibilities,
execution paths, data contracts, persistence and browser integrations.

## 1. System scope

VoiceCheck is a browser-only SPA/PWA for presentation rehearsal, free speaking
and voice calibration in English and Polish. A static host delivers the
application, its voice-activity model and its WASM runtime. There is no
application backend or remote recording-analysis API.

The browser captures microphone audio, detects speech and acoustic syllable
nuclei, estimates pace and pauses, and stores recordings and reports locally.
Silero VAD is a local machine-learning model for speech/silence classification.
The application does not transcribe speech or use generative AI. Reported
breaths represent pauses between phrases, not physiological measurements.

There are three distinct data lifetimes:

| Lifetime | Contents | Owner |
| --- | --- | --- |
| Active recording | PCM blocks, feature tracks, detector state, recorder chunks | `MicCapture`, `LiveAnalyzer`, `AudioRecorder` |
| Persisted user data | Presentations, sessions, audio, calibration records, preferences | IndexedDB and localStorage |
| Application resources | JavaScript, CSS, icons, app shell, VAD model, WASM | HTTP delivery and service-worker cache |

The service-worker cache is not a backup of user data.

## 2. Technology and module boundaries

| Area | Technology and responsibility |
| --- | --- |
| Build | Vite, strict TypeScript, alias `@` for `src` |
| UI and navigation | React, React Router, lazy-loaded pages |
| Styling and primitives | Tailwind CSS, Radix UI, local UI wrappers, lucide-react |
| Editing and charts | Tiptap / ProseMirror; Recharts |
| State and persistence | Zustand; Dexie / IndexedDB; `dexie-react-hooks` |
| Audio | Web Audio, AudioWorklet, MediaRecorder |
| Speech detection | Silero VAD v5 through ONNX Runtime Web / WASM |
| Offline delivery | `vite-plugin-pwa`, Workbox, custom service worker |
| Tests | Vitest; jsdom for browser-oriented tests |

| Source area | Responsibility |
| --- | --- |
| [`src/engine`](../src/engine) | Signal features, segmentation, syllable nuclei, metrics, thresholds |
| [`src/audio`](../src/audio) | Microphone capture, resampling, recording, VAD integration, live analysis, decoding |
| [`src/lib`](../src/lib) | Session finalization, presentation documents, PWA, alerts and display helpers |
| [`src/store`](../src/store) | IndexedDB schema and operations; persistent preferences |
| [`src/hooks`](../src/hooks) | Recording lifecycle, playback and browser API integration with React |
| [`src/pages`](../src/pages) | Route-level orchestration and views |
| [`src/components`](../src/components) | Shared controls, live feedback, editor and report rendering |
| [`src/i18n`](../src/i18n) | Language selection, dictionaries and formatting |
| [`src/data`](../src/data) | Reference calibration texts |

The analysis engine has no React or microphone dependency. Browser adapters
produce the engine's inputs; the session pipeline combines analysis with
settings and persistence. Pages coordinate those services through hooks.

## 3. Initialization and routing

[`main.tsx`](../src/main.tsx) awaits `initializePwa()` before mounting React.
A bootstrap isolation reload can end initialization before the UI mounts.
Otherwise the root renders under `StrictMode` and `BrowserRouter`.

[`App.tsx`](../src/App.tsx) applies the theme and interface language, renders
the navigation shell and PWA status, and defines lazy-loaded routes under
`Suspense`. A startup effect preloads VAD and invokes legacy-session migration.
The VAD instance is shared by capture and legacy audio analysis.

| Route | View |
| --- | --- |
| `/speaking` | Free speaking |
| `/presentations` | Presentation library |
| `/presentations/:id` | Presentation editor |
| `/presentations/:id/rehearse` | Rehearsal |
| `/presentations/:id/history` | Presentation session history |
| `/history` | Session history |
| `/session/:id` | Session report |
| `/calibration` | Language-specific calibration |
| `/settings` | Preferences and data management |

`/`, `/dashboard`, `/reading` and unmatched paths redirect to `/speaking`.
Routing uses browser history, not URL hashes; direct navigation requires an
SPA fallback on the host.

## 4. Recording lifecycle and execution model

[`useTrainingSession`](../src/hooks/useTrainingSession.ts) owns the active
`MicCapture`, session metadata, live statistics and error/device-warning state.
The normal phase sequence is:

```text
idle -> starting -> recording -> processing -> idle
             operation failure -> error
cancel -> idle
```

`start()` selects the speech-language calibration and microphone preference,
primes alert audio, and starts capture. Default noise-floor calibration lasts
2,000 ms; callers can override it or supply a known noise floor. A saved
baseline from a different microphone produces a warning.

`stop()` shares an in-flight promise to avoid duplicate finalization. Recordings
shorter than one second or without detected speech enter the error state rather
than creating a session. Capture/analysis failures produce localized errors.
`cancel()` discards the active capture; hook unmount also invokes cancellation.
Device-change events update the warning state.

```text
Page -> useTrainingSession -> MicCapture
                               |
                 getUserMedia MediaStream
                   |                     |
              MediaRecorder         AudioWorklet
                   |                mono 16 kHz PCM
              playback Blob               |
                                    main-thread onBlock
                                      |          |
                               FeatureExtractor  queued Silero VAD
                                      |          |
                                      +-> LiveAnalyzer -> live statistics

stop -> CaptureResult -> finalizeRecording -> analyzeSession
                                              |
                                  IndexedDB session + audio
                                              |
                                       session report
```

### Capture and resource ownership

[`MicCapture`](../src/audio/capture.ts) requests mono input with echo
cancellation enabled and noise suppression/automatic gain control disabled.
Actual constraint support depends on the browser and device.

The audio graph first attempts a 16 kHz `AudioContext`. If graph setup fails,
it retries with a native-rate context and worklet resampling. The
[`worklet`](../src/audio/capture.worklet.ts) averages channels to mono,
applies a 7 kHz low-pass filter when resampling, and uses linear interpolation.
It transfers complete 512-sample blocks: 32 ms at 16 kHz. The worklet is
self-contained and does not import application modules.

Feature extraction and live-statistics orchestration run on the main thread.
VAD calls are asynchronous and serialized to preserve recurrent model state
and frame order. [`SileroVad`](../src/audio/vad.ts) uses 64 samples of preceding
context, a recurrent state tensor and single-threaded WASM execution
(`numThreads = 1`).

Capture retains the PCM blocks while
[`AudioRecorder`](../src/audio/recorder.ts) independently accumulates encoded
chunks from the same stream. MIME selection prefers WebM/Opus, then Ogg/Opus,
WebM and MP4, falling back to the browser default. Stop disconnects capture,
stops stream tracks, closes the context and waits for queued VAD work before
returning the result.

## 5. Signal processing and live feedback

### Frame features and detectors

[`FeatureExtractor`](../src/engine/features.ts) produces features every 10 ms:

| Feature | Computation |
| --- | --- |
| `db` | Broadband intensity, 50 ms window, dBFS |
| `bandDb` | Intensity in the 300–2500 Hz vowel band, 30 ms window |
| `voicing` | Normalized autocorrelation, 40 ms window, 75–400 Hz fundamental range |
| `clipped` | Fraction of samples with absolute amplitude at least 0.99 in the hop |

[`NucleusDetector`](../src/engine/syllableNuclei.ts) smooths envelopes over
three frames and accepts voiced local peaks using prominence, noise-floor,
recent-vowel-level and spacing criteria. Accepted frame indices become
uncorrected nucleus timestamps in milliseconds.

[`VadHysteresis`](../src/engine/segmentation.ts) starts speech at probability
greater than 0.5 and ends it below 0.35. Energy/voicing refinement trims quiet
edges and splits VAD segments at quiet runs of at least 300 ms. Its quiet
threshold combines the noise floor with an estimated voiced-speech level.

### Live analysis

[`LiveAnalyzer`](../src/audio/liveAnalyzer.ts) initially estimates the noise
floor as the median of calibration frames. Subsequently, silence frames
update it using a smoothed 10th-percentile estimate. A supplied noise floor
bypasses the initial estimation phase.

Refined segments separated by less than 300 ms are merged into phrase-like
runs. Pace uses nuclei within those runs in a trailing 10-second window and
requires at least three seconds of speech. The estimate applies the selected
calibration multiplier and exponential smoothing with a two-second time
constant. Live WPM is derived from this articulation-rate estimate.

The cumulative corrected syllable count used for reading progress excludes
initial calibration. Live statistics are published approximately every 100 ms.
The breath indicator compares the current run length with the configured
continuous-speech limit: warning begins at 75%, critical at 100%.
Entering critical state can trigger sound and vibration when alerts are enabled.

Relevant constants are centralized in
[`thresholds.ts`](../src/engine/thresholds.ts):

| Parameter | Value |
| --- | --- |
| Breath pause / long pause | At least 300 ms / more than 2,000 ms |
| Nucleus prominence / level above noise | At least 2 dB / at least 10 dB |
| Nucleus level below recent loud-vowel reference | At most 20 dB |
| Nucleus voicing / spacing criterion | Greater than 0.45 / 100 ms |
| Minimum phrase duration / corrected syllables for tempo classification | 1,500 ms / 4 |
| Low-SNR warning / clipping-ratio threshold | Below 12 dB / above 0.01 |
| Live tempo-zone hysteresis margin | 0.25 syllables/s |

The default user targets, stored separately from detector thresholds, are
4.5–5.5 syllables/s and an eight-second continuous-speech limit.

## 6. Final analysis and report data

[`finalizeRecording`](../src/lib/sessionPipeline.ts) receives PCM, the playback
Blob, feature tracks, refined speech segments, raw nuclei and capture metadata.
It decodes the Blob and compares intensity envelopes to estimate the offset
between playback time and PCM analysis time. If offset measurement fails, the
pipeline uses zero offset. It also creates a downsampled peak waveform.

The pipeline snapshots the current analysis settings at finalization and
calls [`analyzeSession`](../src/engine/session.ts). `saveSession()` stores the
session and audio together in a Dexie transaction. Successful practice pages
then navigate to the report; calibration displays its own result.

### Phrase and metric definitions

Final analysis sorts valid segments and merges gaps shorter than 300 ms.
Each resulting phrase counts raw nuclei within a 50 ms boundary margin,
multiplies by the correction factor, and rounds its own syllable count.
Intervals between phrases become pauses; those longer than 2,000 ms are `long`.
Leading and trailing silence are not counted as breath pauses.

Let `S` be the sum of corrected phrase syllables, `P` the sum of phrase
durations in seconds, and `D` the span from the first phrase's start to the
last phrase's end:

```text
articulationRate = S / P
speechRate      = S / D
report WPM      = speechRate * 60 / max(1, syllablesPerWord)
breathCount     = number of inter-phrase pauses
breaths/minute  = breathCount / (D / 60)
```

Empty denominators produce zero rates. Short gaps merged inside a phrase remain
part of its duration. `durationSeconds`, in contrast, covers the captured
session, including initial silence/calibration and pauses.

Phrases shorter than 1,500 ms or with fewer than four corrected syllables are
`short`. Other phrases are `too_fast` above the target upper bound plus 1,
`fast` above the upper bound, `slow` below the lower bound minus 1, and `ok`
otherwise. A phrase exceeds the breath limit when its duration is strictly
greater than that limit.

Live and final metrics share detectors and segmentation utilities but are not
identical: live results use partial asynchronous data, a moving window,
smoothing and a 30 ms nucleus boundary margin; final results use full-session
data, 50 ms margins and per-phrase rounding.

### Reports and playback

[`SessionReport`](../src/pages/SessionReport.tsx) renders metrics, phrase and
pause tracks, warnings and rule-based tips. `TipKey` plus numeric parameters
supports localization at display time; report tips can be rebuilt from stored
metrics and settings. There is no language-model call.

[`useSessionAudio`](../src/hooks/useSessionAudio.ts) loads the Blob from
IndexedDB into an object URL, maps seek/playback ranges through `audioOffsetMs`,
and revokes the URL on cleanup. The report timeline uses analysis time.
The `?debug=1` report mode exposes diagnostic data and JSON export.

## 7. Calibration and recomputation

[`Calibration`](../src/pages/Calibration.tsx) normalizes a language-specific
reference text and estimates its word and syllable counts. Calibration
compares that text with raw nuclei falling within recorded phrase boundaries:

```text
ratio              = reference syllables / raw nuclei
correction         = clamp(ratio, 0.6, 1.6)
syllablesPerWord    = reference syllables / max(1, reference words)
```

A result is rejected with fewer than 20 raw nuclei, less than ten seconds
of phrase time, or a ratio outside 0.5–2. The correction is rounded to three
decimal places. Validation does not recognize words or confirm complete reading.

Accepted results are saved in the language's IndexedDB baseline record and
its analysis parameters are copied into persistent settings. The calibration
session is then recomputed. Other historical sessions are not automatically
recomputed by saving a calibration.

`recomputeSession()` works on schema-2 sessions using stored
`tracks.speechSegments`, uncorrected `tracks.nucleiMs`, duration and SNR.
It applies current speech-language settings without decoding audio or running
VAD again, and replaces the session's settings snapshot and derived analysis.
The report compares the snapshot with current settings to detect differences.

Legacy migration is a separate path: it decodes stored audio, extracts features,
reruns VAD and nucleus detection, and builds a current-schema session.

## 8. Presentation documents and reading progress

The [`Presentation`](../src/types.ts) entity contains title, plain text,
optional version-1 Tiptap JSON, speech language and timestamps.
[`presentationDocument.ts`](../src/lib/presentationDocument.ts) extracts text,
builds documents for older plain-text records, and computes reading chunks
with cumulative text-syllable counts.

The [editor schema](../src/lib/presentationExtensions.ts) supports paragraphs,
bold, italic, headings at levels 2 and 3, lists and hard breaks. Unsupported
elements are not part of that schema. The title limit is 120 characters and
the body limit is 20,000 plain-text characters. The editor rejects changes that
increase an over-limit body rather than truncating it.

Text syllables use language-specific orthographic rules and heuristics in
[`syllables.ts`](../src/engine/syllables.ts). Normalization and number expansion
are separate from acoustic detection. The reading-time estimate in
[`presentation.ts`](../src/lib/presentation.ts) is:

```text
estimated seconds = round(text syllables / (midpoint of target pace * 0.7))
```

The factor reserves 30% of total time for pauses; it is not measured from the
user's delivery. A rehearsal session keeps a plain-text snapshot and optional
`presentationId`, so later edits or deletion of the presentation do not change
the recorded script.

[`RehearsalText`](../src/components/RehearsalText.tsx) maps corrected live
syllables to reading chunks and adjusts the text viewport. Manual scrolling
disables automatic scrolling; reenabling resumes the estimated position.
Calibration does not advance reading progress. There is no word alignment.

## 9. State, persistence and compatibility

### IndexedDB

[`db.ts`](../src/store/db.ts) opens the retained database name `clearvoice`.

| Table | Primary key and indexes | Contents |
| --- | --- | --- |
| `presentations` | `id`; `updatedAt` | Editable scripts and document JSON |
| `sessions` | `id`; `timestamp`, `mode`, `schema`, `presentationId` | Metadata, settings snapshot, metrics, phrases, pauses, tips, tracks, warnings |
| `audio` | `key`; `createdAt` | Blob, MIME type and creation time |
| `baseline` | `id` (`pl` or `en`) | Language-specific calibration result and microphone label |

`session.audioKey` links to audio. `presentationId` is an optional application-level
reference, not a cascading foreign key. Deleting a presentation keeps its
sessions. Deleting sessions removes their associated audio transactionally;
bulk deletion can target all sessions, one presentation or free speaking.
`clearAllData()` clears all four tables.

Database versions are independent of session serialization:

| Version | Database change |
| --- | --- |
| 1 | Original sessions, audio and baseline stores |
| 2 | Acoustic-analysis session indexes, including `schema` |
| 3 | Presentation store and session `presentationId` index |
| 4 | Migration of baseline `current` to language key `pl` |

Current `TrainingSession.schema` is `2`. Sessions preserve raw nucleus times,
refined speech segments and a display waveform, not the complete live PCM and
feature buffers.

`migrateLegacySessions()` preserves record identity and audio keys while
rebuilding analysis. A legacy record without audio is deleted. A failed
reanalysis is logged and leaves the record for a later startup; session lists
filter out noncurrent schemas. Legacy `reading` remains a valid stored mode.

### Preferences and application state

[`settings.ts`](../src/store/settings.ts) persists preferences through Zustand
under `clearvoice_settings_v2`, with persistence version `4` and
`migrateSettings()`. This version is separate from Dexie version 4 and session
schema 2. Existing storage identifiers preserve access to older local data.

Preferences include theme, interface language, microphone ID, pace/breath
targets, alerts, desktop scrolling/wake-lock choices, onboarding state and
per-language calibration parameters. Default syllables per word are 2.3 for
Polish and 1.4 for English, with correction 1 for both.

Baseline records retain calibration metadata; the settings copy supplies
parameters to live and final analysis. Saving calibration updates those two
stores in sequence, not in one cross-storage transaction. Restoring settings
defaults preserves language, calibration, microphone and onboarding state;
clearing IndexedDB is a separate operation.

`useLiveQuery` subscribes views to database changes. Zustand stores application
preferences and transient PWA status; PCM does not pass through React state.
Persistent data is scoped to the site origin and browser profile, without
server synchronization or automatic backup.

## 10. UI and localization integration

[`i18n/index.ts`](../src/i18n/index.ts) combines domain dictionaries into the
`pl` and `en` message trees. `Messages` is derived from the Polish namespaces;
both language exports use that common shape. React components access language
and messages with `useLang()` / `useT()`; plain modules use `getLang()` / `getT()`.
An effect synchronizes the document's `lang` attribute.

Interface language and speech language are distinct. Speech language selects
text rules and calibration; interface language selects labels, formatting and
tips. On fresh settings, a Polish browser selects Polish and other reported
languages select English; without browser language data the fallback is Polish.
Stored presentations and sessions without a language are treated as Polish.

Responsive navigation uses a desktop sidebar or mobile bars. During active
mobile rehearsal, CSS keeps feedback and stop controls visible while the
script viewport scrolls. [`useMobileLayout`](../src/hooks/useMobileLayout.ts)
also accounts for short coarse-pointer landscape layouts.

Automatic script scrolling and screen wake lock are desktop behaviors.
[`useWakeLock`](../src/hooks/useWakeLock.ts) requests a screen lock while enabled,
reacquires it when the page becomes visible and releases it on cleanup.
Unsupported or rejected requests have explicit status; mobile layout disables
the request without overwriting the saved desktop preference.

## 11. Build, deployment and PWA

[`package.json`](../package.json) builds with TypeScript followed by Vite.
[`copy-assets.mjs`](../scripts/copy-assets.mjs), run during npm installation,
copies the Silero v5 model from `@ricky0123/vad-web` and the selected ONNX Runtime
WASM/module files into `public/vendor`. Runtime analysis uses the local model,
not the package's microphone helper.

[`vite.config.ts`](../vite.config.ts) sets a domain-root base and configures
`vite-plugin-pwa` with `injectManifest`. The build injects the precache list
into [`src/sw.ts`](../src/sw.ts); the service worker's behavior remains custom.
The list includes the app shell, offline page, favicon, bundled JS/CSS, icons,
ONNX model and WASM/module assets.

### Cache and update lifecycle

The worker installs and activates a Workbox `PrecacheController` using
`voicecheck-offline`. For GET requests,
[`pwa-worker.ts`](../src/lib/pwa-worker.ts) returns precached assets first;
in-scope navigations receive the cached `index.html`. Other requests use the
network. Failed navigations can fall back to `offline.html`; non-navigation
network errors propagate.

`GET_OFFLINE_STATUS` uses a message channel to check that every precache entry
exists. `offlineReady` is distinct from network connectivity: full offline use
requires a prior successful online visit and completed caching.

[`pwa.ts`](../src/lib/pwa.ts) registers the worker only in production and tracks
installation, connectivity, cache readiness, waiting updates and errors in
Zustand. Registration and activation waits have ten-second timeouts. PWA setup
errors are logged and exposed in the UI without preventing React mounting.

The worker does not call `skipWaiting()` during installation. A confirmed update
sends `SKIP_WAITING`, waits for the selected worker to control the page, then
reloads that window. Other windows are not explicitly reloaded. Worker updates
do not clear IndexedDB or preferences.

### Isolation and hosting

Development and preview servers set COOP `same-origin` and COEP `require-corp`.
Service-worker responses add those headers plus CORP `cross-origin` where the
response can be wrapped. The single-threaded VAD configuration and isolation
bootstrap are separate parts of the current implementation.

On a first uncontrolled, nonisolated production visit, initialization can wait
for activation and reload once before React mounts. A sessionStorage marker
guards that retry; it is not a recording-time reload mechanism.

Hosting requires HTTPS or localhost for microphone/service-worker APIs,
real static files for worker/model/runtime assets, and an SPA fallback for
application routes. [`vercel.json`](../vercel.json) supplies the SPA rewrite.
Current paths and PWA scope assume deployment at the domain root.

## 12. Constraints and verification boundaries

Pace, word counts derived from audio, breathing and reading progress are
estimates. Noise, reverberation, voice characteristics and microphone processing
affect them. Neither calibration nor a report proves which words were spoken.
Browser support governs recording formats, installation, vibration and wake lock.

PCM, encoded chunks and several tracks accumulate for the active recording.
Finalization assembles PCM and decodes the playback Blob; legacy migration also
decodes complete recordings. Memory use therefore grows with recording length,
and signal-feature work competes with UI work on the main thread.

Existing tests cover analysis/text rules, audio helpers, session and persistence
operations, components/pages, localization and PWA logic. Browser-oriented tests
use simulated environments; they do not establish microphone, device or offline
compatibility across real browsers.
