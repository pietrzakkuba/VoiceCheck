import { useCallback } from 'react';
import { Alert, Label, Switch } from '@/components/ui/primitives';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useMobileLayout } from '@/hooks/useMobileLayout';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

/** Remembered desktop option with optional automatic locking on mobile. */
export function KeepScreenAwakeToggle({ active, className, wakeOnMobile = false }: { active: boolean; className?: string; wakeOnMobile?: boolean }) {
  const keepAwake = useSettings((s) => s.keepScreenAwake);
  const setSettings = useSettings((s) => s.set);
  const setKeepAwake = useCallback((keepScreenAwake: boolean) => setSettings({ keepScreenAwake }), [setSettings]);
  const mobile = useMobileLayout();
  const t = useT().audio.wakeLock;
  const status = useWakeLock(active && (mobile ? wakeOnMobile : keepAwake));

  if (mobile) {
    if (active && wakeOnMobile && (status === 'unsupported' || status === 'error')) {
      return <Alert variant="warn">{status === 'unsupported' ? t.unsupported : t.error}</Alert>;
    }
    return null;
  }

  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div>
        <Label htmlFor="keep-screen-awake">{t.label}</Label>
        <p id="keep-screen-awake-description" className="text-xs text-muted-foreground">
          {status === 'unsupported'
            ? t.unsupported
            : status === 'error'
              ? t.error
              : t.on}
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
