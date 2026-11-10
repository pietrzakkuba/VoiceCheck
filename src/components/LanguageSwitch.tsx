import { Button } from '@/components/ui/button';
import { LANGS, LANGUAGE_NAMES, useT } from '@/i18n';
import { useSettings } from '@/store/settings';

/** Compact PL/EN switch for the app language. */
export function LanguageSwitch() {
  const lang = useSettings((s) => s.appLanguage);
  const set = useSettings((s) => s.set);
  const t = useT();

  return (
    <div role="group" aria-label={t.common.language.switcher} className="inline-flex h-9 rounded-full border border-border p-0.5">
      {LANGS.map((l) => (
        <Button
          key={l}
          type="button"
          size="sm"
          variant={l === lang ? 'secondary' : 'ghost'}
          className="h-full rounded-full px-2.5 text-xs"
          aria-pressed={l === lang}
          aria-label={LANGUAGE_NAMES[l]}
          title={LANGUAGE_NAMES[l]}
          lang={l}
          onClick={() => set({ appLanguage: l })}
        >
          {t.common.language.short[l]}
        </Button>
      ))}
    </div>
  );
}
