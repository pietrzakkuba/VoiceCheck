import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { installPwa, usePwa } from '@/lib/pwa';

export function PwaInstall() {
  const { installed, canInstall } = usePwa();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aplikacja na urządzeniu</CardTitle>
        <CardDescription>VoiceCheck może działać w osobnym oknie, z ikoną na ekranie urządzenia.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {installed ? (
          <p role="status" className="text-sm">Korzystasz z zainstalowanej aplikacji.</p>
        ) : canInstall ? (
          <Button onClick={() => void installPwa()}>Zainstaluj VoiceCheck</Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Jeśli przeglądarka obsługuje instalację, wybierz „Zainstaluj aplikację” w jej menu.
            Na iPhonie lub iPadzie otwórz stronę w Safari, wybierz „Udostępnij”, a następnie „Do ekranu początkowego”.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Otwarcie aplikacji wymaga internetu. Bez sieci zobaczysz ekran z możliwością ponowienia połączenia. Instalacja nie przenosi danych na inne urządzenia.</p>
      </CardContent>
    </Card>
  );
}
