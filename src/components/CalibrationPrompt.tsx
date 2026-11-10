import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Crosshair, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { getBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';
import { LANGUAGE_NAMES, useLang, useT, type Lang } from '@/i18n';

/** Onboarding hint shown at the top of the main tabs until the user calibrates or dismisses it. */
export function CalibrationPrompt({ lang }: { lang?: Lang } = {}) {
  const appLang = useLang();
  const t = useT();
  const language = lang ?? appLang;
  const baseline = useLiveQuery(() => getBaseline(language), [language], undefined);
  const { onboardingDismissed, set } = useSettings();
  if (baseline !== null || onboardingDismissed) return null;

  return (
    <Alert variant="info">
      <Crosshair className="size-4 mt-0.5" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">{language === appLang ? t.calibration.prompt.title : t.calibration.prompt.titleFor(LANGUAGE_NAMES[language])}</p>
        <p className="text-sm">{t.calibration.prompt.text}</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" asChild><Link to={`/calibration?lang=${language}`}>{t.calibration.prompt.go}</Link></Button>
          <Button size="sm" variant="ghost" onClick={() => set({ onboardingDismissed: true })}>{t.calibration.prompt.later}</Button>
        </div>
      </div>
      <Button size="icon" variant="ghost" onClick={() => set({ onboardingDismissed: true })} aria-label={t.calibration.prompt.close}><X className="size-4" /></Button>
    </Alert>
  );
}
