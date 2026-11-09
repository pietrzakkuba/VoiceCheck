// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function button(text: string) {
  const found = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function mount(onConfirm: () => void | Promise<void> = vi.fn(), destructive = false) {
  await act(async () => root.render(
    <ConfirmDialog
      title="Usunąć dane?"
      description="Tej operacji nie można cofnąć."
      confirmLabel="Usuń dane"
      errorMessage="Nie udało się usunąć danych."
      destructive={destructive}
      onConfirm={onConfirm}
    >
      <Button>Otwórz</Button>
    </ConfirmDialog>,
  ));
  await act(async () => button('Otwórz').click());
}

async function escape() {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
}

describe('application confirmation dialog', () => {
  it('uses accessible title and description, starts on Cancel and traps focus', async () => {
    const confirm = vi.fn();
    await mount(confirm);
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Usunąć dane?');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('Tej operacji nie można cofnąć.');
    expect(document.activeElement).toBe(button('Anuluj'));
    expect(confirm).not.toHaveBeenCalled();
    expect(dialog.className).toContain('bg-background');
    expect(dialog.className).toContain('sm:max-w-lg');
    await act(async () => button('Otwórz').focus());
    expect(dialog.contains(document.activeElement)).toBe(true);
    await act(async () => {
      button('Anuluj').focus();
      button('Anuluj').dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
      }));
    });
    expect(document.activeElement).toBe(button('Usuń dane'));
    await act(async () => {
      button('Usuń dane').dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', bubbles: true, cancelable: true,
      }));
    });
    expect(document.activeElement).toBe(button('Anuluj'));
  });

  it.each(['cancel', 'escape'])('cancels via %s and restores focus without executing', async (method) => {
    const confirm = vi.fn();
    await mount(confirm);
    if (method === 'escape') await escape();
    else await act(async () => button('Anuluj').click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(button('Otwórz'));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not close when the backdrop is clicked', async () => {
    const confirm = vi.fn();
    await mount(confirm);
    const overlay = document.querySelector<HTMLElement>('.bg-black\\/50')!;
    await act(async () => {
      overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      overlay.click();
    });
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('blocks duplicate execution and dismissal until the operation completes', async () => {
    let finish!: () => void;
    const confirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    await mount(confirm, true);
    const action = button('Usuń dane');
    expect(action.className).toContain('bg-destructive');
    await act(async () => {
      action.click();
      action.click();
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(button('Wykonywanie…').disabled).toBe(true);
    expect(button('Anuluj').disabled).toBe(true);
    expect(document.querySelector('[role="alertdialog"]')?.getAttribute('aria-busy')).toBe('true');
    await escape();
    await act(async () => button('Anuluj').click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => finish());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('shows an asynchronous error in the open dialog and permits retry', async () => {
    const confirm = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockResolvedValueOnce(undefined);
    await mount(confirm);
    await act(async () => button('Usuń dane').click());
    expect(document.querySelector('[role="alertdialog"] [role="alert"]')?.textContent).toBe('Nie udało się usunąć danych.');
    expect(button('Usuń dane').disabled).toBe(false);
    expect(button('Anuluj').disabled).toBe(false);
    await act(async () => button('Usuń dane').click());
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('handles synchronous errors and clears them after cancellation and reopening', async () => {
    await mount(() => { throw new Error('Failure'); });
    await act(async () => button('Usuń dane').click());
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => button('Anuluj').click());
    await act(async () => button('Otwórz').click());
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(button('Anuluj'));
  });

  it('executes a synchronous action only after confirmation', async () => {
    const confirm = vi.fn();
    await mount(confirm);
    expect(button('Usuń dane').className).toContain('bg-primary');
    expect(confirm).not.toHaveBeenCalled();
    await act(async () => button('Usuń dane').click());
    expect(confirm).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
