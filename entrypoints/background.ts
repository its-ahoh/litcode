import { getStore } from '@/lib/storage';
import { isDue } from '@/lib/srs';

const YOUTUBE_REFERER_RULE_ID = 1;

// Extension pages send no Referer, and since late 2025 the YouTube embed player rejects a missing
// referrer with "error 153 / embedder.identity.missing.referrer". declarativeNetRequest injects one
// on the embed's subframe request so videos play inside the side panel (referrerpolicy on the iframe
// doesn't help — Chrome strips the chrome-extension:// origin). Rule is dynamic so it persists.
function installYouTubeRefererRule() {
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [YOUTUBE_REFERER_RULE_ID],
    addRules: [
      {
        id: YOUTUBE_REFERER_RULE_ID,
        condition: {
          // scope to our own pages so we don't rewrite Referer on YouTube iframes across the browser
          initiatorDomains: [chrome.runtime.id],
          requestDomains: ['www.youtube.com'],
          resourceTypes: ['sub_frame'],
        },
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'referer',
              operation: 'set',
              // Must be a real web origin: tested empirically — chrome-extension://…/ gives
              // "Video unavailable", https://www.youtube.com/ gives error 152-4, while
              // https://leetcode.com/ (the site this panel runs beside) plays fine.
              value: 'https://leetcode.com/',
            },
          ],
        },
      },
    ],
  }).catch((e) => console.error('[LitCode] YouTube Referer rule failed to install:', e));
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  installYouTubeRefererRule();

  async function refreshBadge() {
    if (!chrome.action) return;
    const store = await getStore();
    const now = new Date();
    // isDue = dueDate <= today, covers items due today plus overdue ones
    const due = Object.values(store.reviewQueue).filter((i) => isDue(i, now)).length;
    chrome.action.setBadgeText({ text: due > 0 ? String(due) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#d33' });
    chrome.action.setBadgeTextColor?.({ color: '#fff' });
  }

  refreshBadge();
  chrome.storage.onChanged.addListener(refreshBadge);
  chrome.alarms?.create('litcode-badge', { periodInMinutes: 60 });
  chrome.alarms?.onAlarm.addListener(refreshBadge);

  // Editor context-menu AI action: open the side panel (user gesture passed through the message chain),
  // and write the action into session storage for the AI tab to consume
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type !== 'AI_ACTION') return;
    if (sender.tab?.id != null) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {
        /* fails silently if the gesture didn't carry through; the pending action still runs
           once the user opens the side panel manually */
      });
    }
    chrome.storage.session.set({
      pendingAiAction: { action: msg.action, selection: msg.selection ?? '', ts: Date.now() },
    });
  });
});
