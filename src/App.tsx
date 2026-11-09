import { lazy, Suspense, useEffect } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { AudioLines, Crosshair, Loader2, Settings as SettingsIcon } from 'lucide-react';
import { Tooltip, TooltipProvider } from '@/components/ui/overlay';
import { buttonVariants } from '@/components/ui/button';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { useApplyTheme } from '@/lib/theme';
import { preloadVad } from '@/audio/capture';
import { migrateLegacySessions } from '@/lib/sessionPipeline';
import { cn } from '@/lib/utils';
import { PwaStatus } from '@/components/PwaStatus';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Calibration = lazy(() => import('@/pages/Calibration'));
const SessionReport = lazy(() => import('@/pages/SessionReport'));
const PresentationEditor = lazy(() => import('@/pages/PresentationEditor'));
const PresentationRehearsal = lazy(() => import('@/pages/PresentationRehearsal'));
const PresentationHistory = lazy(() => import('@/pages/PresentationHistory'));
const FreeSpeech = lazy(() => import('@/pages/FreeSpeech'));
const Settings = lazy(() => import('@/pages/Settings'));

const NAV = [
  { to: '/calibration', label: 'Kalibracja', icon: Crosshair },
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
            <nav className="ml-auto flex flex-wrap items-center justify-end gap-2" aria-label="Główna nawigacja">
              {NAV.map(({ to, label, icon: Icon }) => (
                <Tooltip key={to} content={label} className="sm:hidden">
                  <NavLink
                    to={to}
                    aria-label={label}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon' }),
                      'sm:w-auto sm:px-3 text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    <span className="hidden sm:inline">{label}</span>
                  </NavLink>
                </Tooltip>
              ))}
              <ThemeSwitch />
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">
          <PwaStatus />
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
              <Route path="/speaking" element={<FreeSpeech />} />
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
