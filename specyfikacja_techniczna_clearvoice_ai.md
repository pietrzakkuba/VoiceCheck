# Specyfikacja Techniczna Aplikacji: Trener Dykcji i Tempa Mowy ("ClearVoice AI") — v2

## 0. Najważniejsze zmiany względem v1
*   **Ocena dykcji:** zamiast porównywania dwóch modeli ASR (Chrome vs Whisper), które mierzyło głównie różnice między samymi modelami, wprowadzono **wymuszone wyrównanie akustyczne (CTC forced alignment) i miarę GOP (*Goodness of Pronunciation*)** na poziomie pojedynczych głosek.
*   **Tempo:** podstawową metryką są **sylaby/s** (tempo artykulacji i tempo mowy), a nie WPM przeniesione z norm angielskich. Tempo na żywo liczone jest akustycznie, bez ASR.
*   **Pauzy i VAD:** prosty próg dBFS zastąpiono modelem **Silero VAD**; czasy słów pochodzą z wyrównania CTC (±20–40 ms), a nie ze znaczników czasu Whispera.
*   **Wypełniacze („yyy”, „eee”):** wykrywane akustycznie (Whisper i Chrome je pomijają).
*   **Raport „co poprawić”:** każda flaga ma znacznik czasu, poziom pewności i odsłuch fragmentu nagrania; dodano „Top 3 do poprawy” i tryb „Powtórz to zdanie”.
*   **Kalibracja:** indywidualny profil bazowy użytkownika oraz plan walidacji progów na nagranym korpusie.
*   **Stack:** Vite + React (statyczna SPA) zamiast Next.js; sesje i nagrania w IndexedDB zamiast `localStorage`; Web Speech API tylko jako opcjonalne napisy na żywo.

---

## 1. Cel Projektu i Założenia

Aplikacja webowa do treningu wyraźnego, spokojnego mówienia po polsku. **Priorytetem jest jakość diagnozy:** aplikacja ma precyzyjnie wskazać *co* jest nie tak, *gdzie* (słowo, głoska, fraza, znacznik czasu) i *jak to poprawić*. Liczba funkcji jest drugorzędna.

*   **Zero własnego backendu:** aplikacja to statyczna SPA. Uruchomienie POC: `npm install && npm run dev`. Wdrożenie: dowolny hosting statyczny (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
*   **Brak kont i własnej bazy danych:** ustawienia w `localStorage`, sesje, nagrania i profil bazowy w `IndexedDB`.
*   **Brak płatnych API.** Dopuszczalne jest korzystanie z darmowych usług chmurowych wbudowanych w przeglądarkę (Web Speech API → serwery Google/Microsoft) oraz pobieranie modeli z CDN Hugging Face.
*   **Platforma docelowa POC:** desktopowy Chrome/Edge (WebGPU). Pozostałe przeglądarki działają w trybie ograniczonym (patrz sekcja 12).
*   **Zasada wiarygodności:** lepiej nie oznaczyć błędu niż oznaczyć poprawne słowo. Czerwone flagi tylko przy wysokiej pewności, niepewne przypadki jako bursztynowe „do sprawdzenia”. Każda flaga musi dać się odsłuchać.

## 2. Stos Technologiczny (Tech Stack)

*   **Framework:** Vite + React + TypeScript (SPA, `react-router`). Brak SSR = brak problemów z `'use client'`/`dynamic()` dla API przeglądarki.
*   **UI:** Tailwind CSS + `shadcn/ui` + `lucide-react`; wykresy: `recharts`.
*   **Motywy:** Light/Dark/System (ThemeProvider wg przewodnika shadcn dla Vite, zmienne CSS w `index.css`).
*   **Stan i pamięć:**
    *   Zustand + `persist` → `localStorage` (tylko ustawienia).
    *   `Dexie` (IndexedDB) → sesje, nagrania audio (Opus), profil bazowy użytkownika.
    *   Cache API (automatycznie przez Transformers.js) → wagi modeli; `navigator.storage.persist()` przy pierwszym pobraniu.
*   **Audio:**
    *   `Web Audio API` – wyłącznie `AudioWorklet` (bez przestarzałego `ScriptProcessorNode`) + `AnalyserNode` do wizualizacji.
    *   `@ricky0123/vad-web` – Silero VAD v5 (ONNX, ~2 MB), ramki 32 ms.
    *   `MediaRecorder` (Opus) – nagranie do odsłuchu w raporcie.
*   **AI (w dedykowanym Web Workerze):** `@huggingface/transformers` (v3, WebGPU z fallbackiem WASM):
    1.  **Whisper** – transkrypcja (tylko tekst, bez znaczników czasu).
    2.  **wav2vec2-XLSR (CTC, polski)** – posteriory znaków co 20 ms → wyrównanie wymuszone, GOP, precyzyjne czasy słów.
*   **Opcjonalnie:** `Web Speech API` (`SpeechRecognition`) – napisy na żywo (nie wpływają na ocenę); `SpeechSynthesis` – głos bota.
*   **Testy:** `vitest` dla czystych funkcji silnika oceny.
*   **Nagłówki:** wielowątkowy WASM wymaga `SharedArrayBuffer` → nagłówki COOP/COEP (`server.headers` w `vite.config.ts`; na hostingu bez kontroli nagłówków – `coi-serviceworker`). Przy WebGPU nie jest to krytyczne.

---

## 3. Architektura Przetwarzania

```text
getUserMedia({ audio: { channelCount: 1, echoCancellation: true,
                        noiseSuppression: false, autoGainControl: false } })
   │
   ├─► AudioWorklet "capture" (AudioContext 16 kHz*)
   │       ├─ pełny bufor PCM 16 kHz bieżącej odpowiedzi (Float32Array)
   │       └─ cechy co 10 ms: intensywność dB, dźwięczność (autokorelacja) → HUD
   ├─► Silero VAD (vad-web, ten sam MediaStream) → p(mowa) co 32 ms → oś mowa/pauza
   ├─► MediaRecorder (Opus) → nagranie do odsłuchu (IndexedDB)
   └─► [opcjonalnie] SpeechRecognition (własny dostęp do mikrofonu) → napisy na żywo

Fragment gotowy (pauza ≥ 700 ms po ≥ 1500 ms mowy LUB 25 s)
   └─► analysis.worker: Whisper → normalizacja → CTC posteriory → forced alignment
                        → GOP, czasy słów, F0 → wynik cząstkowy
Koniec odpowiedzi
   └─► agregacja: metryki, flagi, wynik 0–100, Top 3 do poprawy, raport
```
\* Chrome/Edge automatycznie resamplują mikrofon do `AudioContext({ sampleRate: 16000 })`. Fallback (Firefox): kontekst w natywnej częstotliwości + resampling fragmentów przez `OfflineAudioContext`.

Fragmenty analizowane są **przyrostowo w trakcie mówienia** (kolejka w workerze), aby raport był gotowy kilka sekund po zakończeniu odpowiedzi.

---

## 4. Warstwa na Żywo (Live HUD)

### 4.1 Kalibracja szumu
*   Przed sesją jawny komunikat „Zachowaj ciszę (2 s)” → $\text{NoiseFloor}$ = mediana dBFS.
*   W trakcie sesji aktualizacja adaptacyjna: 10. percentyl intensywności ramek oznaczonych przez VAD jako cisza.
*   $\text{SNR} = \text{mediana dBFS mowy} - \text{NoiseFloor}$. Przy $\text{SNR} < 12\text{ dB}$ komunikat „Za cicho / za głośne tło” i oznaczenie wyników GOP jako niewiarygodnych.
*   O mowie/pauzie decyduje **Silero VAD** z histerezą: start mowy przy $p > 0.5$, koniec przy $p < 0.35$. Energia służy tylko do wizualizacji i detekcji sylab.

### 4.2 Detektor braku przerw oddechowych
*   **IPU** (*inter-pausal unit*) = ciągły odcinek mowy. Pauza oddechowa = cisza VAD ≥ **350 ms** (krótsze to okluzje spółgłosek / mikropauzy).
*   Jeden parametr `maxContinuousSpeechSeconds` (domyślnie **8 s**):
    *   ≥ 75% limitu (6 s) → stan ostrzegawczy (bursztynowa ramka, *„Zbliżasz się do limitu tchu – zaplanuj kropkę”*).
    *   ≥ 100% limitu → stan krytyczny (czerwona pulsacja, *„Zatrzymaj się i weź oddech!”*), flaga `NO_BREATH`.

### 4.3 Tempo na żywo – akustyczna detekcja sylab
Adaptacja metody de Jonga i Wempe (jądra sylab = szczyty intensywności w dźwięcznych fragmentach), liczona w workletcie:
*   Obwiednia intensywności: okno 50 ms, krok 10 ms, wygładzanie.
*   Szczyt = jądro sylaby, jeśli: wystaje ≥ **2 dB** ponad poprzednie minimum, leży ≥ **10 dB** powyżej NoiseFloor, ramka jest dźwięczna (znormalizowana autokorelacja > 0.45 w zakresie F0 75–400 Hz), odstęp od poprzedniego szczytu ≥ 100 ms.
*   **Tempo artykulacji na żywo:**
    $$\text{AR}_{\text{live}} = \frac{\text{liczba jąder sylab w oknie 10 s}}{\text{czas mowy (VAD) w oknie}}$$
    Wskaźnik aktywny dopiero przy ≥ 3 s mowy w oknie.
*   Prędkościomierz w **sylabach/s** (strefy domyślne: < 3.5 niebieska „bardzo wolno”, 4.0–5.5 zielona, 5.5–6.5 bursztynowa, > 6.5 czerwona). Pomocniczo „≈ WPM” = $\text{AR} \times 60 / k$, gdzie $k$ = średnia liczba sylab na słowo użytkownika z poprzednich sesji (domyślnie 2.3).
*   Korekta: po każdej sesji liczony jest stosunek sylab z wyrównania (5.8) do jąder wykrytych na żywo i zapisywany jako współczynnik korekcji dla detektora live.

### 4.4 Napisy na żywo (opcjonalne)
`SpeechRecognition` (`lang = 'pl-PL'`, `continuous`, `interimResults`) wyłącznie do wyświetlania tekstu. Automatyczny restart po zdarzeniu `end`. Brak wsparcia = ukrycie panelu, bez wpływu na ocenę.

---

## 5. Analiza po Wypowiedzi (Core Engine, Web Worker)

### 5.1 Segmentacja
*   Fragment do analizy: pauza VAD ≥ 700 ms po ≥ 1500 ms mowy albo limit **25 s** (Whisper ma okno 30 s). Cięcie zawsze w ciszy; fragment z marginesem 200 ms.
*   Fragmenty z < 300 ms mowy są pomijane (ochrona przed halucynacjami).

### 5.2 Transkrypcja (Whisper)
*   Parametry: `{ language: 'polish', task: 'transcribe' }`. Znaczniki czasu słów **nie są potrzebne** – dostarcza je wyrównanie CTC.
*   Poziomy modeli (wybór automatyczny na podstawie `navigator.gpu` i `navigator.deviceMemory`, z możliwością zmiany w ustawieniach):

| Poziom | Whisper | Model CTC | Łączny rozmiar (ok.) | Urządzenie |
|---|---|---|---|---|
| Lite | `onnx-community/whisper-base` | brak (bez GOP) | ~80 MB | WASM |
| Standard (domyślny) | `onnx-community/whisper-small` | wav2vec2-XLSR PL (q8) | ~550 MB | WebGPU / WASM |
| Pro | `onnx-community/whisper-large-v3-turbo` | wav2vec2-XLSR PL (fp16) | ~1.3 GB | WebGPU |

*   **Filtry halucynacji:** odrzucanie wyniku przy pętli powtórzeń (ten sam n-gram ≥ 3×), przy znanych halucynacjach dla polskiego (np. *„Napisy stworzone przez społeczność Amara.org”*, *„Dziękuję za uwagę”* przy ciszy) oraz gdy tekst ma > 2× więcej sylab niż wykrytych jąder sylab.
*   **Tryby czytania (tekst wzorcowy znany):** Whisper służy do wykrycia pominiętych/wstawionych/zamienionych słów (dopasowanie słów tekstu wzorcowego i transkrypcji metodą Levenshteina na poziomie słów) → flagi `SKIPPED_WORD`, `INSERTED_WORD`, `WRONG_WORD`. Do wyrównania akustycznego używany jest tekst wzorcowy skorygowany o te różnice.

### 5.3 Normalizacja tekstu
*   Małe litery, usunięcie interpunkcji z zachowaniem granic zdań (`. ? ! …`) i przecinków (potrzebne w 5.9).
*   Liczby → słowa (`numbersPl.ts`). Gdy forma gramatyczna niejednoznaczna, słowo oznaczane jako `unscorable`.
*   Słowa ze znakami spoza słownika modelu CTC (np. `q`, `v`, `x`, wyrazy obce) → `unscorable` (brane do tempa, nie do GOP).

### 5.4 Model akustyczny CTC
*   Model bazowy: `jonatasgrosman/wav2vec2-large-xlsr-53-polish` (CTC na znakach polskich), jednorazowo wyeksportowany do ONNX (`optimum-cli export onnx` + kwantyzacja dynamiczna q8) i opublikowany we własnym repozytorium HF (skrypt `scripts/export_ctc_onnx.py`). **Przed eksportem sprawdzić**, czy gotowa wersja ONNX nie istnieje już na HF.
*   Wyjście: macierz log-prawdopodobieństw $T \times V$ (ramka 20 ms; słownik: litery polskie, separator słów `|`, `blank`).
*   Fragmenty > 20 s przetwarzane w kawałkach z zakładką 1 s (ograniczenie pamięci).
*   Opcja na później: model fonemowy (`facebook/wav2vec2-xlsr-53-espeak-cv-ft`) + G2P (`phonemizer`/espeak-ng WASM) dla informacji zwrotnej w IPA.

### 5.5 Wyrównanie wymuszone (Forced Alignment)
*   Algorytm Viterbiego dla CTC (odpowiednik `torchaudio.functional.forced_align`), złożoność $O(T \cdot S)$, czysta funkcja TS w `ctcAlign.ts`.
*   Sekwencja docelowa: znaki słów rozdzielone `|`. Między słowami dozwolony dowolnie długi odcinek `blank` – pochłania pauzy, wypełniacze i szumy.
*   Wynik: początek/koniec każdego znaku i słowa (dokładność słów ±20–40 ms).
*   **Kontrola jakości wyrównania:** średnie log-prawdopodobieństwo ścieżki na ramkę dla słowa. Słowo poniżej progu `alignMinScore` = prawdopodobny błąd transkrypcji → `unscorable` (zamiast fałszywej flagi „niewyraźne”).

### 5.6 Jednostki głoskowe (polska ortografia)
*   Podział słowa na jednostki: dwuznaki `ch, cz, dz, dź, dż, rz, sz`; zmiękczenia przez `i` przed samogłoską (`si, ci, zi, ni, dzi` → ś, ć, ź, ń, dź; `i` nie tworzy wtedy osobnej sylaby); pozostałe litery pojedynczo.
*   Kategorie: **szumiące** (sz, ż/rz, cz, dż), **syczące** (s, z, c, dz), **ciszące** (ś, ź, ć, dź, ń), **nosowe** (ą, ę), **sonorne** (l, ł, r, m, n, j), **samogłoski**, **pozostałe spółgłoski**.
*   **Klasy równoważności (homofony, nie karać):** `rz ≡ ż`, `ch ≡ h`, `ó ≡ u`.
*   **Wyjątki ortoepiczne (poprawna wymowa, nie karać):** `ę` na końcu wyrazu ≡ `e` (*idę* → [ide]); `ą`/`ę` przed `l`/`ł` ≡ `o`/`e` (*wziął*, *wzięli*); ubezdźwięcznienie na końcu wyrazu (*chleb* → [chlep]) – sprawdzane przez obniżony próg zamiast wymuszania dźwięczności.

### 5.7 Ocena artykulacji – GOP
Wyjście CTC jest „szpilkowe” (znak zajmuje często 1–2 ramki otoczone `blank`), dlatego GOP liczony jest na szczycie posteriora w segmencie znaku (±1 ramka):

$$P_{\text{target}} = \max_{f \in F} p(\text{target} \mid f), \qquad P_{\text{comp}} = \max_{q \notin \text{Eq}(\text{target}) \cup \{\text{blank}\}} \; \max_{f \in F} p(q \mid f)$$
$$\text{GOP} = \log P_{\text{target}} - \log \max(P_{\text{comp}}, \varepsilon)$$

Statusy znaku/jednostki (status jednostki = najgorszy status jej znaków):
*   `deleted` – brak ramki z $p(\text{target}) > 0.05$ (ścieżka przeszła przez `blank`) → *„pominięta głoska”*.
*   `substituted` – $\text{GOP} < 0$ i konkurent $q$ należy do par dykcyjnych (s/ś/sz, z/ź/ż, c/ć/cz, dz/dź/dż, ł/l, ą/o/om, ę/e/em, r/l, n/ń) → *„usłyszano [q] zamiast [target]”*.
*   `weak` – $\text{GOP} < \tau_{\text{cat}}$ (próg kategorii, patrz 5.11) → *„niewyraźna głoska”*.
*   `ok` w pozostałych przypadkach.

Flagi słowa (słowa ≥ 3 jednostek, nie `unscorable`):
*   `MUMBLED_WORD` – ≥ 2 jednostki `weak/deleted/substituted` lub ≥ 30% jednostek.
*   `SWALLOWED_WORD_ENDING` – słowo ≥ 4 znaków, jedna z dwóch ostatnich jednostek `deleted/weak` (z uwzględnieniem wyjątków z 5.6). Typowe: *-łem, -ą, -ść, -ch*.
*   `SUBSTITUTED_SOUND` – pojedyncza zamiana w parze dykcyjnej (np. sz→s).

### 5.8 Tempo (po wypowiedzi)
*   **Sylaby z tekstu:** liczba samogłosek `a, ą, e, ę, i, o, ó, u, y`, z regułą `i` przed samogłoską (nie tworzy sylaby) oraz `au`/`eu` w zapożyczeniach jako jedna sylaba.
*   Czasy z wyrównania CTC (5.5), pauzy z VAD (≥ 250 ms).
*   **Tempo mowy:** $\text{SR} = \frac{\text{sylaby}}{\text{koniec ostatniego słowa} - \text{początek pierwszego}}$ (z pauzami).
*   **Tempo artykulacji:** $\text{AR} = \frac{\text{sylaby}}{\sum \text{czas IPU}}$ (bez pauz). Liczone globalnie i dla każdej IPU.
*   WPM liczony dokładnie z transkrypcji – informacyjnie.
*   Flagi:
    *   `RUSHED_PHRASE` – IPU z ≥ 5 sylabami i $\text{AR}_{\text{IPU}} > \max(6.5,\ 1.25 \cdot \text{AR}_{\text{baseline}})$.
    *   `RUSHED_WORD` (bursztynowa) – słowo z ≥ 3 sylabami i > 8 sylab/s.
    *   `ACCELERATING_PHRASE` – IPU ≥ 3 s, w której AR drugiej połowy > 1.3 × AR pierwszej → *„przyspieszasz pod koniec frazy”*.

### 5.9 Pauzy i płynność
*   Klasyfikacja pauz (VAD): < 250 ms pomijane; 250–1000 ms normalne; > 1000 ms długie; > 2000 ms poza granicą zdania → `HESITATION_PAUSE`.
*   `NO_BREATH` – IPU dłuższa niż `maxContinuousSpeechSeconds`.
*   **Tryby czytania** (interpunkcja tekstu wzorcowego):
    *   `MISSING_PAUSE` – brak pauzy ≥ 400 ms po końcu zdania (czerwona) lub ≥ 150 ms po przecinku (bursztynowa).
    *   `UNEXPECTED_PAUSE` (bursztynowa) – pauza > 500 ms wewnątrz frazy bez interpunkcji.
*   **Tryb swobodny:** granice zdań z interpunkcji Whispera – te same reguły, ale tylko jako bursztynowe.
*   **Wypełniacze dźwiękowe** `FILLER_SOUND` („yyy”, „eee”, „mmm”): odcinek mowy (VAD) niepokryty żadnym słowem w wyrównaniu, ≥ 200 ms, dźwięczny w ≥ 80% ramek, odchylenie F0 < 1.5 półtonu, niska zmienność widma (średnia |ΔMFCC| poniżej progu). Dodatkowo, jeśli Whisper zwróci token „yyy/eee/mmm/hmm” – flaga bezpośrednio.
*   `PROLONGATION` (bursztynowa) – przeciągnięta końcówka słowa przed pauzą („żeeee”): stabilny dźwięczny odcinek > 250 ms po ostatnim wyrównanym znaku słowa.
*   **Wypełniacze leksykalne** `FILLER_WORD`: *„no”* (tylko na początku IPU lub przed pauzą), *„jakby”, „generalnie”, „w sumie”, „tak naprawdę”, „po prostu”, „wiesz”, „znaczy”*. Liczone na minutę; flagowane, gdy dane wyrażenie występuje > 2/min.
*   `REPETITION` (bursztynowa) – powtórzone słowo/początek frazy („to to”, „i i”, restart zdania).

### 5.10 Prozodia i energia
*   F0: algorytm YIN (okno 40 ms, krok 10 ms) w workerze; wartości w półtonach względem mediany użytkownika.
*   Intensywność sylab = szczyt obwiedni w jądrze sylaby (sylaby z wyrównania + jądra z 4.3).
*   `SWALLOWED_SENTENCE_ENDING` – dla zdania ≥ 6 sylab: średnia intensywność 2 ostatnich sylab vs mediana intensywności sylab zdania. Spadek > **10 dB** i (ostatnie słowo z flagą z 5.7 lub spadek > 14 dB) → czerwona; spadek 8–10 dB → bursztynowa. Naturalne obniżenie na końcu zdania oznajmującego mieści się poniżej tych progów; wartości do kalibracji (sekcja 9).
*   `MONOTONE` (bursztynowa) – rozpiętość F0 (p10–p90) w odpowiedzi < 3 półtony.
*   `VOLUME_DECLINE` – trend intensywności sylab w odpowiedzi < −6 dB/min (*„cichniesz z czasem”*).
*   `LOW_SNR` – patrz 4.1.

### 5.11 Profil bazowy użytkownika (kalibracja)
*   Onboarding (~60 s): czytanie zrównoważonego fonetycznie tekstu (`calibrationText.ts`) spokojnie i starannie, z pacerem ustawionym na 4.5 sylaby/s.
*   Zapis: rozkład GOP dla każdej kategorii jednostek (średnia, odchylenie), $\text{AR}_{\text{baseline}}$, mediana intensywności, mediana i rozpiętość F0, etykieta mikrofonu.
*   Próg słabej głoski: $\tau_{\text{cat}} = \max(\mu_{\text{cat}} - 2\sigma_{\text{cat}},\ \tau_{\text{abs}})$, gdzie $\tau_{\text{abs}}$ to globalny próg z kalibracji korpusu (sekcja 9). Bez profilu używany jest tylko $\tau_{\text{abs}}$.
*   Zmiana mikrofonu (`devicechange` / inna etykieta) → propozycja ponownej kalibracji.

### 5.12 Poziomy pewności flag
*   `high` (może być czerwona): SNR ≥ 15 dB, poprawna jakość wyrównania słowa, tryb czytania **albo** tryb swobodny z bardzo niskim GOP ($< \tau_{\text{cat}} - 2$).
*   `medium` (tylko bursztynowa): pozostałe przypadki, w tym wszystkie flagi zależne od interpunkcji Whispera.
*   Przy SNR < 12 dB flagi GOP nie są pokazywane (komunikat o jakości nagrania).

---

## 6. Wynik Wypowiedzi (Clarity & Pacing Score: 0–100)

Wszystkie składowe są obcinane do zakresu 0–100 i liczone **względnie** (na minutę / jako odsetek), żeby długość wypowiedzi nie wpływała na wynik. Wagi i progi są parametrami (`scoreWeights` w ustawieniach) i wymagają kalibracji (sekcja 9).

$$\text{Total} = 0.25 \cdot S_{\text{tempo}} + 0.35 \cdot S_{\text{artykulacja}} + 0.25 \cdot S_{\text{płynność}} + 0.15 \cdot S_{\text{prozodia}}$$

*   $S_{\text{tempo}}$:
    *   Bazowo 100, gdy $\text{AR} \in [\text{AR}_{\min}, \text{AR}_{\max}]$ (domyślnie **4.5–5.5 sylaby/s**); liniowo do 0 przy $\text{AR}_{\max} + 2.0$ oraz przy $\text{AR}_{\min} - 2.0$.
    *   Minus $30 \times$ (odsetek IPU z `RUSHED_PHRASE` lub `ACCELERATING_PHRASE`).
    *   Tryb Pacer: $100 - 0.1 \times$ średnie bezwzględne odchylenie od wskaźnika [ms].
*   $S_{\text{artykulacja}}$:
    *   $100 \cdot (1 - 2 \cdot r_w)$, gdzie $r_w$ = ważony odsetek ocenianych słów z flagami `MUMBLED_WORD`, `SWALLOWED_WORD_ENDING`, `SUBSTITUTED_SOUND`, `SKIPPED_WORD` (waga 1 dla `high`, 0.5 dla `medium`).
    *   Laboratorium dykcji: $100 \times$ odsetek jednostek `ok` w ćwiczonej kategorii.
*   $S_{\text{płynność}} = 100 - \min(40,\ 8 \cdot \text{wypełniacze/min}) - \min(30,\ 30 \cdot r_{\text{NO\_BREATH}}) - \min(30,\ 30 \cdot r_{\text{MISSING\_PAUSE}}) - \min(20,\ 5 \cdot \text{wahania/min}) - \min(10,\ 3 \cdot \text{powtórzenia/min})$
    *   $r_{\text{NO\_BREATH}}$ – odsetek IPU przekraczających limit; $r_{\text{MISSING\_PAUSE}}$ – odsetek granic zdań bez pauzy.
*   $S_{\text{prozodia}} = 0.5 \cdot S_{\text{końcówki}} + 0.3 \cdot S_{\text{intonacja}} + 0.2 \cdot S_{\text{głośność}}$
    *   $S_{\text{końcówki}} = 100 \cdot (1 - 1.5 \cdot r_{\text{SWALLOWED\_SENTENCE\_ENDING}})$
    *   $S_{\text{intonacja}} = 100 \cdot \text{clamp}\left(\frac{\text{rozpiętość F0 [st]} - 1}{4}, 0, 1\right)$
    *   $S_{\text{głośność}} = 100 - 50 \cdot [\text{VOLUME\_DECLINE}] - 50 \cdot [\text{LOW\_SNR}]$

---

## 7. Raport i Wskazywanie Miejsc do Poprawy

1.  **Transkrypcja z adnotacjami:** kolorowanie słów (zielony / bursztynowy / czerwony + różne style podkreślenia, nie tylko kolor). Kliknięcie słowa → odtworzenie fragmentu nagrania (słowo ±300 ms) i panel szczegółów, np. *„[ś] niewyraźne – usłyszano bliżej [s]”*, *„końcówka -łem pominięta”*, *„3 sylaby w 0.28 s – za szybko”*.
2.  **Oś czasu:** przebieg fali, bloki IPU, pauzy (z oznaczeniem brakujących/nieoczekiwanych), krzywa F0 i intensywności, znaczniki flag – wszystko klikalne z odsłuchem.
3.  **„Top 3 do poprawy”:** problemy uszeregowane według liczby utraconych punktów. Każdy zawiera: *co* (np. „połykasz końcówki wyrazów”), *gdzie* (1–3 najbardziej typowe przykłady z odsłuchem), *dlaczego to ważne* i *ćwiczenie* (link do kategorii w Laboratorium dykcji lub do Pacera z dobranym tempem).
4.  **„Powtórz to zdanie”:** dowolne oflagowane zdanie można nagrać ponownie w trybie czytania (transkrypcja = tekst wzorcowy) → porównanie przed/po z odsłuchem obu wersji.
5.  **Postępy:** trend każdej składowej oraz GOP per kategoria głosek (np. „szereg ciszący: +12% w 2 tygodnie”).
6.  **Ponowna analiza:** nagrania są przechowywane, więc po pobraniu lepszego modelu lub nowej kalibracji można przeliczyć stare sesje.

---

## 8. Moduły Funkcjonalne i Tryby Treningowe

1.  **Kalibracja (onboarding)** – patrz 5.11; dostępna też z ustawień.
2.  **Rozmowa z Botem (AI Interview / Small Talk Coach)**
    *   Scenariusze: rozmowa kwalifikacyjna, prezentacja projektu, opowiadanie historii, debata; regułowy silnik pytań uzupełniających na podstawie słów kluczowych z transkrypcji.
    *   Pytania czytane przez `speechSynthesis` (polski głos systemowy, tempo 0.95). **W czasie mówienia bota analiza mikrofonu i napisy na żywo są wstrzymane.** Zalecane słuchawki.
    *   Bot pyta → użytkownik odpowiada 30–60 s (koniec: przycisk „Skończyłem” lub cisza ≥ 3 s) → Live HUD → raport odpowiedzi → kolejne pytanie.
3.  **Pacer Karaoke (trening tempa czytania)**
    *   Docelowe tempo ustawiane w **sylabach/s** (WPM pokazywane jako przeliczenie dla danego tekstu).
    *   Czas podświetlenia słowa **proporcjonalny do liczby jego sylab**; zatrzymanie 600 ms na przecinku i 1200 ms na kropce (pasek „Weź oddech”).
    *   Ocena: porównanie czasów słów z wyrównania z harmonogramem pacera → flagi `AHEAD_OF_PACER` / `BEHIND_PACER` (odchylenie > 500 ms), zgodność pauz z interpunkcją, pełna ocena artykulacji.
4.  **Czytanie własnego tekstu** – użytkownik wkleja dowolny tekst (np. swoją prezentację); pełna ocena trybu czytania (5.2, 5.7, 5.9).
5.  **Laboratorium Dykcji (łamańce językowe)**
    *   Baza 50 tekstów w kategoriach: szumiące, syczące, ciszące, nosowe, zbitki spółgłoskowe, r/l/ł.
    *   **Pary minimalne** (np. *kasza – kasa – Kasia*, *szyje – syje – sieje*) do treningu rozróżniania szeregów.
    *   Ocena jednostek z ćwiczonej kategorii (GOP), z informacją, która głoska i w jakim słowie zawiodła.

---

## 9. Walidacja i Strojenie Silnika Oceny

Wszystkie progi w tej specyfikacji to **wartości startowe** – muszą zostać dostrojone na danych.
*   **Panel debug** (ukryty, `?debug=1`): eksport JSON z cechami każdego słowa/jednostki/IPU + nagranie (lokalnie).
*   **Korpus testowy:** min. 10 osób × nagrania: staranne, szybkie, celowo niewyraźne / z połykaniem końcówek, z wypełniaczami. Ręczne adnotacje (Praat / Label Studio).
*   **Skrypt `scripts/evaluate-corpus.ts`** (Node, ten sam kod `engine/`): precyzja i czułość dla każdego typu flagi, przeszukiwanie progów.
*   **Cele:** precyzja flag czerwonych ≥ 0.85, bursztynowych ≥ 0.6; błąd AR względem adnotacji ≤ 10%; F1 detekcji pauz ≥ 0.9.
*   **Testy jednostkowe (`vitest`):** liczenie sylab, podział na jednostki, Viterbi CTC na syntetycznych macierzach, normalizacja liczb, GOP, wzory wyniku.

---

## 10. Struktura Danych (Schemat TypeScript)

Ustawienia: `localStorage`, klucz `clearvoice_settings_v2`. Sesje, nagrania i profil: IndexedDB `clearvoice` (tabele `sessions`, `audio`, `baseline`).

```typescript
export type FlagType =
  | 'RUSHED_PHRASE' | 'RUSHED_WORD' | 'ACCELERATING_PHRASE'
  | 'MUMBLED_WORD' | 'SWALLOWED_WORD_ENDING' | 'SUBSTITUTED_SOUND'
  | 'SKIPPED_WORD' | 'INSERTED_WORD' | 'WRONG_WORD'
  | 'NO_BREATH' | 'MISSING_PAUSE' | 'UNEXPECTED_PAUSE' | 'HESITATION_PAUSE'
  | 'FILLER_SOUND' | 'FILLER_WORD' | 'PROLONGATION' | 'REPETITION'
  | 'SWALLOWED_SENTENCE_ENDING' | 'MONOTONE' | 'VOLUME_DECLINE' | 'LOW_SNR'
  | 'AHEAD_OF_PACER' | 'BEHIND_PACER';

export type UnitCategory =
  | 'szumiace' | 'syczace' | 'ciszace' | 'nosowe' | 'sonorne' | 'samogloski' | 'inne';

export interface Flag {
  type: FlagType;
  severity: 'red' | 'amber';
  confidence: 'high' | 'medium';
  startMs: number;
  endMs: number;
  wordIndex?: number;
  unitIndex?: number;
  message: string;
  details?: Record<string, number | string>;
}

export interface UnitAnalysis {
  text: string;                 // np. 'sz', 'ś' (z 'si'), 'ą'
  category: UnitCategory;
  startMs: number;
  endMs: number;
  gop: number;
  pTarget: number;
  heardAs?: string;             // najsilniejszy konkurent przy 'substituted'
  status: 'ok' | 'weak' | 'substituted' | 'deleted' | 'unscorable';
}

export interface WordAnalysis {
  index: number;
  text: string;                 // słowo z transkrypcji / wymówione
  targetText?: string;          // słowo wzorcowe (tryby czytania)
  startMs: number;
  endMs: number;
  syllables: number;
  alignScore: number;
  units: UnitAnalysis[];
  clarity: number | null;       // 0–100, null gdy 'unscorable'
  status: 'ok' | 'rushed' | 'mumbled' | 'filler' | 'skipped' | 'inserted' | 'unscorable';
  flagIndices: number[];
}

export interface PhraseAnalysis {   // IPU
  startMs: number;
  endMs: number;
  syllables: number;
  articulationRate: number;
  pauseAfterMs: number;
}

export interface TrainingSession {
  id: string;
  timestamp: number;
  mode: 'calibration' | 'bot_conversation' | 'pacer_karaoke' | 'free_reading' | 'tongue_twisters';
  targetText?: string;
  deviceLabel: string;
  modelTier: 'lite' | 'standard' | 'pro';
  durationSeconds: number;
  audioKey: string;             // klucz nagrania w tabeli 'audio'
  metrics: {
    speechRate: number;         // sylaby/s z pauzami
    articulationRate: number;   // sylaby/s bez pauz
    wpm: number;
    longestIpuMs: number;
    meanPauseMs: number;
    fillersPerMinute: number;
    f0RangeSemitones: number;
    snrDb: number;
  };
  scores: { total: number; tempo: number; articulation: number; fluency: number; prosody: number };
  flags: Flag[];
  words: WordAnalysis[];
  phrases: PhraseAnalysis[];
  topIssues: { title: string; pointsLost: number; flagIndices: number[]; exerciseLink?: string }[];
}

export interface UserBaseline {
  createdAt: number;
  deviceLabel: string;
  gopByCategory: Record<UnitCategory, { mean: number; sd: number }>;
  articulationRate: number;
  medianIntensityDb: number;
  f0MedianHz: number;
  f0RangeSemitones: number;
  syllablesPerWord: number;
  liveSyllableCorrection: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  targetArticulationRate: [number, number];   // domyślnie [4.5, 5.5]
  maxContinuousSpeechSeconds: number;         // domyślnie 8
  modelTier: 'auto' | 'lite' | 'standard' | 'pro';
  liveCaptions: boolean;
  selectedVoiceURI: string | null;
  scoreWeights: { tempo: number; articulation: number; fluency: number; prosody: number };
}
```

---

## 11. Struktura Katalogów Projektu (Vite + React)

```text
scripts/
├── export_ctc_onnx.py             # Jednorazowy eksport wav2vec2-PL do ONNX + kwantyzacja
└── evaluate-corpus.ts             # Strojenie progów na korpusie z adnotacjami
src/
├── main.tsx, App.tsx              # Router, ThemeProvider, pasek statusu modeli
├── pages/
│   ├── Dashboard.tsx              # Postępy, szybki start
│   ├── Calibration.tsx
│   ├── TrainBot.tsx
│   ├── TrainPacer.tsx
│   ├── TrainReading.tsx           # Czytanie własnego tekstu
│   ├── TrainDiction.tsx
│   ├── SessionReport.tsx          # Raport z odsłuchem, Top 3, „Powtórz to zdanie”
│   └── Settings.tsx
├── components/
│   ├── audio/                     # SpeedometerGauge, BreathBar, WaveformCanvas
│   ├── report/                    # AnnotatedTranscript, Timeline, TopIssues, WordDetails
│   └── ui/                        # shadcn/ui
├── audio/
│   ├── capture.worklet.ts         # PCM 16 kHz + intensywność/dźwięczność co 10 ms
│   ├── liveAnalyzer.ts            # Jądra sylab, AR live, detektor oddechu
│   ├── vad.ts                     # Integracja Silero VAD
│   ├── recorder.ts                # MediaRecorder → IndexedDB
│   └── liveCaptions.ts            # Opcjonalny SpeechRecognition
├── workers/
│   └── analysis.worker.ts         # Whisper + CTC, kolejka fragmentów, postęp pobierania
├── engine/                        # Czyste funkcje (testowane, używane też w scripts/)
│   ├── normalize.ts, numbersPl.ts
│   ├── syllables.ts, units.ts
│   ├── ctcAlign.ts, gop.ts
│   ├── tempo.ts, pauses.ts, fillers.ts
│   ├── pitch.ts (YIN), prosody.ts
│   ├── scoring.ts, report.ts
│   └── hallucinations.ts
├── data/
│   ├── exercises.ts, minimalPairs.ts
│   ├── botScenarios.ts
│   └── calibrationText.ts
└── store/
    ├── settings.ts                # Zustand + persist
    └── db.ts                      # Dexie
```

---

## 12. Wymagania UX/UI i Przypadki Brzegowe

1.  **Pobieranie modeli:** nieblokujący pasek postępu (MB i %) w górnym pasku; ostrzeżenie o rozmiarze przed pierwszym pobraniem; `navigator.storage.persist()`. Zanim modele będą gotowe, działa warstwa na żywo (tempo, oddech, pauzy), a nagranie jest zapisywane i przeliczane automatycznie po pobraniu.
2.  **Wydajność:** postęp analizy widoczny w raporcie; przy WASM wolniejsza analiza jest akceptowalna dzięki przetwarzaniu przyrostowemu. Whisper i CTC uruchamiane sekwencyjnie w jednym workerze (ograniczenie pamięci).
3.  **Przeglądarki:** Chrome/Edge desktop – pełna funkcjonalność. Firefox – bez napisów na żywo, resampling przez `OfflineAudioContext`, WebGPU zależnie od wersji. Safari/iOS – tryb best-effort (zalecany poziom Lite).
4.  **Mikrofon:** obsługa odmowy uprawnień, zmiany urządzenia (`devicechange`), zbyt niskiego SNR, przesterowania (> 1% próbek |x| ≥ 0.99 → komunikat).
5.  **Motywy i dostępność:** semantyka kolorów (zielony = OK, bursztynowy = do sprawdzenia / ostrzeżenie, czerwony = błąd wysokiej pewności) z kontrastem WCAG AA na `bg-slate-50` i `bg-zinc-950`; kolor nigdy nie jest jedynym nośnikiem informacji (ikony, style podkreślenia).

---

## 13. Zakres POC i Kolejność Prac

1.  **Etap 1 – rdzeń oceny (tryb czytania):** przechwytywanie audio, VAD, Live HUD, nagranie, Whisper, CTC + wyrównanie + GOP, tempo i pauzy, tryb „Czytanie własnego tekstu”, raport z odsłuchem, panel debug.
2.  **Etap 2 – strojenie i kalibracja:** korpus testowy, `evaluate-corpus.ts`, profil bazowy użytkownika, Laboratorium dykcji, Pacer.
3.  **Etap 3 – mowa swobodna:** rozmowa z botem, wypełniacze, prozodia, „Top 3 do poprawy”, „Powtórz to zdanie”, dashboard postępów.

**Uruchomienie:** `npm install` → `npm run dev` → `http://localhost:5173`. Jedyny krok jednorazowy po stronie dewelopera to eksport modelu CTC do ONNX (jeśli gotowa wersja nie jest dostępna na HF).
