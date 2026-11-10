import { useRef, useState, type ReactElement } from 'react';
import { AlertDialog } from 'radix-ui';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { useT } from '@/i18n';

interface ConfirmDialogProps {
  children: ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  errorMessage: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  children, title, description, confirmLabel, errorMessage, destructive = false, onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const t = useT().ui;

  const handleConfirm = async () => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      setError(errorMessage);
    } finally {
      running.current = false;
      setPending(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => {
      if (running.current) return;
      setError(null);
      setOpen(next);
    }}>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className="bg-background text-foreground fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg max-h-[90vh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          aria-busy={pending}
          onEscapeKeyDown={(event) => {
            if (running.current) event.preventDefault();
          }}
        >
          <AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-muted-foreground text-sm">{description}</AlertDialog.Description>
          {error && <Alert variant="bad">{error}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>{t.cancel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
              onClick={() => void handleConfirm()}
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {pending ? t.pending : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
