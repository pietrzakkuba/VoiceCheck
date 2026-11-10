import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { installPwa, usePwa } from '@/lib/pwa';
import { useT } from '@/i18n';

export function PwaInstall() {
  const { installed, canInstall, offlineReady } = usePwa();
  const t = useT().pwa.install;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {installed ? (
          <p role="status" className="text-sm">{t.installed}</p>
        ) : canInstall ? (
          <Button onClick={() => void installPwa()}>{t.button}</Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.manual} {t.ios}
          </p>
        )}
        <p role="status" className="text-xs text-muted-foreground">
          {offlineReady ? t.offlineReady : t.offlinePreparing} {t.note}
        </p>
      </CardContent>
    </Card>
  );
}
