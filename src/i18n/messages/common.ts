import { LANGUAGE_NAMES } from '../lang';

export const pl = {
  home: 'Strona główna',
  loading: 'Ładowanie',
  modes: {
    calibration: 'Kalibracja',
    presentation: 'Próba prezentacji',
    reading: 'Czytanie tekstu',
    free_speech: 'Swobodne mówienie',
  },
  language: {
    names: LANGUAGE_NAMES,
    short: { pl: 'PL', en: 'EN' },
    app: 'Język aplikacji',
    appHint: 'Język interfejsu. Nowe prezentacje i swobodne mówienie domyślnie używają tego samego języka.',
    switcher: 'Język aplikacji',
    presentation: 'Język prezentacji',
    presentationHint: 'Wpływa na liczenie sylab, szacowany czas czytania i kalibrację używaną podczas próby.',
    speech: 'Język wypowiedzi',
    speechHint: 'Pomiar tempa użyje kalibracji dla tego języka.',
    calibration: 'Język kalibracji',
    calibrationHint: 'Każdy język ma osobny tekst i osobny wynik kalibracji.',
    session: (name: string) => `język: ${name}`,
  },
};

export const en: typeof pl = {
  home: 'Home',
  loading: 'Loading',
  modes: {
    calibration: 'Calibration',
    presentation: 'Presentation rehearsal',
    reading: 'Text reading',
    free_speech: 'Free speaking',
  },
  language: {
    names: LANGUAGE_NAMES,
    short: { pl: 'PL', en: 'EN' },
    app: 'App language',
    appHint: 'Interface language. New presentations and free speaking use the same language by default.',
    switcher: 'App language',
    presentation: 'Presentation language',
    presentationHint: 'Affects syllable counting, the estimated reading time and the calibration used while rehearsing.',
    speech: 'Speech language',
    speechHint: 'Pace measurement will use the calibration for this language.',
    calibration: 'Calibration language',
    calibrationHint: 'Each language has its own text and its own calibration result.',
    session: (name: string) => `language: ${name}`,
  },
};
