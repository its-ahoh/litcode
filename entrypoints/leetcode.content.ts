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
    relayAiActions();
  },
});

// ---- Problem info ----
function currentSlug(): string | null {
  const m = location.pathname.match(/^\/problems\/([^/]+)/);
  return m ? m[1] : null;
}

export function readProblemMeta(): ProblemMeta | null {
  const slug = currentSlug();
  if (!slug) return null;
  // document.title looks like "1. Two Sum - LeetCode" or "Two Sum - LeetCode"
  const t = document.title.replace(/ - LeetCode.*$/, '');
  const m = t.match(/^(\d+)\.\s*(.+)$/);
  const frontendId = m ? m[1] : '';
  const title = m ? m[2] : t;
  // Difficulty: element on the page with a text-difficulty-* class (DOM fallback, null if not found)
  const diffEl = document.querySelector('[class*="text-difficulty-"]');
  const diffText = diffEl?.textContent?.trim() ?? '';
  const difficulty = (['Easy', 'Medium', 'Hard'] as const).find((d) => d === diffText) ?? null;
  return { slug, frontendId, title, difficulty };
}

// Plain-text problem description (for AI prompts); falls back to meta description, returns null if not found
function readProblemDescription(): string | null {
  const el = document.querySelector('[data-track-load="description_content"]') as HTMLElement | null;
  const text =
    el?.innerText ??
    (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content ??
    '';
  return text.trim() ? text.trim().slice(0, 6000) : null;
}

// ---- session: record a timestamp on entering the problem (used for attempts.durationMs) ----
async function trackSession() {
  const slug = currentSlug();
  if (!slug) return;
  await updateStore((store) =>
    store.session?.slug !== slug ? { session: { slug, enteredAt: Date.now() } } : {},
  );
}

// LeetCode is an SPA; switching between problems doesn't trigger a full page reload, so
// document_idle only runs once. Lightly poll pathname and re-record the session when the
// problem changes (enteredAt precision is limited by the poll interval, +/-3s).
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

// ---- side panel <-> this script ----
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

// ---- Editor context-menu AI action → forward to background (which opens the side panel and writes pending) ----
function relayAiActions() {
  window.addEventListener('message', (ev: MessageEvent) => {
    const d = ev.data;
    if (ev.source !== window || d?.source !== 'litcode' || d.type !== 'AI_ACTION') return;
    chrome.runtime.sendMessage({ type: 'AI_ACTION', action: d.action, selection: d.selection ?? '' }).catch(() => {});
  });
}

// ---- Submission result → record attempt + maintain the review queue ----
// The check response for the same submission may be intercepted multiple times; dedupe by
// submission id (session-scoped is enough: resubmitting generates a new id)
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
      // OTHER (compile error/runtime error/MLE etc.) doesn't count as a review failure and doesn't affect scheduling
      if (existing && result !== 'OTHER') {
        // Already in the review queue: only advance on a "redo after due"; an AC before it's due does nothing
        if (isDue(existing, now) || result !== 'AC') {
          const next = onReviewResult(existing, result, now);
          if (next) reviewQueue[meta.slug] = next;
          else delete reviewQueue[meta.slug]; // graduated
        }
      } else if (!existing) {
        // Enrollment condition: >= 2 failures (WA/TLE)
        if (shouldEnroll(attempts[meta.slug])) {
          reviewQueue[meta.slug] = enroll(meta, now);
        }
      }

      return { attempts, reviewQueue };
    });
  });
}
