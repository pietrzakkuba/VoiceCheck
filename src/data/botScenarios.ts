import { normalizeWords } from '@/engine/normalize';

export interface FollowUpRule {
  /** Word stems (lower case, normalized) that trigger the follow-up. */
  keywords: string[];
  question: string;
}

export interface BotScenario {
  id: string;
  title: string;
  description: string;
  intro: string;
  questions: string[];
  followUps: FollowUpRule[];
  closing: string;
}

/** Bot conversation scenarios (8.2) with a rule-based follow-up engine. */
export const BOT_SCENARIOS: BotScenario[] = [
  {
    id: 'interview',
    title: 'Rozmowa kwalifikacyjna',
    description: 'Typowe pytania rekrutera. Ćwicz zwięzłe, uporządkowane odpowiedzi w spokojnym tempie.',
    intro: 'Dzień dobry, dziękuję, że znalazł pan lub znalazła pani czas na rozmowę.',
    questions: [
      'Proszę opowiedzieć coś o sobie i swoim doświadczeniu zawodowym.',
      'Dlaczego interesuje pana lub panią to stanowisko?',
      'Jakie jest pana lub pani największe osiągnięcie zawodowe?',
      'Proszę opisać sytuację, w której musiał pan lub musiała pani rozwiązać trudny problem.',
      'Jak pan lub pani radzi sobie ze stresem i presją czasu?',
      'Gdzie widzi się pan lub pani za pięć lat?',
    ],
    followUps: [
      { keywords: ['zespo', 'team', 'współprac'], question: 'Wspomniał pan lub wspomniała pani o pracy zespołowej. Jaką rolę zwykle przyjmuje pan lub pani w zespole?' },
      { keywords: ['konflikt', 'kłót', 'spór'], question: 'Jak doszło do rozwiązania tego konfliktu i czego się pan lub pani z niego nauczyła?' },
      { keywords: ['projekt'], question: 'Proszę opowiedzieć dokładniej o tym projekcie. Jaki był jego najtrudniejszy moment?' },
      { keywords: ['kierow', 'zarządza', 'lider', 'menedż'], question: 'Ile osób było w zespole, którym pan lub pani kierowała, i jak motywował pan lub motywowała pani ludzi?' },
      { keywords: ['błąd', 'błęd', 'porażk', 'pomył'], question: 'Co zrobiłby pan lub zrobiłaby pani dziś inaczej w tamtej sytuacji?' },
      { keywords: ['klient'], question: 'Jak wygląda pana lub pani podejście do trudnego klienta?' },
      { keywords: ['nauk', 'kurs', 'studi', 'szkoleń', 'szkoleni'], question: 'Czego nowego nauczył się pan lub nauczyła się pani w ostatnim roku?' },
    ],
    closing: 'Dziękuję za rozmowę. To wszystkie moje pytania.',
  },
  {
    id: 'project',
    title: 'Prezentacja projektu',
    description: 'Przedstaw projekt jak na spotkaniu z zarządem. Pilnuj pauz między myślami.',
    intro: 'Witam. Mamy kilka minut, proszę przedstawić swój projekt.',
    questions: [
      'Jaki problem rozwiązuje pana lub pani projekt?',
      'Kto jest odbiorcą tego rozwiązania i dlaczego go potrzebuje?',
      'Jak wygląda plan wdrożenia na najbliższe miesiące?',
      'Jakie widzi pan lub pani największe ryzyka?',
      'Ile to będzie kosztować i kiedy inwestycja się zwróci?',
    ],
    followUps: [
      { keywords: ['koszt', 'budżet', 'pieniąd', 'złot', 'cen'], question: 'Skąd pochodzą te szacunki kosztów i jaki jest margines błędu?' },
      { keywords: ['konkuren'], question: 'Czym dokładnie wyróżniacie się na tle konkurencji?' },
      { keywords: ['technolog', 'aplikac', 'system', 'oprogramowa'], question: 'Dlaczego wybraliście właśnie tę technologię?' },
      { keywords: ['ryzyk', 'zagroż', 'problem'], question: 'Jaki jest plan awaryjny, jeśli to ryzyko się zmaterializuje?' },
      { keywords: ['użytkown', 'klient', 'odbiorc'], question: 'Czy rozmawialiście już z przyszłymi użytkownikami? Co powiedzieli?' },
      { keywords: ['termin', 'miesiąc', 'kwartał', 'tydzień', 'tygodn'], question: 'Czy ten harmonogram jest realny? Co może go opóźnić?' },
    ],
    closing: 'Dziękuję, to była ciekawa prezentacja.',
  },
  {
    id: 'story',
    title: 'Opowiadanie historii',
    description: 'Opowiedz anegdotę lub wspomnienie. Ćwicz zmienną melodię i pauzy budujące napięcie.',
    intro: 'Cześć! Mam ochotę posłuchać dobrej historii.',
    questions: [
      'Opowiedz o najciekawszej podróży, jaką pamiętasz.',
      'Jaka sytuacja z dzieciństwa najbardziej utkwiła ci w pamięci?',
      'Opowiedz o momencie, w którym coś poszło zupełnie nie tak, jak planowałeś lub planowałaś.',
      'Kto jest dla ciebie inspiracją i dlaczego?',
      'Opisz najlepszy dzień w ostatnim roku.',
    ],
    followUps: [
      { keywords: ['podróż', 'wyjazd', 'wakacj', 'urlop'], question: 'Co najbardziej zaskoczyło cię w tym miejscu?' },
      { keywords: ['przyjaci', 'kolega', 'koleżank', 'znajom'], question: 'Jak ta osoba zareagowała? Utrzymujecie jeszcze kontakt?' },
      { keywords: ['rodzin', 'mam', 'tat', 'babci', 'dziadk', 'brat', 'siostr'], question: 'Jak twoja rodzina wspomina tę sytuację dzisiaj?' },
      { keywords: ['strach', 'bał', 'przestrasz', 'niebezpiecz'], question: 'Co czułeś lub czułaś w tamtej chwili i jak sobie z tym poradziłeś lub poradziłaś?' },
      { keywords: ['śmiesz', 'zabaw', 'śmiech', 'śmia'], question: 'Brzmi zabawnie! Co było potem?' },
    ],
    closing: 'Dzięki, świetnie się słuchało!',
  },
  {
    id: 'debate',
    title: 'Debata',
    description: 'Broń swojego stanowiska. Mów pewnie, wyraźnie akcentuj argumenty i nie przyspieszaj pod presją.',
    intro: 'Zaczynamy debatę. Proszę zająć stanowisko i uzasadnić je argumentami.',
    questions: [
      'Czy praca zdalna powinna stać się standardem w biurach? Proszę uzasadnić.',
      'Czy media społecznościowe bardziej pomagają, czy szkodzą młodym ludziom?',
      'Czy sztuczna inteligencja powinna być wykorzystywana w szkołach?',
      'Czy samochody spalinowe powinny zniknąć z centrów miast?',
      'Czy czterodniowy tydzień pracy to dobry pomysł?',
    ],
    followUps: [
      { keywords: ['badani', 'statystyk', 'procent', 'dane'], question: 'Na jakie konkretnie badania się pan lub pani powołuje?' },
      { keywords: ['zawsze', 'nigdy', 'wszyscy', 'nikt'], question: 'To bardzo mocne uogólnienie. Czy nie ma od tego wyjątków?' },
      { keywords: ['koszt', 'pieniąd', 'gospodar', 'ekonom'], question: 'A kto poniesie te koszty? Proszę odnieść się do kontrargumentu ekonomicznego.' },
      { keywords: ['bezpiecz', 'zdrow'], question: 'Jak odpowiedziałby pan lub odpowiedziałaby pani komuś, kto twierdzi, że to przesadzone obawy?' },
      { keywords: ['uważam', 'myślę', 'sądzę', 'wydaje'], question: 'Rozumiem pana lub pani opinię. Jaki jest najmocniejszy argument strony przeciwnej?' },
    ],
    closing: 'Dziękuję, to była bardzo dobra wymiana argumentów.',
  },
];

export const GENERIC_FOLLOW_UPS = [
  'Czy może pan lub pani podać konkretny przykład?',
  'Proszę rozwinąć tę myśl.',
  'Co z tego wynika w praktyce?',
];

/**
 * Picks the next bot question: a keyword-triggered follow-up (once per rule, max one in a row),
 * otherwise the next scenario question. Returns null when the conversation is over.
 */
export function nextBotQuestion(
  sc: BotScenario,
  state: { questionIndex: number; usedFollowUps: number[]; lastWasFollowUp: boolean },
  lastAnswer: string,
): { question: string; followUp: number | null; questionIndex: number } | null {
  if (lastAnswer && !state.lastWasFollowUp) {
    const words = normalizeWords(lastAnswer);
    for (let i = 0; i < sc.followUps.length; i++) {
      if (state.usedFollowUps.includes(i)) continue;
      const hit = sc.followUps[i].keywords.some((k) => words.some((w) => w.startsWith(k)));
      if (hit) return { question: sc.followUps[i].question, followUp: i, questionIndex: state.questionIndex };
    }
    // Very short answer → ask for more detail.
    if (words.length > 0 && words.length < 12) {
      return { question: GENERIC_FOLLOW_UPS[state.questionIndex % GENERIC_FOLLOW_UPS.length], followUp: -1, questionIndex: state.questionIndex };
    }
  }
  const next = state.questionIndex + 1;
  if (next >= sc.questions.length) return null;
  return { question: sc.questions[next], followUp: null, questionIndex: next };
}
