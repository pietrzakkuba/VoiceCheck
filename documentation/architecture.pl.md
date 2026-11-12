# Architektura VoiceCheck

[English](architecture.md) | **Polski** | [README](../README.pl.md)

Dokument opisuje zaimplementowany system: odpowiedzialności komponentów,
ścieżki wykonania, kontrakty danych, zapis i integracje z przeglądarką.

## 1. Zakres systemu

VoiceCheck jest aplikacją SPA/PWA działającą wyłącznie w przeglądarce,
przeznaczoną do prób prezentacji, swobodnego mówienia i kalibracji głosu
po polsku i angielsku. Hosting statyczny dostarcza aplikację, model wykrywania
mowy i środowisko WASM. System nie ma backendu aplikacyjnego ani zdalnego API
do analizy nagrań.

Przeglądarka przechwytuje dźwięk z mikrofonu, wykrywa mowę i akustyczne jądra
sylab, szacuje tempo oraz pauzy i zapisuje nagrania z raportami lokalnie.
Silero VAD jest lokalnym modelem uczenia maszynowego klasyfikującym mowę
i ciszę. Aplikacja nie tworzy transkrypcji ani nie używa generatywnego AI.
Raportowane oddechy oznaczają pauzy między frazami, nie pomiar fizjologiczny.

Dane mają trzy odrębne cykle życia:

| Cykl życia | Zawartość | Właściciel |
| --- | --- | --- |
| Aktywne nagranie | Bloki PCM, ścieżki cech, stan detektorów, fragmenty nagrania | `MicCapture`, `LiveAnalyzer`, `AudioRecorder` |
| Utrwalone dane użytkownika | Prezentacje, sesje, audio, wyniki kalibracji, preferencje | IndexedDB i localStorage |
| Zasoby aplikacji | JavaScript, CSS, ikony, szkielet aplikacji, model VAD, WASM | HTTP i pamięć podręczna service workera |

Pamięć podręczna service workera nie jest kopią zapasową danych użytkownika.

## 2. Technologie i granice modułów

| Obszar | Technologia i odpowiedzialność |
| --- | --- |
| Budowanie | Vite, TypeScript w trybie strict, alias `@` dla `src` |
| Interfejs i nawigacja | React, React Router, strony ładowane na żądanie |
| Style i komponenty bazowe | Tailwind CSS, Radix UI, lokalne komponenty UI, lucide-react |
| Edycja i wykresy | Tiptap / ProseMirror; Recharts |
| Stan i zapis | Zustand; Dexie / IndexedDB; `dexie-react-hooks` |
| Dźwięk | Web Audio, AudioWorklet, MediaRecorder |
| Wykrywanie mowy | Silero VAD v5 przez ONNX Runtime Web / WASM |
| Zasoby offline | `vite-plugin-pwa`, Workbox, własny service worker |
| Testy | Vitest; jsdom dla testów wymagających środowiska przeglądarkowego |

| Obszar kodu | Odpowiedzialność |
| --- | --- |
| [`src/engine`](../src/engine) | Cechy sygnału, segmentacja, jądra sylab, metryki, progi |
| [`src/audio`](../src/audio) | Mikrofon, resampling, nagrywanie, integracja VAD, analiza na żywo, dekodowanie |
| [`src/lib`](../src/lib) | Finalizacja sesji, dokumenty prezentacji, PWA, alarmy i funkcje prezentacji danych |
| [`src/store`](../src/store) | Schemat i operacje IndexedDB; utrwalane preferencje |
| [`src/hooks`](../src/hooks) | Cykl nagrania, odsłuch i integracja API przeglądarki z Reactem |
| [`src/pages`](../src/pages) | Orkiestracja i widoki przypisane do tras |
| [`src/components`](../src/components) | Wspólne kontrolki, wskaźniki na żywo, edytor i raport |
| [`src/i18n`](../src/i18n) | Wybór języka, słowniki i formatowanie |
| [`src/data`](../src/data) | Wzorcowe teksty kalibracyjne |

Silnik analizy nie zależy od Reacta ani mikrofonu. Adaptery przeglądarkowe
dostarczają jego dane wejściowe; pipeline sesji łączy analizę z ustawieniami
i zapisem. Strony koordynują te usługi za pośrednictwem hooków.

## 3. Inicjalizacja i routing

[`main.tsx`](../src/main.tsx) oczekuje na `initializePwa()` przed zamontowaniem
Reacta. Przeładowanie inicjalizujące izolację może zakończyć tę ścieżkę przed
uruchomieniem interfejsu. W pozostałych przypadkach aplikacja jest renderowana
w `StrictMode` i `BrowserRouter`.

[`App.tsx`](../src/App.tsx) stosuje motyw i język interfejsu, renderuje wspólną
nawigację i status PWA oraz definiuje trasy ładowane na żądanie pod `Suspense`.
Efekt startowy wstępnie ładuje VAD i wywołuje migrację starszych sesji.
Instancja VAD jest współdzielona przez przechwytywanie i analizę starszego audio.

| Trasa | Widok |
| --- | --- |
| `/speaking` | Swobodne mówienie |
| `/presentations` | Biblioteka prezentacji |
| `/presentations/:id` | Edytor prezentacji |
| `/presentations/:id/rehearse` | Próba prezentacji |
| `/presentations/:id/history` | Historia prób prezentacji |
| `/history` | Historia sesji |
| `/session/:id` | Raport sesji |
| `/calibration` | Kalibracja dla wybranego języka |
| `/settings` | Preferencje i zarządzanie danymi |

`/`, `/dashboard`, `/reading` i nieznane ścieżki przekierowują do `/speaking`.
Routing korzysta z historii przeglądarki, nie z fragmentów URL; bezpośrednie
otwieranie tras wymaga fallbacku SPA na hostingu.

## 4. Cykl nagrania i model wykonania

[`useTrainingSession`](../src/hooks/useTrainingSession.ts) zarządza aktywnym
`MicCapture`, metadanymi sesji, statystykami na żywo, błędami i ostrzeżeniami
dotyczącymi urządzenia. Normalna sekwencja faz:

```text
idle -> starting -> recording -> processing -> idle
                 błąd operacji -> error
cancel -> idle
```

`start()` wybiera kalibrację języka wypowiedzi i preferowany mikrofon,
przygotowuje audio alarmu i rozpoczyna przechwytywanie. Domyślna kalibracja
poziomu szumu trwa 2000 ms; wywołujący może zmienić ten czas lub przekazać
znany poziom szumu. Wynik kalibracji zapisany dla innego mikrofonu powoduje
wyświetlenie ostrzeżenia.

`stop()` współdzieli trwającą obietnicę, aby uniknąć podwójnej finalizacji.
Nagranie krótsze niż sekunda lub bez wykrytej mowy przechodzi w stan błędu
zamiast tworzyć sesję. Błędy przechwytywania i analizy otrzymują lokalizowane
komunikaty. `cancel()` odrzuca aktywne nagranie; odmontowanie hooka również
wywołuje anulowanie. Zdarzenia zmiany urządzeń aktualizują ostrzeżenie.

```text
Strona -> useTrainingSession -> MicCapture
                                  |
                    getUserMedia MediaStream
                      |                     |
                 MediaRecorder         AudioWorklet
                      |                mono PCM 16 kHz
                 Blob do odsłuchu            |
                                  onBlock na głównym wątku
                                      |          |
                               FeatureExtractor  kolejka Silero VAD
                                      |          |
                                      +-> LiveAnalyzer -> statystyki na żywo

stop -> CaptureResult -> finalizeRecording -> analyzeSession
                                              |
                                   sesja + audio w IndexedDB
                                              |
                                         raport sesji
```

### Przechwytywanie i własność zasobów

[`MicCapture`](../src/audio/capture.ts) żąda wejścia mono z włączoną eliminacją
echa oraz wyłączoną redukcją szumu i automatyczną regulacją wzmocnienia.
Rzeczywista obsługa parametrów zależy od przeglądarki i urządzenia.

Graf audio najpierw próbuje użyć `AudioContext` 16 kHz. Jeśli konfiguracja grafu
się nie powiedzie, ponawia ją z natywną częstotliwością kontekstu i resamplingiem
w worklecie. [`Worklet`](../src/audio/capture.worklet.ts) uśrednia kanały do mono,
podczas resamplingu stosuje filtr dolnoprzepustowy 7 kHz i interpolację liniową.
Przekazuje kompletne bloki po 512 próbek: 32 ms przy 16 kHz. Jest samodzielny
i nie importuje modułów aplikacji.

Ekstrakcja cech i orkiestracja statystyk na żywo działają na głównym wątku.
Wywołania VAD są asynchroniczne i wykonywane kolejno, aby zachować stan
rekurencyjny modelu i kolejność ramek.
[`SileroVad`](../src/audio/vad.ts) używa 64 próbek poprzedzającego kontekstu,
tensora stanu rekurencyjnego i jednowątkowego wykonania WASM (`numThreads = 1`).

Przechwytywanie zachowuje bloki PCM, a
[`AudioRecorder`](../src/audio/recorder.ts) niezależnie zbiera zakodowane
fragmenty z tego samego strumienia. Wybór MIME preferuje WebM/Opus, następnie
Ogg/Opus, WebM i MP4, a w razie braku dopasowania ustawienia przeglądarki.
Zatrzymanie odłącza przechwytywanie, zatrzymuje ścieżki strumienia, zamyka
kontekst i czeka na kolejkę VAD przed zwróceniem wyniku.

## 5. Przetwarzanie sygnału i informacje na żywo

### Cechy ramek i detektory

[`FeatureExtractor`](../src/engine/features.ts) wyznacza cechy co 10 ms:

| Cecha | Obliczenie |
| --- | --- |
| `db` | Poziom szerokopasmowy, okno 50 ms, dBFS |
| `bandDb` | Poziom w paśmie samogłosek 300–2500 Hz, okno 30 ms |
| `voicing` | Znormalizowana autokorelacja, okno 40 ms, zakres tonu podstawowego 75–400 Hz |
| `clipped` | Udział próbek o amplitudzie bezwzględnej co najmniej 0,99 w kroku analizy |

[`NucleusDetector`](../src/engine/syllableNuclei.ts) wygładza obwiednie trzema
ramkami i akceptuje lokalne szczyty dźwięczne na podstawie wyrazistości,
poziomu szumu, odniesienia do ostatnich samogłosek i odstępu między szczytami.
Zaakceptowane indeksy ramek stają się nieskorygowanymi czasami jąder sylab
w milisekundach.

[`VadHysteresis`](../src/engine/segmentation.ts) rozpoczyna mowę przy
prawdopodobieństwie większym niż 0,5, a kończy poniżej 0,35. Doprecyzowanie
energią i dźwięcznością przycina ciche krawędzie oraz dzieli segmenty VAD
przy cichych odcinkach trwających co najmniej 300 ms. Próg ciszy łączy poziom
szumu z oszacowanym poziomem dźwięcznej mowy.

### Analiza na żywo

[`LiveAnalyzer`](../src/audio/liveAnalyzer.ts) początkowo wyznacza poziom szumu
jako medianę ramek kalibracyjnych. Następnie aktualizuje go na podstawie
ramek ciszy, korzystając z wygładzonego oszacowania 10. percentyla.
Przekazany znany poziom szumu pomija początkową fazę estymacji.

Doprecyzowane segmenty oddzielone odstępem krótszym niż 300 ms są łączone
w odcinki odpowiadające frazom. Tempo wykorzystuje jądra w tych odcinkach
w ruchomym oknie ostatnich 10 sekund i wymaga co najmniej trzech sekund mowy.
Stosuje mnożnik wybranej kalibracji oraz wygładzanie wykładnicze ze stałą
czasową dwóch sekund. WPM na żywo wynika z tak oszacowanego tempa artykulacji.

Skumulowana skorygowana liczba sylab używana do śledzenia czytania pomija
początkową kalibrację. Statystyki są publikowane mniej więcej co 100 ms.
Wskaźnik oddechu porównuje długość bieżącego odcinka z limitem ciągłego
mówienia: ostrzeżenie zaczyna się przy 75%, a stan krytyczny przy 100%.
Wejście w stan krytyczny może uruchomić dźwięk i wibrację, jeśli alarmy są włączone.

Istotne stałe są zebrane w
[`thresholds.ts`](../src/engine/thresholds.ts):

| Parametr | Wartość |
| --- | --- |
| Pauza oddechowa / długa pauza | Co najmniej 300 ms / więcej niż 2000 ms |
| Wyrazistość jądra / poziom ponad szumem | Co najmniej 2 dB / co najmniej 10 dB |
| Spadek poziomu jądra względem ostatnich głośnych samogłosek | Najwyżej 20 dB |
| Dźwięczność jądra / kryterium odstępu | Więcej niż 0,45 / 100 ms |
| Minimalny czas frazy / liczba skorygowanych sylab do klasyfikacji tempa | 1500 ms / 4 |
| Ostrzeżenie o niskim SNR / próg udziału przesterowania | Poniżej 12 dB / powyżej 0,01 |
| Margines histerezy stref tempa na żywo | 0,25 sylaby/s |

Domyślne cele użytkownika, przechowywane oddzielnie od progów detekcji,
wynoszą 4,5–5,5 sylaby/s i osiem sekund ciągłego mówienia.

## 6. Analiza końcowa i dane raportu

[`finalizeRecording`](../src/lib/sessionPipeline.ts) otrzymuje PCM, Blob
do odsłuchu, ścieżki cech, doprecyzowane segmenty mowy, surowe jądra i metadane.
Dekoduje Blob i porównuje obwiednie poziomu dźwięku, aby oszacować przesunięcie
między czasem odsłuchu a osią analizy PCM. Jeśli pomiar przesunięcia się nie
powiedzie, pipeline przyjmuje zero. Tworzy też próbkowaną rzadziej falę szczytową.

Pipeline zapisuje kopię aktualnych ustawień analizy z chwili finalizacji
i wywołuje [`analyzeSession`](../src/engine/session.ts). `saveSession()` zapisuje
sesję i audio w jednej transakcji Dexie. Po poprawnym zapisie strony ćwiczeń
przechodzą do raportu; kalibracja wyświetla własny wynik.

### Definicje fraz i metryk

Analiza końcowa sortuje poprawne segmenty i scala odstępy krótsze niż 300 ms.
Każda powstała fraza zlicza surowe jądra z marginesem 50 ms przy granicach,
mnoży je przez współczynnik korekty i zaokrągla własną liczbę sylab.
Odstępy między frazami stają się pauzami; dłuższe niż 2000 ms mają typ `long`.
Cisza przed pierwszą i po ostatniej frazie nie jest liczona jako pauza oddechowa.

Niech `S` oznacza sumę skorygowanych sylab fraz, `P` sumę czasów fraz
w sekundach, a `D` odcinek od początku pierwszej do końca ostatniej frazy:

```text
articulationRate = S / P
speechRate      = S / D
WPM w raporcie  = speechRate * 60 / max(1, syllablesPerWord)
breathCount     = liczba pauz między frazami
oddechy/minutę  = breathCount / (D / 60)
```

Zerowe mianowniki dają zerowe tempa. Krótkie odstępy scalone wewnątrz frazy
pozostają częścią jej czasu. `durationSeconds` obejmuje natomiast całe
przechwycone nagranie, w tym początkową ciszę, kalibrację i pauzy.

Frazy krótsze niż 1500 ms lub zawierające mniej niż cztery skorygowane sylaby
mają klasę `short`. Pozostałe są `too_fast` powyżej górnej granicy celu plus 1,
`fast` powyżej górnej granicy, `slow` poniżej dolnej granicy minus 1
i `ok` w pozostałych przypadkach. Fraza przekracza limit oddechu, gdy jej czas
jest ściśle większy od limitu.

Metryki na żywo i końcowe współdzielą detektory i funkcje segmentacji,
ale nie są identyczne: wyniki na żywo używają niepełnych danych asynchronicznych,
ruchomego okna, wygładzania i marginesu jąder 30 ms; końcowe korzystają
z całej sesji, marginesu 50 ms i zaokrąglania osobno dla każdej frazy.

### Raporty i odsłuch

[`SessionReport`](../src/pages/SessionReport.tsx) renderuje metryki, ścieżki
fraz i pauz, ostrzeżenia i wskazówki regułowe. `TipKey` wraz z parametrami
liczbowymi umożliwia lokalizację podczas wyświetlania; wskazówki raportu
mogą zostać odtworzone z zapisanych metryk i ustawień. Nie ma wywołania
modelu językowego.

[`useSessionAudio`](../src/hooks/useSessionAudio.ts) ładuje Blob z IndexedDB
do adresu obiektowego, przelicza przewijanie i zakresy odsłuchu przez
`audioOffsetMs` i zwalnia adres przy sprzątaniu zasobów. Oś czasu raportu
używa czasu analizy. Tryb raportu `?debug=1` udostępnia dane diagnostyczne
i eksport JSON.

## 7. Kalibracja i przeliczanie

[`Calibration`](../src/pages/Calibration.tsx) normalizuje tekst wzorcowy
wybranego języka i szacuje liczbę jego słów oraz sylab. Kalibracja porównuje
ten tekst z surowymi jądrami mieszczącymi się w granicach nagranych fraz:

```text
ratio              = sylaby tekstu wzorcowego / surowe jądra
correction         = clamp(ratio, 0.6, 1.6)
syllablesPerWord    = sylaby tekstu wzorcowego / max(1, słowa tekstu)
```

Wynik jest odrzucany przy mniej niż 20 surowych jądrach, mniej niż dziesięciu
sekundach fraz lub ilorazie poza zakresem 0,5–2. Korekta jest zaokrąglana
do trzech miejsc po przecinku. Walidacja nie rozpoznaje słów ani nie potwierdza
przeczytania całego tekstu.

Zaakceptowany wynik trafia do rekordu kalibracji danego języka w IndexedDB,
a jego parametry analizy są kopiowane do utrwalanych ustawień. Następnie
przeliczana jest sesja kalibracyjna. Zapisanie kalibracji nie przelicza
automatycznie pozostałych sesji historycznych.

`recomputeSession()` działa na sesjach schematu 2, wykorzystując zapisane
`tracks.speechSegments`, nieskorygowane `tracks.nucleiMs`, czas i SNR.
Stosuje aktualne ustawienia języka wypowiedzi bez dekodowania audio
i ponownego uruchamiania VAD oraz zastępuje kopię ustawień sesji i wynik analizy.
Raport porównuje zapisaną kopię z aktualnymi ustawieniami, aby wykryć różnice.

Migracja starszych danych jest osobną ścieżką: dekoduje zapisane audio,
wyznacza cechy, ponownie uruchamia VAD i detekcję jąder oraz tworzy sesję
w bieżącym schemacie.

## 8. Dokumenty prezentacji i postęp czytania

Encja [`Presentation`](../src/types.ts) zawiera tytuł, zwykły tekst, opcjonalny
JSON Tiptap w wersji 1, język wypowiedzi i znaczniki czasu.
[`presentationDocument.ts`](../src/lib/presentationDocument.ts) wyodrębnia
tekst, tworzy dokumenty dla starszych rekordów tekstowych i wyznacza fragmenty
czytania ze skumulowaną liczbą sylab tekstu.

[Schemat edytora](../src/lib/presentationExtensions.ts) obsługuje akapity,
pogrubienie, kursywę, nagłówki poziomów 2 i 3, listy i podziały wiersza.
Nieobsługiwane elementy nie należą do schematu. Limit tytułu to 120 znaków,
a treści 20 000 znaków zwykłego tekstu. Edytor odrzuca zmiany zwiększające
treść ponad limit, zamiast ją obcinać.

Sylaby w tekście są liczone według reguł pisowni i heurystyk danego języka
w [`syllables.ts`](../src/engine/syllables.ts). Normalizacja i rozwijanie liczb
są niezależne od detekcji akustycznej. Prognoza czasu czytania
w [`presentation.ts`](../src/lib/presentation.ts) ma postać:

```text
szacowany czas w sekundach = round(sylaby tekstu / (środek zakresu tempa * 0.7))
```

Współczynnik rezerwuje 30% całkowitego czasu na pauzy; nie wynika z pomiaru
wypowiedzi użytkownika. Sesja próby zachowuje kopię zwykłego tekstu i opcjonalne
`presentationId`, więc późniejsze zmiany lub usunięcie prezentacji nie zmieniają
tekstu zarejestrowanej próby.

[`RehearsalText`](../src/components/RehearsalText.tsx) przypisuje skorygowaną
liczbę sylab na żywo do fragmentów czytania i przesuwa obszar tekstu.
Ręczne przewijanie wyłącza automat; ponowne włączenie wraca do szacowanej
pozycji. Kalibracja nie przesuwa postępu czytania. Nie ma dopasowania słów.

## 9. Stan, zapis i zgodność danych

### IndexedDB

[`db.ts`](../src/store/db.ts) otwiera bazę o zachowanej nazwie `clearvoice`.

| Tabela | Klucz główny i indeksy | Zawartość |
| --- | --- | --- |
| `presentations` | `id`; `updatedAt` | Edytowalne teksty i dokumenty JSON |
| `sessions` | `id`; `timestamp`, `mode`, `schema`, `presentationId` | Metadane, kopia ustawień, metryki, frazy, pauzy, wskazówki, ścieżki, ostrzeżenia |
| `audio` | `key`; `createdAt` | Blob, typ MIME i czas utworzenia |
| `baseline` | `id` (`pl` lub `en`) | Kalibracja danego języka i nazwa mikrofonu |

`session.audioKey` wskazuje audio. `presentationId` jest opcjonalnym
powiązaniem na poziomie aplikacji, nie kluczem obcym z usuwaniem kaskadowym.
Usunięcie prezentacji zachowuje jej sesje. Usuwanie sesji transakcyjnie usuwa
ich audio; usuwanie zbiorcze może objąć wszystkie sesje, jedną prezentację
lub swobodne mówienie. `clearAllData()` czyści wszystkie cztery tabele.

Wersje bazy są niezależne od serializacji sesji:

| Wersja | Zmiana bazy |
| --- | --- |
| 1 | Pierwotne tabele sesji, audio i kalibracji |
| 2 | Indeksy sesji dla analizy akustycznej, w tym `schema` |
| 3 | Tabela prezentacji i indeks sesji `presentationId` |
| 4 | Migracja kalibracji `current` do klucza językowego `pl` |

Bieżący `TrainingSession.schema` wynosi `2`. Sesje zachowują surowe czasy
jąder, doprecyzowane segmenty mowy i falę do wyświetlenia, a nie pełny PCM
i bufory cech z analizy na żywo.

`migrateLegacySessions()` zachowuje tożsamość rekordów i klucze audio,
odtwarzając analizę. Starszy rekord bez audio jest usuwany. Nieudana ponowna
analiza jest logowana, a rekord pozostaje do następnego uruchomienia;
listy sesji pomijają nieaktualne schematy. Dawny `reading` pozostaje
poprawnym zapisanym trybem.

### Preferencje i stan aplikacji

[`settings.ts`](../src/store/settings.ts) utrwala preferencje przez Zustand
pod kluczem `clearvoice_settings_v2`, z wersją zapisu `4` i funkcją
`migrateSettings()`. Ta wersja jest niezależna od wersji 4 bazy Dexie
i schematu 2 sesji. Zachowane identyfikatory pozwalają odczytywać starsze
dane lokalne.

Preferencje obejmują motyw, język interfejsu, identyfikator mikrofonu,
cele tempa i oddechu, alarmy, przewijanie i blokadę ekranu na komputerze,
stan wprowadzenia do aplikacji i parametry kalibracji każdego języka.
Domyślna liczba sylab na słowo to 2,3 dla polskiego i 1,4 dla angielskiego,
z korektą 1 dla obu języków.

Rekordy kalibracji zachowują metadane wyniku; kopia w ustawieniach dostarcza
parametrów do analizy na żywo i końcowej. Zapis kalibracji aktualizuje oba
magazyny kolejno, nie w jednej transakcji obejmującej oba mechanizmy.
Przywrócenie ustawień domyślnych zachowuje język, kalibrację, mikrofon
i stan wprowadzenia; czyszczenie IndexedDB jest osobną operacją.

`useLiveQuery` aktualizuje widoki po zmianach w bazie. Zustand przechowuje
preferencje i przejściowy stan PWA; PCM nie przechodzi przez stan Reacta.
Dane trwałe są przypisane do originu witryny i profilu przeglądarki,
bez synchronizacji serwerowej i automatycznej kopii zapasowej.

## 10. Integracja interfejsu i lokalizacja

[`i18n/index.ts`](../src/i18n/index.ts) składa słowniki domenowe w drzewa
komunikatów `pl` i `en`. `Messages` jest wyprowadzany z polskich przestrzeni
nazw; eksporty obu języków korzystają ze wspólnego kształtu. Komponenty Reacta
pobierają język i komunikaty przez `useLang()` / `useT()`, a zwykłe moduły przez
`getLang()` / `getT()`. Efekt synchronizuje atrybut `lang` dokumentu.

Język interfejsu i wypowiedzi są odrębne. Język wypowiedzi wybiera reguły
tekstu i kalibrację; język interfejsu wybiera etykiety, formatowanie i wskazówki.
Dla nowych ustawień polski język przeglądarki wybiera polski, a inne zgłoszone
języki — angielski; bez danych o języku przeglądarki domyślny jest polski.
Prezentacje i sesje bez zapisanego języka są traktowane jako polskie.

Nawigacja responsywna używa bocznego panelu na komputerze lub pasków na
telefonie. Podczas aktywnej próby mobilnej CSS utrzymuje widoczne wskaźniki
i zakończenie nagrania, a przewija się obszar tekstu.
[`useMobileLayout`](../src/hooks/useMobileLayout.ts) uwzględnia też niski
układ poziomy urządzeń ze zgrubnym wskaźnikiem dotykowym.

Automatyczne przewijanie tekstu działa w układzie komputerowym. Podczas próby
prezentacji blokada wygaszania ekranu jest automatyczna na telefonie;
na komputerze zależy od zapamiętanego przełącznika. [`useWakeLock`](../src/hooks/useWakeLock.ts)
żąda blokady ekranu, gdy jest włączona, ponawia ją po odzyskaniu widoczności
strony i zwalnia przy sprzątaniu zasobów. Brak obsługi lub odrzucenie żądania
ma jawny status, w tym ostrzeżenie podczas prezentacji mobilnej. Próba mobilna
nie nadpisuje preferencji komputerowej. Tryb swobodnej wypowiedzi zachowuje
blokadę ekranu tylko w układzie komputerowym.

## 11. Budowanie, wdrożenie i PWA

[`package.json`](../package.json) buduje aplikację przez TypeScript, a następnie
Vite. [`copy-assets.mjs`](../scripts/copy-assets.mjs), uruchamiany podczas
instalacji npm, kopiuje model Silero v5 z `@ricky0123/vad-web` i wybrane pliki
WASM/modułu ONNX Runtime do `public/vendor`. Analiza używa lokalnego modelu,
nie pomocniczej obsługi mikrofonu z tego pakietu.

[`vite.config.ts`](../vite.config.ts) ustawia bazę w katalogu głównym domeny
i konfiguruje `vite-plugin-pwa` w trybie `injectManifest`. Build wstrzykuje
listę zasobów do [`src/sw.ts`](../src/sw.ts); logika service workera pozostaje
własna. Lista obejmuje szkielet aplikacji, stronę offline, faviconę,
wynikowe JS/CSS, ikony, model ONNX i zasoby WASM/modułu.

### Cykl pamięci podręcznej i aktualizacji

Worker instaluje i aktywuje Workbox `PrecacheController` z nazwą
`voicecheck-offline`. Dla żądań GET
[`pwa-worker.ts`](../src/lib/pwa-worker.ts) najpierw zwraca zasoby z precache;
nawigacje wewnątrz zakresu otrzymują zapisany `index.html`. Pozostałe żądania
korzystają z sieci. Nieudane nawigacje mogą otrzymać `offline.html`;
błędy sieciowe innych żądań są propagowane.

`GET_OFFLINE_STATUS` używa kanału wiadomości do sprawdzenia obecności każdego
wpisu precache. `offlineReady` jest niezależne od stanu połączenia:
pełna praca offline wymaga wcześniejszej poprawnej wizyty online
i zakończenia zapisywania zasobów.

[`pwa.ts`](../src/lib/pwa.ts) rejestruje worker tylko w wersji produkcyjnej
i śledzi w Zustand instalację, połączenie, gotowość cache, oczekujące
aktualizacje i błędy. Oczekiwanie na rejestrację i aktywację ma limity
dziesięciu sekund. Błędy konfiguracji PWA są logowane i widoczne w interfejsie,
ale nie blokują zamontowania Reacta.

Worker nie wywołuje `skipWaiting()` podczas instalacji. Potwierdzona
aktualizacja wysyła `SKIP_WAITING`, czeka na przejęcie kontroli nad stroną
przez wybrany worker i przeładowuje to okno. Pozostałe okna nie są jawnie
przeładowywane. Aktualizacje workera nie czyszczą IndexedDB ani preferencji.

### Izolacja i hosting

Serwery deweloperski i podglądu ustawiają COOP `same-origin` i COEP
`require-corp`. Odpowiedzi service workera dodają te nagłówki oraz CORP
`cross-origin`, jeśli odpowiedź można opakować. Jednowątkowy VAD i inicjalizacja
izolacji są odrębnymi częściami bieżącej implementacji.

Przy pierwszej produkcyjnej wizycie bez kontrolującego workera i izolacji
inicjalizacja może poczekać na aktywację i przeładować stronę raz przed
zamontowaniem Reacta. Znacznik sessionStorage zabezpiecza tę próbę;
nie jest to mechanizm przeładowywania w trakcie nagrania.

Hosting wymaga HTTPS lub localhost dla API mikrofonu i service workera,
rzeczywistych plików statycznych dla workera, modelu i runtime oraz fallbacku
SPA dla tras aplikacji. [`vercel.json`](../vercel.json) dostarcza regułę SPA.
Obecne ścieżki i zakres PWA zakładają katalog główny domeny.

## 12. Ograniczenia i granice weryfikacji

Tempo, liczba słów wyprowadzona z audio, oddychanie i postęp czytania są
szacunkami. Wpływają na nie szum, pogłos, cechy głosu i przetwarzanie mikrofonu.
Ani kalibracja, ani raport nie potwierdzają wypowiedzianych słów.
Obsługa przeglądarki decyduje o formatach nagrania, instalacji, wibracji
i blokadzie ekranu.

PCM, zakodowane fragmenty i część ścieżek są gromadzone przez czas aktywnego
nagrania. Finalizacja składa PCM i dekoduje Blob do odsłuchu; migracja starszych
danych również dekoduje całe nagrania. Zużycie pamięci rośnie więc z długością
nagrania, a obliczanie cech sygnału konkuruje z interfejsem na głównym wątku.

Istniejące testy obejmują analizę i reguły tekstu, funkcje audio, operacje sesji
i zapisu, komponenty i strony, lokalizację oraz logikę PWA. Testy
przeglądarkowe używają środowisk symulowanych; nie potwierdzają zgodności
mikrofonów, urządzeń i pracy offline we wszystkich rzeczywistych przeglądarkach.
