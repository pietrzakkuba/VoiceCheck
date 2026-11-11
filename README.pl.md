# VoiceCheck

[English](README.md) | **Polski**

VoiceCheck to przeglądarkowy trener wystąpień, który pomaga ćwiczyć prezentacje
i swobodne mówienie po polsku i angielsku. Na bieżąco pokazuje tempo i pauzy,
a po zakończeniu pozwala przejrzeć nagranie oraz raport sesji. Przetwarzanie
dźwięku i zapis danych odbywają się na Twoim urządzeniu, bez backendu do analizy.

## Funkcje

- **Próby prezentacji:** zapisuj i formatuj teksty, sprawdzaj szacowany czas
  czytania i ćwicz z tekstem na ekranie.
- **Swobodne mówienie:** ćwicz z pamięci lub korzystaj z notatek poza aplikacją.
- **Informacje na żywo:** obserwuj tempo artykulacji w sylabach na sekundę,
  czas mówienia bez pauzy oraz ostrzeżenia o szumie i przesterowaniu mikrofonu.
- **Indywidualna kalibracja:** przeczytaj tekst wzorcowy, aby dopasować
  szacowanie sylab do głosu i mikrofonu, osobno dla każdego języka.
- **Raporty sesji:** odsłuchuj nagrania, przeglądaj oś czasu mowy i pauz,
  analizuj poszczególne frazy i wracaj do wcześniejszych prób.
- **Instalacja i praca offline:** korzystaj z produkcyjnej wersji jako PWA
  po zapisaniu jej zasobów w pamięci podręcznej.

Interfejs obsługuje polski i angielski, jasny i ciemny motyw oraz układy
dostosowane do komputera i telefonu.

## Pierwsze kroki

1. Wybierz język interfejsu i wypowiedzi. Opcjonalnie wykonaj kalibrację
   dla wybranego języka, aby poprawić szacunki.
2. Otwórz **Swobodne mówienie** albo utwórz tekst w **Prezentacjach** i rozpocznij
   prezentowanie. Zezwól na dostęp do mikrofonu, gdy poprosi o to przeglądarka.
3. Podczas mówienia korzystaj ze wskaźników tempa i pauz. W **Ustawieniach**
   dopasuj tempo docelowe i limit ciągłego mówienia do swoich ćwiczeń.
4. Zakończ sesję, aby przejrzeć nagranie i raport w **Historii**.

### Jak rozumieć pomiary

VoiceCheck szacuje sylaby na podstawie cech akustycznych i korzysta z lokalnego
modelu uczenia maszynowego **Silero VAD**, aby odróżniać mowę od ciszy.
Nie tworzy transkrypcji ani nie używa generatywnego AI.

Tempo to szacowana szybkość artykulacji, bez pauz. Raportowane „oddechy”
są wyznaczane na podstawie pauz, a nie pomiaru oddychania. Automatyczne
przewijanie tekstu szacuje postęp na podstawie liczby sylab — nie rozpoznaje
wypowiadanych słów. Prognoza czasu czytania uwzględnia zapas na pauzy,
ale nie przewiduje indywidualnego sposobu wygłoszenia tekstu.

Traktuj te informacje jako pomoc w ćwiczeniach, nie ocenę kliniczną.
Na wyniki mogą wpływać jakość mikrofonu, hałas i kalibracja.

## Prywatność i dane lokalne

Nagrania i analiza są przetwarzane lokalnie w przeglądarce. Prezentacje,
sesje, nagrania i wyniki kalibracji są zapisywane w IndexedDB,
a preferencje w localStorage. Aplikacja nie wysyła nagrań do usługi analitycznej.

Dane są przypisane do profilu przeglądarki i adresu witryny. Nie ma synchronizacji
między urządzeniami ani automatycznej kopii zapasowej. Wyczyszczenie danych
witryny usuwa również zapisaną pracę; instalacja PWA nie tworzy osobnej kopii.
Sesje i prezentacje możesz usuwać w aplikacji, a dane aplikacji wyczyścić
w **Ustawieniach**.

## Uruchomienie lokalne

Użyj **Node.js 22.12 lub nowszego** oraz npm.

```sh
npm install
npm run dev
```

Otwórz adres podany przez Vite, zwykle <http://localhost:5173>.
Instalacja kopiuje też model Silero VAD i zasoby WASM ONNX Runtime
z zależności do `public/vendor`; klucz API ani konfiguracja backendu
nie są potrzebne. Dostęp do mikrofonu wymaga HTTPS lub localhost.

| Polecenie | Działanie |
| --- | --- |
| `npm run dev` | Uruchamia serwer deweloperski |
| `npm test` | Uruchamia testy jednorazowo |
| `npm run test:watch` | Uruchamia testy w trybie obserwowania zmian |
| `npm run typecheck` | Sprawdza typy TypeScript |
| `npm run build` | Sprawdza typy i tworzy wersję produkcyjną w `dist` |
| `npm run preview` | Udostępnia lokalnie wersję produkcyjną |
| `npm run icons` | Generuje ponownie ikony aplikacji |

## Wdrożenie

Opublikuj zawartość `dist` na hostingu statycznym przez HTTPS. Obecna
konfiguracja zakłada udostępnienie aplikacji w katalogu głównym domeny.

- Skonfiguruj fallback SPA do `index.html`, aby działały bezpośrednie odnośniki,
  np. `/presentations` i `/session/<id>`. Repozytorium zawiera
  `vercel.json` dla Vercela.
- Serwuj zasoby statyczne, w tym `sw.js`, `manifest.webmanifest`, `offline.html`
  i `icons/`, jako rzeczywiste pliki, bez zastępowania ich stroną SPA.
  Dla `sw.js` ustaw `Cache-Control: no-cache`.
- Zalecane nagłówki izolacji to
  `Cross-Origin-Opener-Policy: same-origin` oraz
  `Cross-Origin-Embedder-Policy: require-corp`. Serwery deweloperski i podglądu
  Vite ustawiają je automatycznie. Produkcyjny service worker zapewnia też
  obsługę izolacji na hostingach bez konfiguracji nagłówków; pierwsza wizyta
  może wymagać jednego przeładowania przed uruchomieniem interfejsu.

### Instalacja, praca offline i aktualizacje

Obsługa PWA jest włączona w wersji produkcyjnej, również udostępnianej przez
`npm run preview`, ale nie na serwerze deweloperskim.

Po poprawnej wizycie online i zakończeniu zapisywania zasobów w pamięci
podręcznej interfejs, model VAD i środowisko WASM są dostępne offline.
Przed odłączeniem internetu sprawdź gotowość do pracy offline w **Ustawieniach**.
Pierwsze uruchomienie bez internetu nie jest obsługiwane.

Zainstaluj aplikację z **Ustawień**, jeśli przeglądarka udostępnia taką opcję,
lub skorzystaj z jej menu instalacji. Na iPhonie i iPadzie użyj w Safari
**Udostępnij → Do ekranu początkowego**. Możliwość instalacji i obsługa mikrofonu
zależą od przeglądarki.

Gdy pojawi się aktualizacja, zakończ nagranie i zapisz edytowany tekst przed
jej zastosowaniem. Aktualizacja zachowuje dane lokalne, ale może przeładować
bieżące okno.

## Technologie i kod

| Obszar | Technologia |
| --- | --- |
| Interfejs | React, TypeScript, Vite, Tailwind CSS, React Router |
| Edytor tekstów | Tiptap / ProseMirror |
| Stan i zapis danych | Zustand, Dexie / IndexedDB |
| Dźwięk | Web Audio / AudioWorklet, MediaRecorder, Silero VAD, ONNX Runtime Web |
| Obsługa offline | Service worker, Workbox, vite-plugin-pwa |
| Testy | Vitest, jsdom |

Rdzeń analizy sygnału znajduje się w `src/engine`, integracja mikrofonu
w `src/audio`, a zapis danych w przeglądarce w `src/store`. Przepływ danych
i szczegóły implementacji opisuje [dokumentacja architektury](documentation/architecture.pl.md).

Aby zobaczyć dane diagnostyczne sesji i wyeksportować JSON, dodaj `?debug=1`
do adresu raportu, np. `/session/<id>?debug=1`. Progi analizy są zdefiniowane
w `src/engine/thresholds.ts`.
