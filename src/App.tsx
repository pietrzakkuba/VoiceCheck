import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router';
import { AudioLines, BookOpenText, Gauge, LayoutDashboard, Loader2, MessagesSquare, Settings as SettingsIcon, SpellCheck } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/overlay';
import { ModelStatus } from '@/components/ModelStatus';
import { useApplyTheme } from '@/lib/theme';
import { initModels } from '@/workers/client';
import { preloadVad } from '@/audio/capture';
import { cn } from '@/lib/utils';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Calibration = lazy(() => import('@/pages/Calibration'));
const TrainReading = lazy(() => import('@/pages/TrainReading'));
const TrainPacer = lazy(() => import('@/pages/TrainPacer'));
const TrainDiction = lazy(() => import('@/pages/TrainDiction'));
const TrainBot = lazy(() => import('@/pages/TrainBot'));
const SessionReport = lazy(() => import('@/pages/SessionReport'));
const Settings = lazy(() => import('@/pages/Settings'));

const NAV = [
  { to: '/', label: 'Pulpit', icon: LayoutDashboard, end: true },
  { to: '/reading', label: 'Czytanie', icon: BookOpenText },
  { to: '/pacer', label: 'Pacer', icon: Gauge },
  { to: '/diction', label: 'Dykcja', icon: SpellCheck },
  { to: '/bot', label: 'Rozmowa', icon: MessagesSquare },
  { to: '/settings', label: 'Ustawienia', icon: SettingsIcon },
];

export default function App() {
  useApplyTheme();
  useEffect(() => {
    void initModels();
    void preloadVad();
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4">
            <NavLink to="/" className="flex items-center gap-2 font-semibold shrink-0">
              <AudioLines className="size-5 text-primary" aria-hidden />
              <span>ClearVoice<span className="text-primary"> AI</span></span>
            </NavLink>
            <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Główna nawigacja">
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
            <div className="ml-auto shrink-0">
              <ModelStatus />
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
              <Route path="/reading" element={<TrainReading />} />
              <Route path="/pacer" element={<TrainPacer />} />
              <Route path="/diction" element={<TrainDiction />} />
              <Route path="/bot" element={<TrainBot />} />
              <Route path="/session/:id" element={<SessionReport />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t py-4 text-center text-xs text-muted-foreground">
          ClearVoice AI · cała analiza odbywa się lokalnie w przeglądarce – nagrania nie opuszczają urządzenia.
        </footer>
      </div>
    </TooltipProvider>
  );
}
