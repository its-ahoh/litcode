import type { ProblemMeta, RuntimeMessage } from '@/lib/types';
import { getStore, patchStore } from '@/lib/storage';

export default defineContentScript({
  matches: ['https://leetcode.com/problems/*'],
  runAt: 'document_idle',
  main() {
    trackSession();
    listenRuntimeMessages();
    trackSpaNavigation();
  },
});

// ---- 题目信息 ----
function currentSlug(): string | null {
  const m = location.pathname.match(/^\/problems\/([^/]+)/);
  return m ? m[1] : null;
}

export function readProblemMeta(): ProblemMeta | null {
  const slug = currentSlug();
  if (!slug) return null;
  // document.title 形如 "1. Two Sum - LeetCode" 或 "Two Sum - LeetCode"
  const t = document.title.replace(/ - LeetCode.*$/, '');
  const m = t.match(/^(\d+)\.\s*(.+)$/);
  const frontendId = m ? m[1] : '';
  const title = m ? m[2] : t;
  // 难度：页面上带 text-difficulty-* class 的元素（DOM 兜底，取不到则 null）
  const diffEl = document.querySelector('[class*="text-difficulty-"]');
  const diffText = diffEl?.textContent?.trim() ?? '';
  const difficulty = (['Easy', 'Medium', 'Hard'] as const).find((d) => d === diffText) ?? null;
  return { slug, frontendId, title, difficulty };
}

// ---- 面试计时 session：进入题目记录时间戳 ----
async function trackSession() {
  const slug = currentSlug();
  if (!slug) return;
  const store = await getStore();
  if (store.session?.slug !== slug) {
    await patchStore({ session: { slug, enteredAt: Date.now() } });
  }
}

// LeetCode 是 SPA，题目间切换不会触发整页刷新，document_idle 只会执行一次。
// 轻量轮询 pathname，题号变化时重新记录 session。
function trackSpaNavigation() {
  let lastSlug = currentSlug();
  setInterval(() => {
    const slug = currentSlug();
    if (slug && slug !== lastSlug) {
      lastSlug = slug;
      trackSession();
    }
  }, 3000);
}

// ---- side panel ⇄ 本脚本 ----
function listenRuntimeMessages() {
  chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
    if (msg.type === 'GET_PROBLEM') {
      sendResponse(readProblemMeta());
      return;
    }
    if (msg.type === 'GET_EDITOR_CODE') {
      requestCodeFromPage().then(sendResponse);
      return true; // async
    }
    if (msg.type === 'RESTORE_CODE') {
      window.postMessage({ source: 'litcode', type: 'SET_CODE', code: msg.code }, '*');
      sendResponse({ ok: true });
      return;
    }
  });
}

function requestCodeFromPage(): Promise<{ code: string; language: string } | null> {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(null);
    }, 2000);
    function onMsg(ev: MessageEvent) {
      const d = ev.data;
      if (ev.source === window && d?.source === 'litcode' && d.type === 'CODE_VALUE' && d.requestId === requestId) {
        clearTimeout(timeout);
        window.removeEventListener('message', onMsg);
        resolve({ code: d.code, language: d.language });
      }
    }
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'litcode', type: 'GET_CODE', requestId }, '*');
  });
}
