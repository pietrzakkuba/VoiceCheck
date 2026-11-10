import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Crosshair, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { getBaseline } from '@/store/db';
import { useSettings } from '@/store/settings';

/** Onboarding hint shown at the top of the main tabs until the user calibrates or dismisses it. */
export function CalibrationPrompt() {
  const baseline = useLiveQuery(() => getBaseline(), [], undefined);
  const { onboardingDismissed, set } = useSettings();
  if (baseline !== null || onboardingDismissed) return null;

  return (
    <Alert variant="info">
      <Crosshair className="size-4 mt-0.5" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">Zacznij od kalibracji</p>
        <p className="text-sm">Minuta czytania pozwoli dokładniej mierzyć tempo Twojej mowy na Twoim mikrofonie.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" asChild><Link to="/calibration">Przejdź do kalibracji</Link></Button>
          <Button size="sm" variant="ghost" onClick={() => set({ onboardingDismissed: true })}>Później</Button>
        </div>
      </div>
      <Button size="icon" variant="ghost" onClick={() => set({ onboardingDismissed: true })} aria-label="Zamknij"><X className="size-4" /></Button>
    </Alert>
  );
}
