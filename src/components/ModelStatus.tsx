import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/overlay';
import { Progress, NativeSelect } from '@/components/ui/primitives';
import { Tooltip } from '@/components/ui/overlay';
import { loadModels, useModelStore } from '@/workers/client';
import { TIERS, tierSizeMb } from '@/workers/models';
import { useSettings } from '@/store/settings';
import { reanalyzePending, useReanalysis } from '@/lib/analysisPipeline';
import type { ModelTier } from '@/types';

/** Non-blocking model download indicator in the top bar (12.1) + consent dialog. */
export function ModelStatus() {
  const m = useModelStore();
  const re = useReanalysis();
  const set = useSettings((s) => s.set);
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<ModelTier>('standard');

  useEffect(() => {
    if (m.status === 'needs-consent') {
      setTier(m.tier ?? 'standard');
      setOpen(true);
    }
  }, [m.status, m.tier]);

  useEffect(() => {
    if (m.status === 'ready') void reanalyzePending();
  }, [m.status]);

  const accept = () => {
    set({ modelConsent: true, modelTier: tier });
    setOpen(false);
    void loadModels(tier);
  };

  const pct = m.totalMb > 0 ? Math.min(100, (m.loadedMb / Math.max(m.totalMb, m.expectedMb * 0.5)) * 100) : 0;

  return (
    <>
      {m.status === 'loading' && (
        <div className="flex items-center gap-2 text-xs w-44 sm:w-60" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-primary shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between gap-1 text-muted-foreground">
              <span className="truncate">Modele {m.tier ? TIERS[m.tier].label : ''}</span>
              <span className="tabular-nums">{Math.round(m.loadedMb)} / {Math.round(Math.max(m.totalMb, m.expectedMb))} MB</span>
            </div>
            <Progress value={pct} className="h-1.5 mt-1" aria-label="Postęp pobierania modeli" />
          </div>
        </div>
      )}
      {m.status === 'ready' && (
        <Tooltip content={`${TIERS[m.tier!].description} Backend: ${m.backend}.`}>
          <span className="flex items-center gap-1.5 text-xs text-ok">
            {re.running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            <span className="hidden sm:inline">
              {re.running ? `Analiza zaległych sesji ${re.done + 1}/${re.total}` : `${TIERS[m.tier!].label} · ${m.backend}`}
            </span>
          </span>
        </Tooltip>
      )}
      {m.status === 'needs-consent' && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Download aria-hidden /> Pobierz modele
        </Button>
      )}
      {m.status === 'error' && (
        <Tooltip content={m.error ?? 'Błąd'}>
          <Button size="sm" variant="outline" className="text-bad border-bad/50" onClick={() => m.tier && loadModels(m.tier)}>
            <AlertTriangle aria-hidden /> Błąd modeli <RefreshCw aria-hidden />
          </Button>
        </Tooltip>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="flex items-center gap-2"><Cpu className="size-5" aria-hidden /> Pobranie modeli AI</DialogTitle>
          <DialogDescription>
            Analiza mowy działa w całości w Twojej przeglądarce. Wymaga to jednorazowego pobrania modeli
            (zapisywane w pamięci podręcznej przeglądarki). Nagrania nigdy nie są wysyłane na serwer.
          </DialogDescription>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="tier-select">Poziom jakości</label>
            <NativeSelect id="tier-select" value={tier} onChange={(e) => setTier(e.target.value as ModelTier)}>
              {(Object.keys(TIERS) as ModelTier[]).map((t) => (
                <option key={t} value={t}>
                  {TIERS[t].label} – ok. {m.device ? tierSizeMb(t, m.device) : TIERS[t].sizeMb.wasm} MB
                </option>
              ))}
            </NativeSelect>
            <p className="text-sm text-muted-foreground">{TIERS[tier].description}</p>
            {m.device && (
              <p className="text-xs text-muted-foreground">
                Wykryto: {m.device.webgpu ? 'WebGPU' : 'brak WebGPU (WASM, wolniej)'} · pamięć ≈ {m.device.memoryGb} GB.
                {tier === 'pro' && !m.device.webgpu && ' Poziom Pro bez WebGPU będzie bardzo wolny.'}
              </p>
            )}
          </div>
          <div className="rounded-md border border-warn/50 bg-warn/10 p-3 text-sm flex gap-2">
            <AlertTriangle className="size-4 text-warn shrink-0 mt-0.5" aria-hidden />
            <span>
              Do pobrania ok. <strong>{m.device ? tierSizeMb(tier, m.device) : TIERS[tier].sizeMb.wasm} MB</strong>. Zalecane połączenie Wi-Fi.
              Do czasu pobrania działa analiza na żywo (tempo, oddech), a nagrania zostaną przeliczone automatycznie.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Później</Button>
            <Button onClick={accept}><Download aria-hidden /> Pobierz</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
