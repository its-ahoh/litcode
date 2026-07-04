import type { ProblemMeta, RuntimeMessage } from '@/lib/types';
import { updateStore } from '@/lib/storage';
import { classifyResult, shouldEnroll, enroll, onReviewResult, isDue } from '@/lib/srs';

export default defineContentScript({
  matches: ['https://leetcode.com/problems/*'],
  runAt: 'document_idle',
  main() {
    trackSession();
    listenRuntimeMessages();
    trackSpaNavigation();
    listenSubmissions();
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

// 题目描述纯文本（AI 提示用）；DOM 兜底到 meta description，取不到返回 null
function readProblemDescription(): string | null {
  const el = document.querySelector('[data-track-load="description_content"]') as HTMLElement | null;
  const text =
    el?.innerText ??
    (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content ??
    '';
  return text.trim() ? text.trim().slice(0, 6000) : null;
}

// ---- session：进入题目记录时间戳（用于 attempts.durationMs 统计）----
async function trackSession() {
  const slug = currentSlug();
  if (!slug) return;
  await updateStore((store) =>
    store.session?.slug !== slug ? { session: { slug, enteredAt: Date.now() } } : {},
  );
}

// LeetCode 是 SPA，题目间切换不会触发整页刷新，document_idle 只会执行一次。
// 轻量轮询 pathname，题号变化时重新记录 session（enteredAt 精度受轮询间隔限制，±3s）。
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
    if (msg.type === 'GET_PROBLEM_TEXT') {
      sendResponse(readProblemDescription());
      return;
    }
    if (msg.type === 'RESTORE_CODE') {
      window.postMessage({ source: 'litcode', type: 'SET_CODE', code: msg.code }, '*');
      sendResponse({ ok: true });
      return;
    }
  });
}

function requestCodeFromPage(): Promise<{ code: string; language: string; selection: string } | null> {
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
        resolve({ code: d.code, language: d.language, selection: d.selection ?? '' });
      }
    }
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'litcode', type: 'GET_CODE', requestId }, '*');
  });
}

// ---- 提交结果 → 记录 attempt + 维护错题本 ----
// 同一次提交的 check 响应可能被拦截多次，按 submission id 去重（会话级即可：重新提交会生成新 id）
const seenSubmissions = new Set<string>();

function listenSubmissions() {
  window.addEventListener('message', (ev: MessageEvent) => {
    const d = ev.data;
    if (ev.source !== window || d?.source !== 'litcode' || d.type !== 'SUBMISSION_RESULT') return;
    if (seenSubmissions.has(d.submissionId)) return;
    seenSubmissions.add(d.submissionId);
    const meta = readProblemMeta();
    if (!meta) return;
    const result = classifyResult(d.statusMsg);
    const now = new Date();

    updateStore((store) => {
      const durationMs =
        store.session?.slug === meta.slug ? Date.now() - store.session.enteredAt : null;

      const attempts = { ...store.attempts };
      attempts[meta.slug] = [
        ...(attempts[meta.slug] ?? []),
        { slug: meta.slug, title: meta.title, difficulty: meta.difficulty, result, timestamp: Date.now(), durationMs },
      ];

      const reviewQueue = { ...store.reviewQueue };
      const existing = reviewQueue[meta.slug];
      // OTHER（编译错误/运行时错误/MLE 等）不代表复习失败，不影响调度
      if (existing && result !== 'OTHER') {
        // 已在错题本：只有"到期后重做"才推进；未到期的 AC 不动
        if (isDue(existing, now) || result !== 'AC') {
          const next = onReviewResult(existing, result, now);
          if (next) reviewQueue[meta.slug] = next;
          else delete reviewQueue[meta.slug]; // 毕业
        }
      } else if (!existing) {
        // 入本条件：失败（WA/TLE）≥2 次
        if (shouldEnroll(attempts[meta.slug])) {
          reviewQueue[meta.slug] = enroll(meta, now);
        }
      }

      return { attempts, reviewQueue };
    });
  });
}
