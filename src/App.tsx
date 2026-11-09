import { lazy, Suspense, useEffect } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { AudioLines, LayoutDashboard, Loader2, Settings as SettingsIcon } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/overlay';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { useApplyTheme } from '@/lib/theme';
import { preloadVad } from '@/audio/capture';
import { migrateLegacySessions } from '@/lib/sessionPipeline';
import { cn } from '@/lib/utils';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Calibration = lazy(() => import('@/pages/Calibration'));
const SessionReport = lazy(() => import('@/pages/SessionReport'));
const PresentationEditor = lazy(() => import('@/pages/PresentationEditor'));
const PresentationRehearsal = lazy(() => import('@/pages/PresentationRehearsal'));
const PresentationHistory = lazy(() => import('@/pages/PresentationHistory'));
const Settings = lazy(() => import('@/pages/Settings'));

const NAV = [
  { to: '/', label: 'Pulpit', icon: LayoutDashboard, end: true },
  { to: '/settings', label: 'Ustawienia', icon: SettingsIcon },
];

export default function App() {
  useApplyTheme();
  useEffect(() => {
    void preloadVad().then(() => migrateLegacySessions());
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 min-h-14 py-2 flex flex-wrap items-center gap-4">
            <NavLink to="/" className="flex items-center gap-2 font-semibold shrink-0">
              <AudioLines className="size-5 text-primary" aria-hidden />
              <span>Voice<span className="text-primary">Check</span></span>
            </NavLink>
            <nav className="order-last w-full min-w-0 flex items-center gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1" aria-label="Główna nawigacja">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors',
                      isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
                    )
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  <span className="hidden md:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <ThemeSwitch />
            </div>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">
          <Suspense
            fallback={
              <div className="flex justify-center py-20 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" aria-label="Ładowanie" />
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/calibration" element={<Calibration />} />
              <Route path="/presentations" element={<Navigate to="/" replace />} />
              <Route path="/presentations/:id" element={<PresentationEditor />} />
              <Route path="/presentations/:id/rehearse" element={<PresentationRehearsal />} />
              <Route path="/presentations/:id/history" element={<PresentationHistory />} />
              <Route path="/reading" element={<Navigate to="/" replace />} />
              <Route path="/speaking" element={<Navigate to="/" replace />} />
              <Route path="/session/:id" element={<SessionReport />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t py-4 text-center text-xs text-muted-foreground">
          VoiceCheck · cała analiza odbywa się lokalnie w przeglądarce – nagrania nie opuszczają urządzenia.
        </footer>
      </div>
    </TooltipProvider>
  );
}
