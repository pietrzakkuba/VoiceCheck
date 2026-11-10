# VoiceCheck

Nazwa aplikacji i projektu to **VoiceCheck**; pakiet npm i prefiks eksportowanych raportów używają
zapisu `voicecheck`. Starsze identyfikatory lokalnej bazy (`clearvoice`) i ustawień
(`clearvoice_settings_v2`) pozostają bez zmian, aby zachować dostęp do zapisanych danych.

Trener wystąpień i prezentacji po polsku: ćwicz wygłaszanie własnego tekstu, kontrolując tempo i oddech. Działa
w całości w przeglądarce, bez modeli AI – nagrania i historia sesji nie opuszczają komputera.

## Funkcje

- **Biblioteka prezentacji**: zapisywanie tekstów wystąpień z tytułem; aplikacja
  wyświetla szacowany czas czytania w Twoim tempie docelowym (bez pauz), bez ręcznego limitu czasu.
  Edytor pozwala stosować pogrubienie, kursywę, dwa poziomy nagłówków, listy punktowane i numerowane
  oraz akapity. Podgląd i tekst podczas próby zachowują formatowanie, również po ponownym otwarciu.
  Limit 20 000 znaków i statystyki dotyczą samego tekstu, bez znaczników formatowania.
  Wklejanie zachowuje obsługiwane formatowanie, pomijając obce style, obrazki i inne niedozwolone elementy.
  Zmiana przekraczająca limit nie jest wprowadzana; edytor wyświetla komunikat bez obcinania tekstu.
  Starsze prezentacje można nadal otwierać i edytować. Raporty sesji zachowują zwykły tekst wystąpienia.
  Przycisk „Historia” przy każdej prezentacji pokazuje wszystkie jej próby, od najnowszej, z datą,
  czasem trwania, tempem i przejściem do raportu. Tytuł prezentacji jest tylko w nagłówku;
  poszczególne próby wyróżnia data i godzina nagrania. Historia jest też dostępna z raportu próby.
- **Prezentowanie**: przycisk „Prezentuj” otwiera tekst do czytania na głos podczas próby lub właściwego
  wystąpienia. W edytorze służy do tego „Zapisz i prezentuj”, a w raporcie „Prezentuj ponownie”.
  Każda sesja jest zapisywana i powiązana z prezentacją.
  Tekst podczas prezentowania zachowuje oryginalne podziały wierszy i puste linie.
  Domyślnie przewija się automatycznie zgodnie z postępem szacowanym z wykrytych sylab,
  bez przewijania podczas ciszy i kalibracji. Przełącznik na ekranie treningu pozwala wyłączyć
  tę funkcję; wybór jest zapamiętywany. Nie jest to rozpoznawanie wypowiadanych słów.
  Ręczne przewinięcie wyłącza automatyczne przewijanie i jego przełącznik. Ponowne włączenie
  przełącznika przywraca przewijanie do aktualnej szacowanej pozycji czytania.
  Szacowany czas czytania jest widoczny w bibliotece, edytorze oraz przed próbą i podczas nagrania.
  Licznik przy tekście i w raporcie pokazuje czas całej sesji (z pauzami i kalibracją mikrofonu),
  bez odliczania i ostrzeżeń o przekroczeniu czasu. Dawne ręczne limity są ignorowane.
  Raport próby obok czasu sesji pokazuje szacowany czas czytania jej zapisanego tekstu,
  obliczony według tempa docelowego zapisanego w sesji, bez pauz.
- **Swobodne mówienie**: karta nad biblioteką prezentacji (adres `/speaking`) pozwala czytać tekst spoza
  aplikacji (kartka, inny ekran) lub mówić z pamięci. Aplikacja pokazuje wtedy tylko panele tempa i oddechu
  oraz licznik czasu (bez limitu); sesja trafia do historii z pełnym raportem.
- **Na żywo podczas nagrania**: panel tempa (sylaby/s), pasek oddechu, przebieg fali,
  ostrzeżenia o szumie i przesterowaniu. Po przekroczeniu limitu mówienia bez oddechu aplikacja odtwarza krótki
  dźwięk (i wibrację na telefonie).
  Przypięty nad tekstem status tempa pozwala śledzić tempo bez odrywania wzroku od treści.
  Ramka tekstu na bieżąco zmienia kolor zgodnie z tempem i oddechem, bez poświaty i zmiany tła tekstu.
  Żółte ostrzeżenie oddechu zmienia ramkę na żółtą, a czerwony alarm tempa lub oddechu ma pierwszeństwo.
  Tempo ma osobny kolorowy panel z dużą wartością i wyraźnym statusem.
  Obok niego stale widoczny jest panel oddechu, również podczas uruchamiania i kalibracji mikrofonu.
  Panele mają stały układ, a zmiany komunikatów nie przesuwają tekstu. Ostrzeżenia oddechu zmieniają
  kolor bez pulsowania; pasek i licznik pokazują czas mówienia bez pauzy.
  Paski przewijania są wąskie i dopasowane do motywu; w ramce treningu są odsunięte od jej krawędzi.
  Spacja rozpoczyna i kończy nagranie podczas próby i kalibracji; podpowiedź jest widoczna przy przycisku.
  Skrót nie działa podczas pisania, obsługi innych kontrolek ani uruchamiania mikrofonu i analizy nagrania.
- **Kalibracja**: minuta czytania znanego tekstu dopasowuje pomiar do głosu i mikrofonu.
- **Raport sesji**: tempo mowy, liczba oddechów, najdłuższa fraza bez oddechu, krótkie wskazówki z odsłuchem
  fragmentu, oś czasu (fale, frazy i pauzy oddechowe, tempo każdej frazy) oraz tabela fraz.
  Oś czasu przewija się automatycznie podczas odsłuchu, utrzymując wskaźnik czasu w widocznym obszarze.
- **Strona główna**: biblioteka prezentacji z dodawaniem, edycją i uruchamianiem prób, a poniżej historia sesji.
  Kalibracja jest dostępna z nagłówka pulpitu. Dawny adres `/presentations` przekierowuje na pulpit.
- **Historia sesji**: na stronie głównej i w historii prezentacji lista pokazuje po 10 sesji na stronę,
  od najnowszej. Przyciski „Poprzednia” i „Następna” pozwalają przeglądać całą historię.
  Kosz przy sesji pozwala trwale usunąć ją wraz z nagraniem po potwierdzeniu, bez usuwania prezentacji
  ani zapisanej kalibracji.

## Jak to działa

| Warstwa | Technologia |
|---|---|
| UI | Vite, React 19, TypeScript, Tailwind v4, react-router |
| Stan / dane | Zustand (ustawienia w `localStorage`), Dexie / IndexedDB (prezentacje, sesje i nagrania) |
| Audio | `getUserMedia` + AudioWorklet (16 kHz), Silero VAD (onnxruntime-web), MediaRecorder |
| Analiza | `src/engine/` – czysty TypeScript (testy w `vitest`) |

- **Mowa / cisza**: detektor aktywności głosu Silero VAD.
- **Sylaby**: akustyczne wykrywanie jąder sylab (szczyty energii w paśmie samogłosek), skorygowane współczynnikiem
  z kalibracji.
- **Frazy i oddechy**: odcinki mowy rozdzielone pauzą ≥ 350 ms; każda pauza to okazja na oddech. Fraza dłuższa niż
  limit (domyślnie 8 s) jest oznaczana jako zbyt długa.
- **Tempo**: tempo artykulacji (sylaby/s bez pauz), porównywane z celem (domyślnie 4,5–5,5 syl/s).

Kalibracja (minuta czytania znanego tekstu) dopasowuje liczenie sylab do głosu i mikrofonu. Sesje z poprzedniej
wersji aplikacji są przy starcie przeliczane tą samą metodą.

## Uruchomienie

Wymagany Node.js 20+.

```bash
npm install          # kopiuje też pliki WASM onnxruntime i model VAD do public/vendor
npm run dev          # http://localhost:5173
npm test
npm run build        # statyczna wersja w dist/
npm run preview
```

Aplikacja zachowuje obsługę **cross-origin isolation** (COOP/COEP dla WASM). Serwer deweloperski
i `preview` ustawiają nagłówki COOP/COEP. Na hostingu produkcyjnym zalecane są
`Cross-Origin-Opener-Policy: same-origin` i `Cross-Origin-Embedder-Policy: require-corp`.
Jeden service worker PWA zapewnia te nagłówki również na hostingu bez ich konfiguracji;
pierwsza wizyta może wtedy wymagać jednego automatycznego przeładowania przed uruchomieniem interfejsu.
Mikrofon i service worker działają tylko przez HTTPS lub na `localhost`.

Aplikacja używa adresów bez `#` (np. `/presentations`, `/presentations/<id>/rehearse`, `/speaking`, `/session/<id>`). Na hostingu należy skonfigurować
fallback SPA (zwracanie `index.html` dla podstron); Vite robi to automatycznie.
Na Vercelu zapewnia to plik `vercel.json` w katalogu głównym projektu. Po zmianie konfiguracji
należy ponownie wdrożyć aplikację; odświeżanie i bezpośrednie otwieranie podstron będzie wtedy działać.
Istniejące pliki statyczne mają pierwszeństwo przed regułą fallbacku.
Pliki `sw.js`, `manifest.webmanifest`, `offline.html` i `icons/` muszą być serwowane jako rzeczywiste pliki,
bez przekierowania do `index.html`. Dla `sw.js` zalecany jest `Cache-Control: no-cache`.
Obecna konfiguracja zakłada wdrożenie w katalogu głównym domeny.

## Instalacja PWA i offline

Po wdrożeniu wersji produkcyjnej (`npm run build`, lokalnie `npm run preview`) VoiceCheck można
zainstalować z Ustawień, gdy przeglądarka udostępnia przycisk instalacji, lub z menu przeglądarki
(np. Chrome/Edge na komputerze i Chrome na Androidzie).
Na iPhonie/iPadzie otwórz stronę w Safari i wybierz **Udostępnij → Do ekranu początkowego**.
Możliwość instalacji i obsługa mikrofonu zależą od przeglądarki. Wersja deweloperska nie rejestruje PWA.

**Podstawowy tryb offline** jest dostępny po pierwszej poprawnej wizycie online i aktywacji service workera.
Przy otwarciu lub odświeżeniu dowolnego adresu bez sieci pojawia się ekran z przyciskiem „Spróbuj ponownie”.
Nie jest to pełna aplikacja offline: duże modele audio, pliki WASM i cały interfejs nie są pobierane do cache na zapas.
Utrata połączenia w już otwartej aplikacji pokazuje komunikat, ale nie zasłania pracy i nie przerywa nagrania.
Pierwsze uruchomienie na urządzeniu bez internetu nie jest obsługiwane.

**Aktualizacje**: po wykryciu nowej wersji pojawia się komunikat. Zakończ nagranie i zapisz edytowany tekst,
następnie wybierz „Aktualizuj” i potwierdź przeładowanie. Pozostałe otwarte okna nie przeładowują się automatycznie.
Przeglądarka sprawdza aktualizacje przy kolejnych otwarciach aplikacji; nowa wersja może też zostać aktywowana
po zamknięciu wszystkich jej okien. Aktualizacja nie usuwa prezentacji, nagrań ani ustawień.
Dane pozostają lokalne dla danego urządzenia i profilu przeglądarki; instalacja nie zapewnia synchronizacji
ani kopii zapasowej. Usunięcie danych witryny w przeglądarce usuwa też lokalne dane aplikacji.

Ikony odtwarza `npm run icons` (na podstawie znaku używanego w faviconie).

## Prywatność

Całe przetwarzanie odbywa się lokalnie. Dane można usunąć w Ustawieniach → Dane.
Usuwanie danych, prezentacji i sesji oraz przywracanie ustawień domyślnych wymaga potwierdzenia
w oknie aplikacji. „Anuluj” i Escape zamykają potwierdzenie bez zmian; kliknięcie tła nie zamyka okna.
Podczas wykonywania operacji przyciski są zablokowane, a ewentualny błąd jest wyświetlany w oknie.

## Debug

Dodaj `?debug=1` do adresu raportu (np. `/session/<id>?debug=1`), aby zobaczyć surowe dane i wyeksportować sesję
(JSON). Progi analizy są w `src/engine/thresholds.ts`.

## Struktura

```text
scripts/            kopiowanie zasobów WASM i VAD
src/audio/          mikrofon, worklet, VAD, analiza na żywo, dekodowanie
src/engine/         analiza: segmentacja, jądra sylab, frazy, pauzy, tempo, wskazówki
src/lib/            zapis i przeliczanie sesji, sygnał oddechu, motyw, etykiety
src/pages/          pulpit, prezentacje (lista, edytor, próba), swobodne mówienie, kalibracja, raport, ustawienia
src/components/     HUD, raport, komponenty UI
src/data/           tekst kalibracyjny (treść autorska)
```
