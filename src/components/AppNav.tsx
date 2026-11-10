import { Link, NavLink, useLocation } from 'react-router';
import { AudioLines, BookOpenText, Crosshair, History, Presentation, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/overlay';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { cn } from '@/lib/utils';

export type TabId = 'speaking' | 'presentations' | 'history';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const TABS: (NavItem & { id: TabId; short: string })[] = [
  { id: 'speaking', to: '/speaking', label: 'Swobodne mówienie', short: 'Mówienie', icon: BookOpenText },
  { id: 'presentations', to: '/presentations', label: 'Prezentacje', short: 'Prezentacje', icon: Presentation },
  { id: 'history', to: '/history', label: 'Historia', short: 'Historia', icon: History },
];

export const SECONDARY: NavItem[] = [
  { to: '/calibration', label: 'Kalibracja', icon: Crosshair },
  { to: '/settings', label: 'Ustawienia', icon: SettingsIcon },
];

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

export function activeTab(pathname: string): TabId | null {
  if (under(pathname, '/speaking')) return 'speaking';
  if (under(pathname, '/presentations')) return 'presentations';
  if (under(pathname, '/history') || pathname.startsWith('/session/')) return 'history';
  return null;
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold shrink-0">
      <AudioLines className="size-5 text-primary" aria-hidden />
      <span>Voice<span className="text-primary">Check</span></span>
    </Link>
  );
}

/** Top bar on phones: logo + secondary actions. Hidden on md+ where the sidebar takes over. */
export function MobileHeader() {
  return (
    <header className="app-mobile-header sticky top-0 z-40 border-b bg-background/90 backdrop-blur md:hidden">
      <div className="px-4 min-h-14 py-2 flex items-center gap-2">
        <Logo />
        <nav className="ml-auto flex items-center gap-1" aria-label="Narzędzia">
          {SECONDARY.map(({ to, label, icon: Icon }) => (
            <Tooltip key={to} content={label}>
              <NavLink
                to={to}
                aria-label={label}
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'icon' }),
                  'text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </NavLink>
            </Tooltip>
          ))}
          <ThemeSwitch />
        </nav>
      </div>
    </header>
  );
}

/** Fixed bottom tab bar on phones. */
export function BottomTabBar() {
  const current = activeTab(useLocation().pathname);
  return (
    <nav
      aria-label="Główna nawigacja"
      className="app-tabbar fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-3">
        {TABS.map(({ id, to, label, short, icon: Icon }) => {
          const active = current === id;
          return (
            <li key={id}>
              <Link
                to={to}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md pt-2 pb-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-16 items-center justify-center rounded-full transition-colors motion-reduce:transition-none',
                    active && 'bg-primary/15 text-primary',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span aria-hidden>{short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const sideItem =
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Sticky side navigation on md+ screens. */
export function Sidebar() {
  const current = activeTab(useLocation().pathname);
  return (
    <aside className="app-sidebar hidden md:flex sticky top-0 h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-card/60 px-3 py-5">
      <div className="px-3">
        <Logo />
      </div>
      <nav aria-label="Główna nawigacja">
        <ul className="space-y-1">
          {TABS.map(({ id, to, label, icon: Icon }) => {
            const active = current === id;
            return (
              <li key={id}>
                <Link
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    sideItem,
                    active
                      ? 'bg-accent text-foreground shadow-[inset_3px_0_0_var(--primary)]'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon className={cn('size-5', active && 'text-primary')} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto space-y-1 border-t pt-4">
        <nav aria-label="Narzędzia">
          <ul className="space-y-1">
            {SECONDARY.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={cn(
                    sideItem,
                    'text-muted-foreground hover:bg-accent/60 hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center justify-between px-3 pt-2 text-sm text-muted-foreground">
          <span>Motyw</span>
          <ThemeSwitch />
        </div>
      </div>
    </aside>
  );
}
