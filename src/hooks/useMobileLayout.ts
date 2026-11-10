import { useSyncExternalStore } from 'react';

const query = '(width < 48rem), (height < 32rem) and (pointer: coarse)';
const getSnapshot = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
const getServerSnapshot = () => false;

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useMobileLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
