// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function worker(state: ServiceWorkerState = 'activated') {
  return Object.assign(new EventTarget(), { state, postMessage: vi.fn() });
}

describe('PWA lifecycle', () => {
  let browser: EventTarget & {
    matchMedia: ReturnType<typeof vi.fn>;
    isSecureContext: boolean;
    crossOriginIsolated: boolean;
    location: { reload: ReturnType<typeof vi.fn> };
  };
  let media: EventTarget & { matches: boolean };
  let serviceWorker: EventTarget & {
    controller: ReturnType<typeof worker> | null;
    register: ReturnType<typeof vi.fn>;
  };
  let registration: EventTarget & {
    active: ReturnType<typeof worker>;
    waiting: ReturnType<typeof worker> | null;
    installing: ReturnType<typeof worker> | null;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    sessionStorage.clear();
    media = Object.assign(new EventTarget(), { matches: false });
    browser = Object.assign(new EventTarget(), {
      matchMedia: vi.fn(() => media),
      isSecureContext: true,
      crossOriginIsolated: true,
      location: { reload: vi.fn() },
    });
    registration = Object.assign(new EventTarget(), { active: worker(), waiting: null, installing: null });
    serviceWorker = Object.assign(new EventTarget(), { controller: worker(), register: vi.fn().mockResolvedValue(registration) });
    vi.stubGlobal('window', browser);
    vi.stubGlobal('navigator', { onLine: true, serviceWorker });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registers a single worker without forcing a reload', async () => {
    const pwa = await import('./pwa');
    expect(await pwa.initializePwa()).toBe(false);
    await pwa.initializePwa();
    expect(serviceWorker.register).toHaveBeenCalledExactlyOnceWith('/sw.js', { scope: '/' });
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it('does not register in development', async () => {
    vi.stubEnv('PROD', false);
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    expect(serviceWorker.register).not.toHaveBeenCalled();
  });

  it('surfaces unsupported and insecure environments', async () => {
    browser.isSecureContext = false;
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    expect(pwa.usePwa.getState().error).toContain('HTTPS');
    expect(serviceWorker.register).not.toHaveBeenCalled();
  });

  it('handles browsers without service workers', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    expect(pwa.usePwa.getState().error).toContain('service workery');
  });

  it('surfaces registration failure without preventing application startup', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    serviceWorker.register.mockRejectedValue(new Error('network'));
    const pwa = await import('./pwa');
    expect(await pwa.initializePwa()).toBe(false);
    expect(pwa.usePwa.getState().error).toContain('Nie udało');
  });

  it('tracks offline and online without a reload', async () => {
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    browser.dispatchEvent(new Event('offline'));
    expect(pwa.usePwa.getState().offline).toBe(true);
    browser.dispatchEvent(new Event('online'));
    expect(pwa.usePwa.getState().offline).toBe(false);
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it('times out a stalled registration without reloading late', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let finishRegistration: (value: typeof registration) => void = () => undefined;
    serviceWorker.controller = null;
    browser.crossOriginIsolated = false;
    serviceWorker.register.mockImplementation(() => new Promise((resolve) => {
      finishRegistration = resolve;
    }));
    const pwa = await import('./pwa');
    const initialized = pwa.initializePwa();
    await vi.advanceTimersByTimeAsync(10000);
    expect(await initialized).toBe(false);
    expect(pwa.usePwa.getState().error).toContain('Nie udało');
    finishRegistration(registration);
    await vi.advanceTimersByTimeAsync(1);
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it('offers the browser prompt once and tracks successful installation', async () => {
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    browser.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(pwa.usePwa.getState().canInstall).toBe(true);
    await pwa.installPwa();
    await pwa.installPwa();
    expect(prompt).toHaveBeenCalledTimes(1);
    browser.dispatchEvent(new Event('appinstalled'));
    expect(pwa.usePwa.getState()).toMatchObject({ installed: true, canInstall: false });
  });

  it('handles dismissed installation without claiming success', async () => {
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    browser.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    }));
    await pwa.installPwa();
    expect(pwa.usePwa.getState()).toMatchObject({ installed: false, canInstall: false, error: null });
  });

  it('surfaces installation prompt errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    browser.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockRejectedValue(new Error('unsupported')),
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    }));
    await pwa.installPwa();
    expect(pwa.usePwa.getState().error).toContain('Nie udało się otworzyć instalacji');
    expect(pwa.usePwa.getState().installed).toBe(false);
  });

  it('recognizes standalone mode', async () => {
    media.matches = true;
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    expect(pwa.usePwa.getState().installed).toBe(true);
  });

  it('shows waiting updates without activating or reloading other windows', async () => {
    const update = worker('installed');
    registration.waiting = update;
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    expect(pwa.usePwa.getState().updateAvailable).toBe(true);
    expect(update.postMessage).not.toHaveBeenCalled();
    serviceWorker.controller = update;
    registration.waiting = null;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(pwa.usePwa.getState().updateAvailable).toBe(false);
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it('detects an update installed after startup', async () => {
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    const update = worker('installing');
    registration.installing = update;
    registration.dispatchEvent(new Event('updatefound'));
    registration.waiting = update;
    update.state = 'installed';
    update.dispatchEvent(new Event('statechange'));
    expect(pwa.usePwa.getState().updateAvailable).toBe(true);
    expect(update.postMessage).not.toHaveBeenCalled();
  });

  it('reloads only the requesting window after explicit activation', async () => {
    const update = worker('installed');
    registration.waiting = update;
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    const applying = pwa.applyPwaUpdate();
    expect(update.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
    expect(browser.location.reload).not.toHaveBeenCalled();
    registration.waiting = null;
    serviceWorker.controller = update;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    await applying;
    expect(browser.location.reload).toHaveBeenCalledTimes(1);
  });

  it('rejects missing and timed-out updates without reloading', async () => {
    vi.useFakeTimers();
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    await expect(pwa.applyPwaUpdate()).rejects.toThrow('nie jest już dostępna');
    registration.waiting = worker('installed');
    const applying = expect(pwa.applyPwaUpdate()).rejects.toThrow('czas aktualizacji');
    await vi.advanceTimersByTimeAsync(10000);
    await applying;
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it('reloads before mounting only once for first-install isolation', async () => {
    browser.crossOriginIsolated = false;
    serviceWorker.controller = null;
    const first = await import('./pwa');
    expect(await first.initializePwa()).toBe(true);
    expect(browser.location.reload).toHaveBeenCalledTimes(1);
    vi.resetModules();
    const second = await import('./pwa');
    expect(await second.initializePwa()).toBe(false);
    expect(browser.location.reload).toHaveBeenCalledTimes(1);
  });

  it('surfaces rejected update messages and cleans up listeners', async () => {
    vi.useFakeTimers();
    const update = worker('installed');
    update.postMessage.mockImplementation(() => { throw new Error('worker disconnected'); });
    registration.waiting = update;
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    await expect(pwa.applyPwaUpdate()).rejects.toThrow('worker disconnected');
    expect(vi.getTimerCount()).toBe(0);
    expect(browser.location.reload).not.toHaveBeenCalled();
  });

  it('does not automatically activate a replacement for the legacy worker', async () => {
    registration.waiting = worker('installed');
    browser.crossOriginIsolated = false;
    const pwa = await import('./pwa');
    await pwa.initializePwa();
    expect(pwa.usePwa.getState().updateAvailable).toBe(true);
    expect(registration.waiting.postMessage).not.toHaveBeenCalled();
    expect(browser.location.reload).not.toHaveBeenCalled();
  });
});
