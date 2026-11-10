import { useEffect, useState } from 'react';

export type WakeLockStatus = 'unsupported' | 'inactive' | 'active' | 'error';

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && !!navigator.wakeLock;
}

/**
 * Keeps the screen on while `enabled`. The browser drops the lock whenever the
 * page is hidden, so it is re-acquired when the page becomes visible again.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>(() => (isWakeLockSupported() ? 'inactive' : 'unsupported'));

  useEffect(() => {
    if (!isWakeLockSupported()) {
      setStatus('unsupported');
      return;
    }
    if (!enabled) {
      setStatus('inactive');
      return;
    }
    let cancelled = false;
    let sentinel: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        setStatus('active');
        lock.addEventListener('release', () => {
          if (!cancelled) setStatus('inactive');
        });
      } catch {
        if (!cancelled) setStatus('error');
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => {});
      sentinel = null;
    };
  }, [enabled]);

  return status;
}
