import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Loader2, Mic, Save, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert, Input, Label } from '@/components/ui/primitives';
import { PresentationRichEditor } from '@/components/PresentationRichEditor';
import { deletePresentation, getPresentation, savePresentation } from '@/store/db';
import { useSettings } from '@/store/settings';
import {
  MAX_PRESENTATION_CHARS, MAX_TITLE_CHARS, formatDuration, textStats,
} from '@/lib/presentation';
import { uid } from '@/lib/utils';
import { documentFromText, presentationText } from '@/lib/presentationDocument';
import type { Presentation } from '@/types';

export default function PresentationEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const nav = useNavigate();
  const target = useSettings((s) => s.targetArticulationRate);

  const [original, setOriginal] = useState<Presentation | null | undefined>(isNew ? null : undefined);
  const [title, setTitle] = useState('');
  const [document, setDocument] = useState(() => documentFromText(''));
  const text = useMemo(() => presentationText('', document), [document]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    void getPresentation(id).then((p) => {
      if (cancelled) return;
      setOriginal(p);
      if (p) {
        setTitle(p.title);
        setDocument(p.document ?? documentFromText(p.text));
      }
    });
    return () => { cancelled = true; };
  }, [id, isNew]);

  const stats = useMemo(() => textStats(text, target), [text, target]);

  const save = async (rehearse = false) => {
    if (!title.trim()) return setError('Podaj tytuł prezentacji.');
    if (stats.words < 1) return setError('Wpisz tekst prezentacji.');
    if (text.length > MAX_PRESENTATION_CHARS) return setError(`Tekst prezentacji przekracza limit ${MAX_PRESENTATION_CHARS} znaków.`);
    setError(null);
    setSaving(true);
    const now = Date.now();
    const p: Presentation = {
      id: original?.id ?? uid(),
      title: title.trim(),
      text,
      document,
      createdAt: original?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await savePresentation(p);
      nav(rehearse ? `/presentations/${p.id}/rehearse` : '/');
    } catch {
      setError('Nie udało się zapisać prezentacji.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!original) return;
    await deletePresentation(original.id);
    nav('/');
  };

  if (original === undefined) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-label="Ładowanie" />
      </div>
    );
  }

  if (!isNew && original === null) {
    return (
      <div className="space-y-4">
        <Alert variant="warn">Nie znaleziono tej prezentacji – mogła zostać usunięta.</Alert>
        <Button variant="outline" asChild><Link to="/"><ArrowLeft className="size-4" aria-hidden /> Wróć do listy</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-4" aria-hidden /> Prezentacje
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{isNew ? 'Nowa prezentacja' : 'Edycja prezentacji'}</h1>
      </div>

      {error && <Alert variant="bad">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Treść</CardTitle>
          <CardDescription>
            {stats.words} słów · {stats.syllables} sylab · Szacowany czas czytania: ok. {formatDuration(stats.estimatedSeconds)} (w Twoim tempie docelowym, bez pauz)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Tytuł</Label>
            <Input id="title" value={title} maxLength={MAX_TITLE_CHARS} onChange={(e) => setTitle(e.target.value)} placeholder="np. Wyniki kwartalne Q3" />
          </div>
          <div className="space-y-1.5">
            <Label id="presentation-text-label" htmlFor="presentation-text">Tekst wystąpienia</Label>
            <p className="text-xs text-muted-foreground">Wklej lub wpisz tekst, który chcesz wygłosić. Formatowanie będzie widoczne podczas prezentowania.</p>
            <PresentationRichEditor document={document} onChange={setDocument} disabled={saving} />
            <p id="presentation-text-count" className="text-xs text-muted-foreground text-right">{text.length} / {MAX_PRESENTATION_CHARS} znaków</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save(true)} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mic className="size-4" aria-hidden />} Zapisz i prezentuj
        </Button>
        <Button variant="outline" onClick={() => void save()} disabled={saving}>
          <Save className="size-4" aria-hidden /> Zapisz
        </Button>
        <Button variant="ghost" asChild><Link to="/">Anuluj</Link></Button>
        {original && (
          <ConfirmDialog
            title="Usunąć prezentację?"
            description={`Prezentacja „${original.title}” zostanie usunięta. Nagrane próby pozostaną w historii sesji.`}
            confirmLabel="Usuń prezentację"
            errorMessage="Nie udało się usunąć prezentacji. Spróbuj ponownie."
            destructive
            onConfirm={remove}
          >
            <Button variant="ghost" className="ml-auto text-bad">
              <Trash2 className="size-4" aria-hidden /> Usuń
            </Button>
          </ConfirmDialog>
        )}
      </div>
    </div>
  );
}
