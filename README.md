# CzystaMowa

Trener dykcji i tempa mówienia po polsku. Działa w całości w przeglądarce: nagrania, modele AI i historia sesji
nie opuszczają komputera (wyjątek: opcjonalne napisy na żywo w Chrome, patrz niżej).

Specyfikacja techniczna: [`specyfikacja_techniczna_clearvoice_ai.md`](specyfikacja_techniczna_clearvoice_ai.md).

## Funkcje

- **Live HUD** podczas nagrania: prędkościomierz tempa (sylaby/s i słowa/min), pasek oddechu, przebieg fali,
  ostrzeżenia o szumie (SNR) i przesterowaniu.
  W trybie czytania kolorowa ramka tekstu i przypięty nad nim status tempa pozwalają śledzić tempo bez odrywania wzroku od treści, także podczas jej przewijania.
- **Raport sesji**: wynik 0–100 (tempo, artykulacja, płynność, intonacja), transkrypcja z kolorowymi oznaczeniami
  (za szybko / niewyraźnie / pominięte / wypełniacze), odsłuch każdego słowa, szczegóły głosek (GOP),
  oś czasu z pauzami, F0 i głośnością, „Top 3 do poprawy” z ćwiczeniami, „Powtórz to zdanie” z porównaniem przed/po.
- **Tryby treningu**: czytanie własnego tekstu, Pacer Karaoke (15 gotowych tekstów dostępnych w obu trybach), Laboratorium dykcji (50 łamańców + pary minimalne),
  opowiadanie historii (swobodna wypowiedź bez bota i syntezatora mowy), kalibracja profilu użytkownika.
  W opowiadaniu historii pauzy nie przerywają nagrania — kończy je przycisk „Skończyłem”, po czym otwiera się raport.
- **Pulpit**: trendy wyników i tempa, wyrazistość grup głosek, historia sesji.
- **Motyw**: domyślnie zgodny z systemem; przełącznik słońce/księżyc w nagłówku i Ustawieniach pozwala wybrać jasny lub ciemny i zapamiętuje wybór lokalnie.

## Architektura

| Warstwa | Technologia |
|---|---|
| UI | Vite, React 19, TypeScript, Tailwind v4 (komponenty w stylu shadcn/ui), react-router (BrowserRouter) |
| Stan / dane | Zustand (ustawienia w `localStorage`), Dexie / IndexedDB (sesje i nagrania) |
| Audio | `getUserMedia` + AudioWorklet (16 kHz), Silero VAD (onnxruntime-web), MediaRecorder |
| Modele | Transformers.js v3 w Web Workerze: Whisper (transkrypcja) + wav2vec2-PL CTC (wyrównanie i GOP) |
| Silnik oceny | `src/engine/` – czysty TypeScript, bez zależności od przeglądarki (testy w `vitest`, skrypty w Node) |

Warianty modeli (wybierane automatycznie wg urządzenia, zmiana w Ustawieniach):

- **Lite** – Whisper base, bez oceny głosek,
- **Standard** – Whisper small + wav2vec2 int8,
- **Pro** – Whisper large-v3-turbo + wav2vec2 (WebGPU).

Modele są pobierane z Hugging Face za zgodą użytkownika i zapisywane w cache przeglądarki. Sesje nagrane przed
pobraniem modeli są analizowane automatycznie, gdy modele będą gotowe.

## Uruchomienie

Wymagany Node.js 20+.

```bash
npm install          # kopiuje też pliki WASM onnxruntime i VAD do public/vendor
npm run dev          # http://localhost:5173
npm test             # testy jednostkowe silnika
npm run build        # statyczna wersja w dist/
npm run preview
```

Aplikacja wymaga **cross-origin isolation** (SharedArrayBuffer dla wielowątkowego WASM). Serwer deweloperski
i `preview` ustawiają nagłówki COOP/COEP; na hostingu statycznym (np. GitHub Pages) trzeba je skonfigurować
lub użyć `coi-serviceworker`. Mikrofon działa tylko przez HTTPS lub na `localhost`.

Zalecana przeglądarka: Chrome / Edge (WebGPU dla wariantu Pro). Firefox i Safari działają z wariantami Lite/Standard na WASM.

Aplikacja używa adresów bez `#` (np. `/reading`, `/session/<id>`) i jest serwowana z głównego katalogu domeny.
Zakładka „Opowiadanie historii” ma adres `/storytelling`.
Na hostingu należy skonfigurować fallback SPA: żądania podstron, które nie wskazują istniejących plików,
muszą zwracać `index.html`, aby bezpośrednie linki i odświeżanie działały poprawnie.
Vite (`dev` i `preview`) obsługuje to automatycznie; sam GitHub Pages nie zapewnia takiego fallbacku.

## Prywatność

- Analiza mowy odbywa się lokalnie (Web Worker + WASM/WebGPU).
- **Napisy na żywo** (domyślnie wyłączone) używają Web Speech API – w Chrome dźwięk jest wtedy przesyłany do
  serwerów Google. Napisy nie mają wpływu na ocenę.
- Dane można usunąć w Ustawieniach → Dane.

## Debug i strojenie progów

- Dodaj `?debug=1` do adresu raportu (np. `/session/<id>?debug=1`), aby zobaczyć surowe dane, wyeksportować sesję
  (JSON) oraz **wejście silnika** dla korpusu (przycisk „Korpus”).
- `scripts/evaluate-corpus.ts` – ewaluacja na korpusie z adnotacjami (precyzja/czułość flag, błąd tempa, F1 pauz)
  i przeszukiwanie progów z `src/engine/thresholds.ts`:

  ```bash
  npm run evaluate-corpus -- --make-example corpus-example   # przykładowa para plików
  npm run evaluate-corpus -- corpus-example
  npm run evaluate-corpus -- corpus --sweep tauAbs=0.5:2:0.25
  ```

  Format adnotacji (`<nazwa>.labels.json`) jest opisany w nagłówku skryptu.
- `scripts/export_ctc_onnx.py` – jednorazowy eksport modelu wav2vec2-PL do ONNX z kwantyzacją int8
  (domyślnie używany jest gotowy eksport `XDcobra/wav2vec2-large-xlsr-53-polish-ONNX`).

## Struktura

```text
scripts/            eksport modelu CTC, ewaluacja korpusu, kopiowanie zasobów WASM
src/audio/          przechwytywanie mikrofonu, worklet, VAD, analiza na żywo, dekodowanie
src/engine/         silnik oceny: normalizacja, sylaby, jednostki, CTC/Viterbi, GOP, tempo, pauzy, prozodia, wynik
src/workers/        Web Worker z modelami (Whisper, wav2vec2) i klient
src/lib/            potok analizy sesji, TTS, motyw, etykiety
src/pages/          ekrany: pulpit, tryby treningu, raport, kalibracja, ustawienia
src/components/     HUD, raport, komponenty UI
src/data/           łamańce, pary minimalne, tekst kalibracyjny, scenariusze bota (treści autorskie)
```

Wszystkie teksty ćwiczeń są autorskie, przygotowane dla CzystaMowa.
