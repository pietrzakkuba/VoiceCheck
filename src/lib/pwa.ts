import { create } from 'zustand';
import { getT } from '@/i18n';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  installed: boolean;
  canInstall: boolean;
  offline: boolean;
  /** All app files are cached; the app opens and works without network. */
  offlineReady: boolean;
  updateAvailable: boolean;
  error: string | null;
}

export const usePwa = create<PwaState>(() => ({
  installed: false,
  canInstall: false,
  offline: false,
  offlineReady: false,
  updateAvailable: false,
  error: null,
}));

let installPrompt: InstallPrompt | null = null;
let registration: ServiceWorkerRegistration | null = null;
let initialized = false;
const isolationRetryKey = 'voicecheck-isolation-reload';

function askOfflineStatus(worker: ServiceWorker): Promise<boolean> {
  // Older workers never answer; the status then stays "not ready" until a newer worker takes over.
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      channel.port1.close();
      resolve(ready);
    };
    channel.port1.onmessage = (event) => finish(event.data?.type === 'OFFLINE_STATUS' && event.data.ready === true);
    try {
      worker.postMessage({ type: 'GET_OFFLINE_STATUS' }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}

/** Asks the active worker whether all app files are cached. Never throws. */
export async function refreshOfflineReady(): Promise<void> {
  const worker = registration?.active;
  if (!worker || worker.state !== 'activated') {
    usePwa.setState({ offlineReady: false });
    return;
  }
  usePwa.setState({ offlineReady: await askOfflineStatus(worker) });
}

function observeRegistration(next: ServiceWorkerRegistration) {
  registration = next;
  const checkWaiting = () => {
    usePwa.setState({ updateAvailable: Boolean(next.waiting && navigator.serviceWorker.controller) });
  };
  const watchInstalling = (worker: ServiceWorker | null) => {
    worker?.addEventListener('statechange', () => {
      checkWaiting();
      if (worker.state === 'activated') void refreshOfflineReady();
    });
  };
  checkWaiting();
  void refreshOfflineReady();
  next.addEventListener('updatefound', () => watchInstalling(next.installing));
  // A worker might already be installing when register() resolves.
  watchInstalling(next.installing);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    checkWaiting();
    void refreshOfflineReady();
  });
}

function waitForActivation(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', check);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error(getT().pwa.errors.workerRejected));
    };
    const timer = setTimeout(() => finish(new Error(getT().pwa.errors.activationTimeout)), 10000);
    worker.addEventListener('statechange', check);
    check();
  });
}

export async function initializePwa(): Promise<boolean> {
  if (initialized) return false;
  initialized = true;
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const installed = () => displayMode.matches || ('standalone' in navigator && navigator.standalone === true);
  usePwa.setState({ installed: installed(), offline: !navigator.onLine });
  displayMode.addEventListener('change', () => usePwa.setState({ installed: installed() }));
  window.addEventListener('online', () => usePwa.setState({ offline: false }));
  window.addEventListener('offline', () => usePwa.setState({ offline: true }));
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    usePwa.setState({ installed: true, canInstall: false });
  });

  if (!import.meta.env.PROD) return false;
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    usePwa.setState({ error: getT().pwa.errors.unsupported });
    return false;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const hadController = Boolean(navigator.serviceWorker.controller);
    const next = await Promise.race([
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).then((result) => {
        observeRegistration(result);
        return result;
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(getT().pwa.errors.registrationTimeout)), 10000);
      }),
    ]);
    clearTimeout(timeout);
    if (window.crossOriginIsolated) {
      sessionStorage.removeItem(isolationRetryKey);
    } else if (window.crossOriginIsolated === false && !hadController && !next.waiting) {
      const worker = next.installing ?? next.active;
      if (worker) await waitForActivation(worker);
      // Only before React mounts: never reload an editor or an active recording.
      if (worker && !sessionStorage.getItem(isolationRetryKey)) {
        sessionStorage.setItem(isolationRetryKey, '1');
        window.location.reload();
        return true;
      }
    }
  } catch (error) {
    clearTimeout(timeout);
    console.error('[PWA]', error);
    usePwa.setState({ error: getT().pwa.errors.setupFailed });
  }
  return false;
}

export async function installPwa(): Promise<void> {
  const prompt = installPrompt;
  if (!prompt) return;
  installPrompt = null;
  usePwa.setState({ canInstall: false, error: null });
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch (error) {
    console.error('[PWA install]', error);
    usePwa.setState({ error: getT().pwa.errors.installFailed });
  }
}

export async function applyPwaUpdate(): Promise<void> {
  const worker = registration?.waiting;
  if (!worker) {
    throw new Error(getT().pwa.errors.updateGone);
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      worker.removeEventListener('statechange', check);
    };
    const changed = () => {
      if (navigator.serviceWorker.controller !== worker) return;
      cleanup();
      resolve();
    };
    const check = () => {
      if (worker.state !== 'redundant') return;
      cleanup();
      reject(new Error(getT().pwa.errors.updateFailed));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(getT().pwa.errors.updateTimeout));
    }, 10000);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    worker.addEventListener('statechange', check);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
  window.location.reload();
}
