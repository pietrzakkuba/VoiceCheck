import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { applyPwaUpdate, usePwa } from '@/lib/pwa';
import { useT } from '@/i18n';

export function PwaStatus() {
  const { offline, offlineReady, updateAvailable, error } = usePwa();
  const t = useT().pwa.status;
  // Once everything is cached, losing the network changes nothing for the user.
  const showOffline = offline && !offlineReady;
  if (!showOffline && !updateAvailable && !error) return null;
  return (
    <div className="space-y-2 mb-5">
      {showOffline && <div role="status"><Alert>{t.offline}</Alert></div>}
      {error && <Alert variant="bad">{error}</Alert>}
      {updateAvailable && (
        <div className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm">{t.updateAvailable}</p>
          <ConfirmDialog
            title={t.updateTitle}
            description={t.updateDescription}
            confirmLabel={t.updateConfirm}
            errorMessage={t.updateError}
            onConfirm={applyPwaUpdate}
          >
            <Button size="sm" variant="outline">{t.update}</Button>
          </ConfirmDialog>
        </div>
      )}
    </div>
  );
}
