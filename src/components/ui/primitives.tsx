import * as React from 'react';
import { Progress as P, Slider as S, Switch as Sw, Tabs as T, Label as L } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Progress({ className, value, ...props }: React.ComponentProps<typeof P.Root>) {
  return (
    <P.Root className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)} {...props}>
      <P.Indicator
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </P.Root>
  );
}

export function Slider({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  const count = (props.value ?? props.defaultValue ?? [0]).length;
  return (
    <S.Root
      className={cn('relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 h-5', className)}
      {...props}
    >
      <S.Track className="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full">
        <S.Range className="bg-primary absolute h-full" />
      </S.Track>
      {Array.from({ length: count }, (_, i) => (
        <S.Thumb
          key={i}
          className="border-primary bg-background block size-4 rounded-full border shadow-sm focus-visible:ring-4 focus-visible:ring-ring/50 outline-none"
        />
      ))}
    </S.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof Sw.Root>) {
  return (
    <Sw.Root
      className={cn(
        'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <Sw.Thumb className="bg-background pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </Sw.Root>
  );
}

export function Label({ className, ...props }: React.ComponentProps<typeof L.Root>) {
  return <L.Root className={cn('text-sm leading-none font-medium select-none', className)} {...props} />;
}

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-1 flex-wrap', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all data-[state=active]:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('flex-1 outline-none mt-4', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 flex min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]',
        className,
      )}
      {...props}
    />
  );
}

export function Alert({
  className,
  variant = 'info',
  ...props
}: React.ComponentProps<'div'> & { variant?: 'info' | 'warn' | 'bad' | 'ok' }) {
  const styles = {
    info: 'border-info/40 bg-info/5',
    warn: 'border-warn/50 bg-warn/10',
    bad: 'border-bad/50 bg-bad/10',
    ok: 'border-ok/40 bg-ok/10',
  }[variant];
  return <div role="alert" className={cn('rounded-lg border px-4 py-3 text-sm flex gap-2 items-start', styles, className)} {...props} />;
}
