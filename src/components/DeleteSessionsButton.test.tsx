// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSessions } from '@/store/db';
import { DeleteSessionsButton } from './DeleteSessionsButton';

vi.mock('@/store/db', () => ({ deleteSessions: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => vi.mocked(deleteSessions).mockReset().mockResolvedValue(undefined));

function button(text: string) {
  const found = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

const click = async (target: HTMLElement) => { await act(async () => target.click()); };

describe('bulk session deletion', () => {
  it.each([undefined, { presentationId: 'p1' }, { mode: 'free_speech' } as const])('requires confirmation, supports cancellation and retries failures for scope %j', async (scope) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<DeleteSessionsButton scope={scope} disabled={false} />));
      const trigger = button('Usuń wszystkie sesje');
      await click(trigger);
      expect(deleteSessions).not.toHaveBeenCalled();
      await click(button('Anuluj'));
      expect(deleteSessions).not.toHaveBeenCalled();
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();

      vi.mocked(deleteSessions).mockRejectedValueOnce(new Error('Storage unavailable'));
      await click(trigger);
      const confirm = document.querySelector<HTMLButtonElement>('[role="alertdialog"] button:last-child')!;
      await click(confirm);
      expect(document.querySelector('[role="alert"]')?.textContent).toBe('Nie udało się usunąć sesji. Spróbuj ponownie.');
      expect(deleteSessions).toHaveBeenCalledExactlyOnceWith(scope);

      let finish!: () => void;
      vi.mocked(deleteSessions).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
      await click(confirm);
      expect(button('Wykonywanie…').disabled).toBe(true);
      expect(button('Anuluj').disabled).toBe(true);
      await click(button('Wykonywanie…'));
      expect(deleteSessions).toHaveBeenCalledTimes(2);
      await act(async () => finish());
      expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
