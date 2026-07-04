import { useEffect, useState } from 'react';
import { getStore } from '@/lib/storage';
import type { StoreShape } from '@/lib/types';

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
