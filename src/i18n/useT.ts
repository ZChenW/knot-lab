import { useSyncExternalStore } from 'react';
import { getLang, subscribe, t } from './index';

// Keep the store and translator React-free for core, state and platform callers.
export function useT() {
  useSyncExternalStore(subscribe, getLang, getLang);
  return t;
}
