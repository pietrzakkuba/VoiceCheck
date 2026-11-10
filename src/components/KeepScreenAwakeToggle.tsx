import { useCallback } from 'react';
import { Label, Switch } from '@/components/ui/primitives';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useMobileLayout } from '@/hooks/useMobileLayout';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/utils';

/** Remembered desktop option; holds a screen wake lock while `active`. */
export function KeepScreenAwakeToggle({ active, className }: { active: boolean; className?: string }) {
  const keepAwake = useSettings((s) => s.keepScreenAwake);
  const setSettings = useSettings((s) => s.set);
  const setKeepAwake = useCallback((keepScreenAwake: boolean) => setSettings({ keepScreenAwake }), [setSettings]);
  const mobile = useMobileLayout();
  const status = useWakeLock(active && keepAwake && !mobile);

  if (mobile) return null;

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div>
        <Label htmlFor="keep-screen-awake">Nie wygaszaj ekranu</Label>
        <p id="keep-screen-awake-description" className="text-xs text-muted-foreground">
          {status === 'unsupported'
            ? 'Ta przeglądarka nie obsługuje blokady wygaszania ekranu.'
            : status === 'error'
              ? 'Nie udało się zablokować wygaszania ekranu (np. tryb oszczędzania baterii).'
              : 'Ekran pozostaje włączony podczas nagrywania.'}
        </p>
      </div>
      <Switch
        id="keep-screen-awake"
        checked={keepAwake && status !== 'unsupported'}
        onCheckedChange={setKeepAwake}
        disabled={status === 'unsupported'}
        aria-describedby="keep-screen-awake-description"
      />
    </div>
  );
}
