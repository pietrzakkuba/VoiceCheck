import { useId } from 'react';
import { Label, NativeSelect } from '@/components/ui/primitives';
import { LANGS, LANGUAGE_NAMES, isLang, type Lang } from '@/i18n';
import { cn } from '@/lib/utils';

interface LanguageSelectProps {
  value: Lang;
  onChange: (lang: Lang) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/** Labelled language picker for content (presentation, speech, calibration). */
export function LanguageSelect({ value, onChange, label, hint, disabled, className }: LanguageSelectProps) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => { if (isLang(e.target.value)) onChange(e.target.value); }}
      >
        {LANGS.map((l) => <option key={l} value={l} lang={l}>{LANGUAGE_NAMES[l]}</option>)}
      </NativeSelect>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
