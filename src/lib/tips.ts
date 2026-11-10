import type { Messages } from '@/i18n';
import type { Tip } from '@/types';

export function localizeTip(tip: Tip, t: Messages): { title: string; detail: string } {
  const text = t.report.tips[tip.key];
  if (!text) return { title: tip.title ?? tip.key, detail: tip.detail ?? '' };
  const params = tip.params ?? {};
  return { title: text.title(params), detail: text.detail(params) };
}

/** Sessions store warning codes; older ones stored the Polish message itself. */
export function localizeWarning(warning: string, t: Messages): string {
  if (warning === 'clipping' || warning.startsWith('Nagranie było przesterowane')) return t.report.warnings.clipping;
  return warning;
}
