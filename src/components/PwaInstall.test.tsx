// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PwaInstall } from './PwaInstall';
import { PwaStatus } from './PwaStatus';
import { usePwa } from '@/lib/pwa';

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
  usePwa.setState({
    installed: false, canInstall: false, offline: false, updateAvailable: false, error: null,
  });
});

async function render(element: ReactElement) {
  await act(async () => root.render(element));
  return host.innerHTML;
}

describe('PWA interface', () => {
  it('provides manual installation guidance including iOS without inventing support', async () => {
    const html = await render(<PwaInstall />);
    expect(html).toContain('Safari');
    expect(html).toContain('Do ekranu początkowego');
    expect(html).not.toContain('<button');
  });

  it('only offers installation when the browser provides a prompt', async () => {
    usePwa.setState({ canInstall: true });
    expect(await render(<PwaInstall />)).toContain('Zainstaluj VoiceCheck');
  });

  it('shows installed mode instead of offering installation again', async () => {
    usePwa.setState({ installed: true, canInstall: true });
    const html = await render(<PwaInstall />);
    expect(html).toContain('Korzystasz z zainstalowanej aplikacji');
    expect(html).not.toContain('<button');
  });

  it('does not show status UI when there is nothing to report', async () => {
    expect(await render(<PwaStatus />)).toBe('');
  });

  it('shows non-blocking offline information and an explicit update action', async () => {
    usePwa.setState({ offline: true, updateAvailable: true });
    const html = await render(<PwaStatus />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Możesz zakończyć rozpoczętą sesję');
    expect(html).toContain('Aktualizuj');
  });
});
