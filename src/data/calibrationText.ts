import type { Lang } from '@/i18n/lang';

/**
 * Calibration texts, ~60 s of natural reading each. Their known syllable counts let the app
 * correct the acoustic syllable detector for this user's voice and microphone.
 */
export const CALIBRATION_TEXTS: Record<Lang, string> = {
  pl:
    'Każdego ranka Zosia jedzie rowerem nad rzekę. Mija szkołę, cichy park i stary młyn, ' +
    'w którym dawniej mielono mąkę. Na moście zatrzymuje się na chwilę, bo lubi patrzeć, ' +
    'jak słońce wschodzi nad łąką. Czasem widzi czaplę, czasem sarnę, a raz zobaczyła nawet lisa. ' +
    'Wiatr szumi w trzcinach, w oddali dzwoni dzwon, a ptaki śpiewają coraz głośniej. ' +
    'Zosia wyjmuje z plecaka zeszyt i zapisuje wszystko, co zauważyła. ' +
    'Potem spokojnie wraca do domu, gdzie czeka na nią ciepła herbata i świeży chleb z masłem. ' +
    'Po śniadaniu siada przy biurku i przegląda notatki. Szuka w książkach nazw roślin i zwierząt, ' +
    'które spotkała po drodze. Jej młodszy brat, Jerzy, śmieje się, że siostra zna już więcej gatunków ptaków ' +
    'niż niejeden profesor. Zosia odpowiada, że to dopiero początek, bo w przyszłym tygodniu ' +
    'zamierza wstać jeszcze wcześniej i dojść pieszo aż do źródła strumienia.',
  en:
    'Every morning, Emma rides her bike down to the river. She passes the school, a quiet park and an old mill ' +
    'where people once ground flour. On the bridge she stops for a moment, because she likes to watch ' +
    'the sun rise over the meadow. Sometimes she sees a heron, sometimes a deer, and once she even spotted a fox. ' +
    'The wind rustles through the reeds, a bell rings in the distance, and the birds sing louder and louder. ' +
    'Emma takes a notebook out of her backpack and writes down everything she has noticed. ' +
    'Then she calmly heads back home, where a cup of hot tea and fresh bread with butter are waiting for her. ' +
    'After breakfast she sits at her desk and reads through her notes. She looks up the names of the plants and animals ' +
    'she met along the way. Her younger brother, George, laughs that his sister already knows more kinds of birds ' +
    'than many a professor. Emma replies that this is only the beginning, because next week ' +
    'she plans to get up even earlier and walk all the way to the source of the stream.',
};

/** Polish calibration text (kept for backwards compatibility). */
export const CALIBRATION_TEXT = CALIBRATION_TEXTS.pl;
