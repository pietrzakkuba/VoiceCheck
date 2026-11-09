import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { applyPwaUpdate, usePwa } from '@/lib/pwa';

export function PwaStatus() {
  const { offline, updateAvailable, error } = usePwa();
  if (!offline && !updateAvailable && !error) return null;
  return (
    <div className="space-y-2 mb-5">
      {offline && <div role="status"><Alert>Brak połączenia z internetem. Możesz zakończyć rozpoczętą sesję; ponowne otwarcie aplikacji wymaga sieci.</Alert></div>}
      {error && <Alert variant="bad">{error}</Alert>}
      {updateAvailable && (
        <div className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm">Dostępna aktualizacja VoiceCheck.</p>
          <ConfirmDialog
            title="Zaktualizować aplikację?"
            description="Aplikacja zostanie przeładowana. Najpierw zakończ nagranie i zapisz edytowaną prezentację. Inne otwarte okna nie zostaną automatycznie przeładowane."
            confirmLabel="Aktualizuj i przeładuj"
            errorMessage="Nie udało się aktywować aktualizacji. Spróbuj ponownie lub odśwież aplikację po zakończeniu pracy."
            onConfirm={applyPwaUpdate}
          >
            <Button size="sm" variant="outline">Aktualizuj</Button>
          </ConfirmDialog>
        </div>
      )}
    </div>
  );
}
