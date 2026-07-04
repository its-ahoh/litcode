import { useEffect, useState } from 'react';
import { getStore } from '@/lib/storage';
import type { StoreShape } from '@/lib/types';

// Each mounted component subscribes its own onChanged listener. The current App renders only one
// tab at a time (unmounted when switched away), so the listener count stays at 1; if this ever
// changes to keep-mounted, lift useStore up to the App level and share it.
export function useStore(): StoreShape | null {
  const [store, setStore] = useState<StoreShape | null>(null);
  useEffect(() => {
    getStore().then(setStore);
    const onChange = () => getStore().then(setStore);
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return store;
}
