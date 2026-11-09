# VoiceCheck

Trener wystąpień i prezentacji po polsku: ćwicz wygłaszanie własnego tekstu, kontrolując tempo i oddech. Działa
w całości w przeglądarce, bez modeli AI – nagrania i historia sesji nie opuszczają komputera.

## Funkcje

- **Biblioteka prezentacji**: zapisywanie tekstów wystąpień z tytułem i opcjonalnym limitem czasu; aplikacja
  szacuje czas mówienia w Twoim tempie docelowym i ostrzega, gdy tekst nie mieści się w limicie.
  Przycisk „Historia” przy każdej prezentacji pokazuje wszystkie jej próby, od najnowszej, z datą,
  czasem trwania, tempem i przejściem do raportu. Historia jest też dostępna z raportu próby.
- **Próba prezentacji**: przycisk „Ćwicz” otwiera tekst prezentacji do czytania na głos; każda próba jest
  zapisywana jako sesja powiązana z prezentacją.
  Tekst podczas ćwiczenia zachowuje oryginalne podziały wierszy i puste linie.
  Domyślnie przewija się automatycznie zgodnie z postępem szacowanym z wykrytych sylab,
  bez przewijania podczas ciszy i kalibracji. Przełącznik na ekranie treningu pozwala wyłączyć
  tę funkcję; wybór jest zapamiętywany. Nie jest to rozpoznawanie wypowiadanych słów.
  Ręczne przewinięcie wyłącza automatyczne przewijanie i jego przełącznik. Ponowne włączenie
  przełącznika przywraca przewijanie do aktualnej szacowanej pozycji czytania.
  Licznik przy tekście i w raporcie pokazuje czas całej sesji (z pauzami i kalibracją mikrofonu),
  pozostały czas lub przekroczenie limitu. Raport zachowuje limit obowiązujący na początku próby;
  starsze sesje bez zapisanego limitu pokazują tylko czas trwania.
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
- **Pulpit**: biblioteka prezentacji z dodawaniem, edycją i uruchamianiem prób, a poniżej historia sesji.
  Kalibracja jest dostępna z nagłówka pulpitu. Dawny adres `/presentations` przekierowuje na pulpit.

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

Aplikacja wymaga **cross-origin isolation** (SharedArrayBuffer dla wielowątkowego WASM). Serwer deweloperski
i `preview` ustawiają nagłówki COOP/COEP; na hostingu statycznym trzeba je skonfigurować lub użyć
`coi-serviceworker`. Mikrofon działa tylko przez HTTPS lub na `localhost`.

Aplikacja używa adresów bez `#` (np. `/presentations`, `/presentations/<id>/rehearse`, `/session/<id>`). Na hostingu należy skonfigurować
fallback SPA (zwracanie `index.html` dla podstron); Vite robi to automatycznie.

## Prywatność

Całe przetwarzanie odbywa się lokalnie. Dane można usunąć w Ustawieniach → Dane.

## Debug

Dodaj `?debug=1` do adresu raportu (np. `/session/<id>?debug=1`), aby zobaczyć surowe dane i wyeksportować sesję
(JSON). Progi analizy są w `src/engine/thresholds.ts`.

## Struktura

```text
scripts/            kopiowanie zasobów WASM i VAD
src/audio/          mikrofon, worklet, VAD, analiza na żywo, dekodowanie
src/engine/         analiza: segmentacja, jądra sylab, frazy, pauzy, tempo, wskazówki
src/lib/            zapis i przeliczanie sesji, sygnał oddechu, motyw, etykiety
src/pages/          pulpit, prezentacje (lista, edytor, próba), kalibracja, raport, ustawienia
src/components/     HUD, raport, komponenty UI
src/data/           tekst kalibracyjny (treść autorska)
```
