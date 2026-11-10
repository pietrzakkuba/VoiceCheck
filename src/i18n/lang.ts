export type Lang = 'pl' | 'en';

export const LANGS: readonly Lang[] = ['pl', 'en'];

export const LOCALES: Record<Lang, string> = { pl: 'pl-PL', en: 'en-GB' };

/** Language names in their own language (for pickers). */
export const LANGUAGE_NAMES: Record<Lang, string> = { pl: 'Polski', en: 'English' };

export function isLang(value: unknown): value is Lang {
  return value === 'pl' || value === 'en';
}

/** Polish for Polish-language browsers, English otherwise. */
export function detectLanguage(): Lang {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const preferred = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  if (!preferred.length) return 'pl';
  return preferred[0].toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

/** Polish plural form: 1 → one, 2–4 (not 12–14) → few, otherwise many. */
export function plPlural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

/** English plural form. */
export function enPlural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

/** Content stored before languages were introduced is Polish. */
export function langOf(item: { language?: Lang } | null | undefined): Lang {
  return item?.language ?? 'pl';
}
