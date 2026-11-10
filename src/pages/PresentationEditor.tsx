import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Loader2, Mic, Save, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert, Input, Label } from '@/components/ui/primitives';
import { PresentationRichEditor } from '@/components/PresentationRichEditor';
import { LanguageSelect } from '@/components/LanguageSelect';
import { deletePresentation, getPresentation, savePresentation } from '@/store/db';
import { useSettings } from '@/store/settings';
import {
  MAX_PRESENTATION_CHARS, MAX_TITLE_CHARS, formatDuration, textStats,
} from '@/lib/presentation';
import { uid } from '@/lib/utils';
import { documentFromText, presentationText } from '@/lib/presentationDocument';
import { langOf, useLang, useT, type Lang } from '@/i18n';
import type { Presentation } from '@/types';

export default function PresentationEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const nav = useNavigate();
  const target = useSettings((s) => s.targetArticulationRate);
  const t = useT();
  const appLang = useLang();

  const [original, setOriginal] = useState<Presentation | null | undefined>(isNew ? null : undefined);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<Lang>(appLang);
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
        setLanguage(langOf(p));
        setDocument(p.document ?? documentFromText(p.text));
      }
    });
    return () => { cancelled = true; };
  }, [id, isNew]);

  const stats = useMemo(() => textStats(text, target, language), [text, target, language]);
  const canSave = !saving && title.trim().length > 0 && stats.words > 0;

  const save = async (rehearse = false) => {
    if (!title.trim()) return setError(t.presentations.editor.errorTitle);
    if (stats.words < 1) return setError(t.presentations.editor.errorText);
    if (text.length > MAX_PRESENTATION_CHARS) return setError(t.presentations.editor.errorTooLong(MAX_PRESENTATION_CHARS));
    setError(null);
    setSaving(true);
    const now = Date.now();
    const p: Presentation = {
      id: original?.id ?? uid(),
      title: title.trim(),
      text,
      document,
      language,
      createdAt: original?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await savePresentation(p);
      nav(rehearse ? `/presentations/${p.id}/rehearse?start=1` : '/presentations');
    } catch {
      setError(t.presentations.editor.errorSave);
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!original) return;
    await deletePresentation(original.id);
    nav('/presentations');
  };

  if (original === undefined) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-label={t.common.loading} />
      </div>
    );
  }

  if (!isNew && original === null) {
    return (
      <div className="space-y-4">
        <Alert variant="warn">{t.presentations.notFound}</Alert>
        <Button variant="outline" asChild><Link to="/presentations"><ArrowLeft className="size-4" aria-hidden /> {t.presentations.backToList}</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/presentations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-4" aria-hidden /> {t.presentations.title}
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{isNew ? t.presentations.editor.newTitle : t.presentations.editor.editTitle}</h1>
      </div>

      {error && <Alert variant="bad">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t.presentations.editor.content}</CardTitle>
          <CardDescription>
            {t.presentations.words(stats.words)} · {t.presentations.syllables(stats.syllables)} · {t.presentations.estimate(formatDuration(stats.estimatedSeconds))} ({t.presentations.estimateNote})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">{t.presentations.editor.titleLabel}</Label>
            <Input id="title" value={title} maxLength={MAX_TITLE_CHARS} onChange={(e) => setTitle(e.target.value)} placeholder={t.presentations.editor.titlePlaceholder} lang={language} />
          </div>
          <LanguageSelect
            value={language}
            onChange={setLanguage}
            label={t.common.language.presentation}
            hint={t.common.language.presentationHint}
            disabled={saving}
          />
          <div className="space-y-1.5">
            <Label id="presentation-text-label" htmlFor="presentation-text">{t.presentations.editor.textLabel}</Label>
            <p className="text-xs text-muted-foreground">{t.presentations.editor.textHint}</p>
            <PresentationRichEditor document={document} onChange={setDocument} disabled={saving} lang={language} />
            <p id="presentation-text-count" className="text-xs text-muted-foreground text-right">{t.presentations.editor.charCount(text.length, MAX_PRESENTATION_CHARS)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save(true)} disabled={!canSave}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Mic className="size-4" aria-hidden />} {t.presentations.editor.saveAndPresent}
        </Button>
        <Button variant="outline" onClick={() => void save()} disabled={!canSave}>
          <Save className="size-4" aria-hidden /> {t.presentations.editor.save}
        </Button>
        <Button variant="ghost" asChild><Link to="/presentations">{t.presentations.editor.cancel}</Link></Button>
        {original && (
          <ConfirmDialog
            title={t.presentations.editor.deleteTitle}
            description={t.presentations.editor.deleteDescription(original.title)}
            confirmLabel={t.presentations.editor.deleteConfirm}
            errorMessage={t.presentations.editor.deleteError}
            destructive
            onConfirm={remove}
          >
            <Button variant="ghost" className="ml-auto text-bad">
              <Trash2 className="size-4" aria-hidden /> {t.presentations.editor.delete}
            </Button>
          </ConfirmDialog>
        )}
      </div>
    </div>
  );
}
