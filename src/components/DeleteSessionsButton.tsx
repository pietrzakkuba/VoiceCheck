import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteSessions, type SessionScope } from '@/store/db';
import { useT } from '@/i18n';

export function DeleteSessionsButton({ scope, disabled }: { scope?: SessionScope; disabled: boolean }) {
  const t = useT().sessions.deleteAll;
  return (
    <ConfirmDialog
      title={t.title}
      description={scope === undefined
        ? t.descriptionAll
        : 'mode' in scope
          ? t.descriptionFreeSpeech
          : t.descriptionPresentation}
      confirmLabel={t.confirm}
      errorMessage={t.error}
      destructive
      onConfirm={() => deleteSessions(scope)}
    >
      <Button variant="destructive" disabled={disabled}>
        <Trash2 className="size-4" aria-hidden /> {t.confirm}
      </Button>
    </ConfirmDialog>
  );
}
