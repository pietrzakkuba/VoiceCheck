import { useEffect } from 'react';
import { getSettings, useSettings } from '@/store/settings';
import { LOCALES, type Lang } from './lang';
import * as common from './messages/common';
import * as nav from './messages/nav';
import * as audio from './messages/audio';
import * as calibration from './messages/calibration';
import * as presentations from './messages/presentations';
import * as sessions from './messages/sessions';
import * as report from './messages/report';
import * as settings from './messages/settings';
import * as pwa from './messages/pwa';
import * as ui from './messages/ui';

export * from './lang';

const namespaces = { common, nav, audio, calibration, presentations, sessions, report, settings, pwa, ui };

type Namespaces = typeof namespaces;
export type Messages = { [K in keyof Namespaces]: Namespaces[K]['pl'] };

function build(lang: Lang): Messages {
  return Object.fromEntries(Object.entries(namespaces).map(([k, ns]) => [k, ns[lang]])) as Messages;
}

const DICTIONARIES: Record<Lang, Messages> = { pl: build('pl'), en: build('en') };

export function messages(lang: Lang): Messages {
  return DICTIONARIES[lang];
}

/** Current app language outside React (e.g. error messages created in plain modules). */
export function getLang(): Lang {
  return getSettings().appLanguage;
}

export function getT(): Messages {
  return messages(getLang());
}

export function useLang(): Lang {
  return useSettings((s) => s.appLanguage);
}

export function useT(): Messages {
  return messages(useLang());
}

/** Keeps `<html lang>` in sync with the app language. */
export function useApplyLanguage() {
  const lang = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}

export function formatDate(timestamp: number, lang: Lang): string {
  return new Date(timestamp).toLocaleDateString(LOCALES[lang]);
}

export function formatDateTime(timestamp: number, lang: Lang): string {
  return new Date(timestamp).toLocaleString(LOCALES[lang]);
}

/** Fixed-precision number with the language's decimal separator ("4,5" in Polish, "4.5" in English). */
export function formatDecimal(value: number, digits: number, lang: Lang): string {
  const s = value.toFixed(digits);
  return lang === 'pl' ? s.replace('.', ',') : s;
}
