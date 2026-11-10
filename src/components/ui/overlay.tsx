import * as React from 'react';
import { Dialog as D, Tooltip as Tt } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof D.Content>) {
  const t = useT().ui;
  return (
    <D.Portal>
      <D.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <D.Content
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg max-h-[90vh] overflow-y-auto',
          className,
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute top-4 right-4 rounded-xs opacity-70 hover:opacity-100" aria-label={t.close}>
          <XIcon className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn('text-lg font-semibold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

export function TooltipProvider(props: React.ComponentProps<typeof Tt.Provider>) {
  return <Tt.Provider delayDuration={200} {...props} />;
}

export function Tooltip({ content, children, className }: { content: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Tt.Root>
      <Tt.Trigger asChild>{children}</Tt.Trigger>
      <Tt.Portal>
        <Tt.Content
          sideOffset={4}
          className={cn('bg-foreground text-background z-50 max-w-xs rounded-md px-3 py-1.5 text-xs animate-in fade-in-0', className)}
        >
          {content}
        </Tt.Content>
      </Tt.Portal>
    </Tt.Root>
  );
}
