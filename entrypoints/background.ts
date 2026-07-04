import { getStore } from '@/lib/storage';
import { isDue } from '@/lib/srs';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

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
