import { useEffect, useState } from 'react';
import type { ProblemMeta } from '@/lib/types';

export async function activeLeetCodeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id && tab.url?.startsWith('https://leetcode.com/problems/')) return tab.id;
  return null;
}

export function useProblem(): ProblemMeta | null {
  const [meta, setMeta] = useState<ProblemMeta | null>(null);
  useEffect(() => {
    let alive = true;
    async function poll() {
      const tabId = await activeLeetCodeTabId();
      if (!tabId) { if (alive) setMeta(null); return; }
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'GET_PROBLEM' });
        if (alive) setMeta(res ?? null);
      } catch { if (alive) setMeta(null); }
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return meta;
}
