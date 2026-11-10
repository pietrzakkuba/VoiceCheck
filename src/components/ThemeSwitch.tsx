import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSettings } from '@/store/settings';
import { useT } from '@/i18n';

const query = '(prefers-color-scheme: dark)';
const getSystemDark = () => window.matchMedia(query).matches;
const getServerDark = () => false;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function ThemeSwitch({ id }: { id?: string }) {
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const t = useT().settings;
  const systemDark = useSyncExternalStore(subscribe, getSystemDark, getServerDark);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);

  return (
    <Button
      id={id}
      type="button"
      role="switch"
      aria-label={t.darkTheme}
      aria-checked={dark}
      title={dark ? t.enableLight : t.enableDark}
      variant="outline"
      className="relative h-9 w-18 rounded-full p-0"
      onClick={() => set({ theme: dark ? 'light' : 'dark' })}
    >
      <span
        aria-hidden
        className={cn(
          'absolute left-1 size-7 rounded-full bg-accent shadow-sm transition-transform motion-reduce:transition-none',
          dark && 'translate-x-9',
        )}
      />
      <Sun aria-hidden className={cn('absolute left-2.5 size-4', dark ? 'text-muted-foreground' : 'text-foreground')} />
      <Moon aria-hidden className={cn('absolute right-2.5 size-4', dark ? 'text-foreground' : 'text-muted-foreground')} />
    </Button>
  );
}
