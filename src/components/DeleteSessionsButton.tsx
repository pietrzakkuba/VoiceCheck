import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteSessions } from '@/store/db';

export function DeleteSessionsButton({ presentationId, disabled }: { presentationId?: string; disabled: boolean }) {
  return (
    <ConfirmDialog
      title="Usunąć wszystkie sesje?"
      description={presentationId === undefined
        ? 'Wszystkie sesje i ich nagrania zostaną usunięte. Prezentacje i zapisana kalibracja pozostaną bez zmian. Tej operacji nie można cofnąć.'
        : 'Wszystkie sesje tej prezentacji i ich nagrania zostaną usunięte. Prezentacja, sesje innych prezentacji i zapisana kalibracja pozostaną bez zmian. Tej operacji nie można cofnąć.'}
      confirmLabel="Usuń wszystkie sesje"
      errorMessage="Nie udało się usunąć sesji. Spróbuj ponownie."
      destructive
      onConfirm={() => deleteSessions(presentationId)}
    >
      <Button variant="destructive" disabled={disabled}>
        <Trash2 className="size-4" aria-hidden /> Usuń wszystkie sesje
      </Button>
    </ConfirmDialog>
  );
}
