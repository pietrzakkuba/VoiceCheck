# CzystaMowa

Trener tempa mówienia i oddechu po polsku. Działa w całości w przeglądarce, bez modeli AI – nagrania i historia
sesji nie opuszczają komputera.

## Funkcje

- **Na żywo podczas nagrania**: prędkościomierz tempa (sylaby/s i słowa/min), pasek oddechu, przebieg fali,
  ostrzeżenia o szumie i przesterowaniu. Po przekroczeniu limitu mówienia bez oddechu aplikacja odtwarza krótki
  dźwięk (i wibrację na telefonie).
  W trybie czytania kolorowa ramka tekstu i przypięty nad nim status tempa pozwalają śledzić tempo bez odrywania
  wzroku od treści.
- **Tryby**: czytanie tekstu (15 gotowych tekstów lub własny), swobodne mówienie (podpowiedzi tematów, nagranie
  kończy przycisk „Skończyłem”), kalibracja.
- **Raport sesji**: tempo mowy, liczba oddechów, najdłuższa fraza bez oddechu, krótkie wskazówki z odsłuchem
  fragmentu, oś czasu (fale, frazy i pauzy oddechowe, tempo każdej frazy) oraz tabela fraz.
- **Pulpit**: trendy tempa i najdłuższej frazy, historia sesji.

## Jak to działa

| Warstwa | Technologia |
|---|---|
| UI | Vite, React 19, TypeScript, Tailwind v4, react-router |
| Stan / dane | Zustand (ustawienia w `localStorage`), Dexie / IndexedDB (sesje i nagrania) |
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

Aplikacja używa adresów bez `#` (np. `/reading`, `/speaking`, `/session/<id>`). Na hostingu należy skonfigurować
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
src/pages/          pulpit, czytanie, swobodne mówienie, kalibracja, raport, ustawienia
src/components/     HUD, raport, komponenty UI
src/data/           teksty do czytania i tekst kalibracyjny (treści autorskie)
```
