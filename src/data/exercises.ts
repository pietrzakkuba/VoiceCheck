import type { UnitCategory } from '@/types';

export type DictionCategory = Extract<UnitCategory, 'szumiace' | 'syczace' | 'ciszace' | 'nosowe'> | 'zbitki' | 'rl';

export interface DictionCategoryInfo {
  id: DictionCategory;
  label: string;
  sounds: string;
  tip: string;
}

export const DICTION_CATEGORIES: DictionCategoryInfo[] = [
  { id: 'szumiace', label: 'Szumiące', sounds: 'sz, ż/rz, cz, dż', tip: 'Zaokrąglij i lekko wysuń wargi, czubek języka unieś za dziąsła. Dźwięk ma być „szeroki” i ciemny.' },
  { id: 'syczace', label: 'Syczące', sounds: 's, z, c, dz', tip: 'Wargi rozciągnięte, czubek języka przy dolnych zębach. Strumień powietrza wąski i ostry.' },
  { id: 'ciszace', label: 'Ciszące', sounds: 'ś, ź, ć, dź (si, zi, ci, dzi)', tip: 'Środek języka unosi się do podniebienia, wargi lekko rozciągnięte – jak w uśmiechu.' },
  { id: 'nosowe', label: 'Nosowe', sounds: 'ą, ę', tip: 'Nie skracaj końcówek „-ą”, „-ę”. Na końcu wyrazu ą wymawiaj wyraźnie nosowo, ę – lekko.' },
  { id: 'zbitki', label: 'Zbitki spółgłoskowe', sounds: 'str, trz, wsz, źdź…', tip: 'Zwolnij i wymów każdą spółgłoskę zbitki osobno, potem stopniowo przyspieszaj.' },
  { id: 'rl', label: 'R / L / Ł', sounds: 'r, l, ł', tip: 'R – drgający czubek języka; L – język dotyka dziąseł; Ł – wargi zaokrąglone jak przy „u”.' },
];

export interface DictionExercise {
  id: string;
  category: DictionCategory;
  level: 1 | 2 | 3;
  text: string;
}

const ex = (category: DictionCategory, items: [1 | 2 | 3, string][]): DictionExercise[] =>
  items.map(([level, text], i) => ({ id: `${category}-${i + 1}`, category, level, text }));

/** 50 tongue twisters (8.5) – original texts written for ClearVoice AI. */
export const EXERCISES: DictionExercise[] = [
  ...ex('szumiace', [
    [1, 'Szary szczur szuka szyszek w szufladzie szafy.'],
    [1, 'Czarny czajnik czeka na czwartą czarną kawę.'],
    [1, 'Żaba żuje żółty żołądź na żwirowej dróżce.'],
    [2, 'Rzeczny rzemieślnik rzeźbi rzadkie rzeczy z brzozy.'],
    [2, 'Szewc szył szybko szesnaście szarych szelek.'],
    [2, 'Dżokej w dżinsowej kurtce je dżem w dżungli.'],
    [2, 'Czterej czytelnicy czytają czasopisma o czwartej.'],
    [3, 'Szczęśliwy szczygieł szczebiocze w szczelinie szopy.'],
    [3, 'Żelazny żuraw żegluje nad żółtym, żyznym żytem.'],
  ]),
  ...ex('syczace', [
    [1, 'Suchy sosnowy stół stoi samotnie w sadzie.'],
    [1, 'Zazdrosny zając zakopał zapasy za zagrodą.'],
    [1, 'Cenny cytrynowy cukier stoi na cynowej tacy.'],
    [2, 'Dzwonek dzwoni, dzwon odpowiada, a dzban stoi w kącie.'],
    [2, 'Senny sum sunie ospale po srebrnym stawie.'],
    [2, 'Zegar z zamku zawsze zaspał zaraz po zachodzie.'],
    [2, 'Cegły z cementowni celnik ceni najbardziej.'],
    [3, 'Sroka sprytnie skubie suche strąki soi.'],
    [3, 'Zuzanna zostawiła za zasłoną zeszyt z zadaniami.'],
  ]),
  ...ex('ciszace', [
    [1, 'Ciocia Zosia siedzi cicho w ciemnej sieni.'],
    [1, 'Śpiący ślimak ślizga się po śliskim liściu.'],
    [2, 'Źrebię zziębło w zimną, dżdżystą jesień.'],
    [2, 'Dziadek dziś dzieli dziesięć dziwnych dziupli.'],
    [1, 'Kasia nosi siatkę pełną świeżych śliwek.'],
    [2, 'Ćma ćwiczy ćwierć nocy przy cichej świecy.'],
    [2, 'Gęsi siedzą na sianie i ciągle się śmieją.'],
    [3, 'Ziewający Józio wiezie ziemniaki do zimnej ziemianki.'],
  ]),
  ...ex('nosowe', [
    [1, 'Wąsaty wąż wąchał wątłe pąki róż.'],
    [1, 'Gęś męczy się z ciężką, węzłowatą wędką.'],
    [1, 'Idę z ręką w kieszeni i mówię, że się spieszę.'],
    [2, 'Oni robią, piszą i śpiewają, bo bardzo tego chcą.'],
    [2, 'Mąka i męka to dwa zupełnie różne kłopoty.'],
    [2, 'Na zakręcie przędzarka zręcznie przędzie gęstą przędzę.'],
    [3, 'Wziął wędkę, sięgnął ręką i złapał zielonego węgorza.'],
    [3, 'Księżyc błądzi nad łąką, a dąb rzuca długi cień.'],
  ]),
  ...ex('zbitki', [
    [2, 'Pstrokaty pstrąg przepłynął przez wąską strugę.'],
    [2, 'Trzydziestu trzech strażników trzymało trzcinowe tarcze.'],
    [2, 'Wszczęto śledztwo w sprawie zmarzniętych drzwi.'],
    [2, 'Bezwzględny wróg wtargnął przez zgrzytliwe wrota.'],
    [3, 'Krnąbrny kmotr skrzętnie skrzyżował chrzęszczące gałęzie.'],
    [3, 'Źdźbło trawy drżało w zmrożonym zmierzchu.'],
    [1, 'Pstryknął przełącznik, a w przedpokoju zgrzytnęły drzwi.'],
    [3, 'Strzelec strzegł strzały w strzelistej strzelnicy.'],
  ]),
  ...ex('rl', [
    [1, 'Rosły rybak równo rozłożył rybackie sieci.'],
    [1, 'Lala Lucyny leży na lnianej pościeli.'],
    [2, 'Łysy łoś łazi łąką aż do łagodnego łuku rzeki.'],
    [1, 'Ryba, lis i łabędź razem ruszyli na lody.'],
    [2, 'Mała mara lata nad ramą rozbitego lustra.'],
    [2, 'Biały królik bardzo lubi rześkie, lipcowe powietrze.'],
    [2, 'Lokomotywa ryczy, lecz rusza leniwie z peronu.'],
    [3, 'Wróbel we Wrocławiu wróżył wronie z ręki.'],
  ]),
];

export const exerciseById = (id: string) => EXERCISES.find((e) => e.id === id);

export interface ReadingText {
  id: string;
  title: string;
  text: string;
}

/** Sample texts for Pacer and reading modes. */
export const READING_TEXTS: ReadingText[] = [
  {
    id: 'poranek',
    title: 'Poranek w mieście',
    text: 'Miasto budzi się powoli. Pierwsze tramwaje przejeżdżają przez puste skrzyżowania, a piekarze wyjmują z pieców świeże pieczywo. Na przystankach stoją zaspani ludzie z kubkami kawy. Za godzinę ulice wypełnią się samochodami, rowerami i gwarem rozmów. Teraz jednak słychać jeszcze ptaki, szum wiatru w koronach drzew i kroki pojedynczych przechodniów.',
  },
  {
    id: 'prezentacja',
    title: 'Fragment prezentacji',
    text: 'Dzień dobry, nazywam się Anna i chciałabym przedstawić wyniki naszego projektu. W ciągu sześciu miesięcy zespół przygotował nową wersję aplikacji, która skraca czas obsługi klienta o jedną trzecią. Najpierw opowiem o problemie, z którym się zmierzyliśmy. Następnie pokażę, jak go rozwiązaliśmy, a na końcu omówię plany na kolejny kwartał.',
  },
  {
    id: 'gory',
    title: 'Wędrówka w górach',
    text: 'Szlak prowadził stromo w górę, przez gęsty, świerkowy las. Po dwóch godzinach marszu drzewa zaczęły rzednąć, a przed nami otworzył się widok na szeroką dolinę. W oddali błyszczało jezioro, nad którym krążył jastrząb. Usiedliśmy na kamieniu, wyjęliśmy kanapki i przez chwilę nikt nic nie mówił. Cisza w górach ma w sobie coś, czego nie da się opisać słowami.',
  },
];
