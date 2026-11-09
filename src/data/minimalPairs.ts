import type { DictionCategory } from './exercises';

export interface MinimalPairSet {
  id: string;
  category: DictionCategory;
  /** Contrasted series, e.g. "sz – s – ś". */
  contrast: string;
  words: string[];
  hint: string;
}

/** Minimal pairs / triplets for distinguishing Polish sibilant series and other contrasts (8.5). */
export const MINIMAL_PAIRS: MinimalPairSet[] = [
  { id: 'mp-kasza', category: 'szumiace', contrast: 'sz – s – ś', words: ['kasza', 'kasa', 'Kasia'], hint: 'Szumiące: wargi do przodu. Syczące: uśmiech. Ciszące: środek języka wysoko.' },
  { id: 'mp-szyje', category: 'szumiace', contrast: 'sz – s – ś', words: ['szyje', 'syje', 'sieje'], hint: 'Ten sam rytm, różne ustawienie języka. Przesadź ruch warg.' },
  { id: 'mp-kosy', category: 'szumiace', contrast: 'sz – s – ś', words: ['koszy', 'kosy', 'kosi'], hint: 'Zwróć uwagę na samogłoskę po spółgłosce: y w „koszy”, „kosy”, i w „kosi”.' },
  { id: 'mp-szok', category: 'szumiace', contrast: 'sz – s', words: ['szok', 'sok'], hint: 'Szumiące są niższe i ciemniejsze, syczące – wysokie i ostre.' },
  { id: 'mp-kosz', category: 'szumiace', contrast: 'sz – s', words: ['kosz', 'kos'], hint: 'Końcowa spółgłoska musi być słyszalna – nie urywaj wyrazu.' },
  { id: 'mp-wies', category: 'ciszace', contrast: 'ś – sz', words: ['wieś', 'wiesz'], hint: 'Ś miękkie, z uśmiechem; SZ twarde, z wargami do przodu.' },
  { id: 'mp-paczka', category: 'szumiace', contrast: 'cz – c', words: ['paczka', 'packa'], hint: 'CZ zaczyna się jak T i przechodzi w SZ; C – w S.' },
  { id: 'mp-taczka', category: 'szumiace', contrast: 'cz – c', words: ['taczka', 'tacka'], hint: 'Wydłuż na chwilę szumiący element w „taczka”.' },
  { id: 'mp-czar', category: 'szumiace', contrast: 'cz – c', words: ['czar', 'car'], hint: 'Po spółgłosce samogłoska „a” ma brzmieć tak samo w obu słowach.' },
  { id: 'mp-bic', category: 'ciszace', contrast: 'ć – cz', words: ['bić', 'bicz'], hint: 'Końcowe ć jest krótkie i miękkie, cz – twardsze.' },
  { id: 'mp-ci', category: 'ciszace', contrast: 'ci – czy', words: ['ci', 'czy'], hint: 'W „ci” język unosi się środkiem, w „czy” czubkiem.' },
  { id: 'mp-ciesz', category: 'ciszace', contrast: 'ci – cz', words: ['ciesz', 'czesz'], hint: 'Wymawiaj powoli, a potem coraz szybciej, zachowując różnicę.' },
  { id: 'mp-zebra', category: 'syczace', contrast: 'ż – z', words: ['żebra', 'zebra'], hint: 'Ż dźwięczne i ciemne, Z dźwięczne i jasne.' },
  { id: 'mp-waze', category: 'syczace', contrast: 'ż – z', words: ['ważę', 'wazę'], hint: 'Pamiętaj też o nosowym ę na końcu.' },
  { id: 'mp-kozy', category: 'ciszace', contrast: 'z – ź', words: ['kozy', 'kozi'], hint: 'Zi = ź: środek języka wysoko.' },
  { id: 'mp-maka', category: 'nosowe', contrast: 'ą – ę', words: ['mąka', 'męka'], hint: 'Ą brzmi jak nosowe „o”, Ę jak nosowe „e”.' },
  { id: 'mp-kat', category: 'nosowe', contrast: 'ą – o', words: ['kąt', 'kot'], hint: 'Rezonans nosowy musi być słyszalny.' },
  { id: 'mp-was', category: 'nosowe', contrast: 'ą – a', words: ['wąs', 'was'], hint: 'Nie zamieniaj ą na zwykłe o ani a.' },
  { id: 'mp-robia', category: 'nosowe', contrast: '-ą – -ę', words: ['robią', 'robię'], hint: 'Końcówka decyduje o znaczeniu – nie połykaj jej.' },
  { id: 'mp-ida', category: 'nosowe', contrast: '-ą – -ę', words: ['idą', 'idę'], hint: 'Wymów końcówkę wyraźnie, nawet jeśli mówisz szybko.' },
  { id: 'mp-rak', category: 'rl', contrast: 'r – l', words: ['rak', 'lak'], hint: 'R drga, L jest płynne i ciągłe.' },
  { id: 'mp-rok', category: 'rl', contrast: 'r – l', words: ['rok', 'lok'], hint: 'Postaw czubek języka za górnymi zębami w obu słowach.' },
  { id: 'mp-rama', category: 'rl', contrast: 'r – l', words: ['rama', 'lama'], hint: 'Jedno uderzenie języka wystarczy dla polskiego R.' },
  { id: 'mp-pora', category: 'rl', contrast: 'r – l', words: ['pora', 'pola'], hint: 'Różnica w środku wyrazu jest trudniejsza – zwolnij.' },
  { id: 'mp-lawa', category: 'rl', contrast: 'ł – l', words: ['ława', 'lawa'], hint: 'Ł – wargi zaokrąglone jak przy „u”, L – język przy dziąsłach.' },
  { id: 'mp-luk', category: 'rl', contrast: 'ł – l', words: ['łuk', 'luk'], hint: 'Nie zamieniaj ł na l (ani odwrotnie).' },
  { id: 'mp-mara', category: 'rl', contrast: 'r – ł', words: ['mara', 'mała'], hint: 'R wibruje, Ł brzmi jak krótkie u.' },
  { id: 'mp-trzy', category: 'zbitki', contrast: 'trz – cz', words: ['trzy', 'czy'], hint: 'W „trzy” są dwie głoski: t + sz. Nie zlewaj ich w cz.' },
  { id: 'mp-strzal', category: 'zbitki', contrast: 'strz – sz', words: ['strzał', 'szał'], hint: 'Wymów każdą spółgłoskę zbitki: s-t-sz.' },
];
