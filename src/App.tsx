import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Loader2 } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/overlay';
import { BottomTabBar, MobileHeader, Sidebar } from '@/components/AppNav';
import { useApplyTheme } from '@/lib/theme';
import { preloadVad } from '@/audio/capture';
import { migrateLegacySessions } from '@/lib/sessionPipeline';
import { PwaStatus } from '@/components/PwaStatus';

const Presentations = lazy(() => import('@/pages/Presentations'));
const History = lazy(() => import('@/pages/History'));
const Calibration = lazy(() => import('@/pages/Calibration'));
const SessionReport = lazy(() => import('@/pages/SessionReport'));
const PresentationEditor = lazy(() => import('@/pages/PresentationEditor'));
const PresentationRehearsal = lazy(() => import('@/pages/PresentationRehearsal'));
const PresentationHistory = lazy(() => import('@/pages/PresentationHistory'));
const FreeSpeech = lazy(() => import('@/pages/FreeSpeech'));
const Settings = lazy(() => import('@/pages/Settings'));

const home = <Navigate to="/speaking" replace />;

export default function App() {
  useApplyTheme();
  useEffect(() => {
    void preloadVad().then(() => migrateLegacySessions());
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-dvh md:flex">
        <Sidebar />
        <div className="app-column flex min-h-dvh min-w-0 flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
          <MobileHeader />
          <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
            <PwaStatus />
            <Suspense
              fallback={
                <div className="flex justify-center py-20 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin" aria-label="Ładowanie" />
                </div>
              }
            >
              <Routes>
                <Route path="/" element={home} />
                <Route path="/dashboard" element={home} />
                <Route path="/calibration" element={<Calibration />} />
                <Route path="/presentations" element={<Presentations />} />
                <Route path="/presentations/:id" element={<PresentationEditor />} />
                <Route path="/presentations/:id/rehearse" element={<PresentationRehearsal />} />
                <Route path="/presentations/:id/history" element={<PresentationHistory />} />
                <Route path="/reading" element={home} />
                <Route path="/speaking" element={<FreeSpeech />} />
                <Route path="/history" element={<History />} />
                <Route path="/session/:id" element={<SessionReport />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={home} />
              </Routes>
            </Suspense>
          </main>
          <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
            VoiceCheck · cała analiza odbywa się lokalnie w przeglądarce – nagrania nie opuszczają urządzenia.
          </footer>
        </div>
        <BottomTabBar />
      </div>
    </TooltipProvider>
  );
}
