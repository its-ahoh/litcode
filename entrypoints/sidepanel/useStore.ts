import { useEffect, useState } from 'react';
import { getStore } from '@/lib/storage';
import type { StoreShape } from '@/lib/types';

// 每个挂载的组件各订阅一个 onChanged 监听。当前 App 一次只渲染一个 tab（切走即卸载），
// 监听数恒为 1；若以后改成 keep-mounted，请把 useStore 提升到 App 层共享。
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
