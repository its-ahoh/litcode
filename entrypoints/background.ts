import { getStore } from '@/lib/storage';
import { isDue } from '@/lib/srs';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  async function refreshBadge() {
    const store = await getStore();
    const now = new Date();
    const due = Object.values(store.reviewQueue).filter((i) => isDue(i, now)).length;
    chrome.action.setBadgeText({ text: due > 0 ? String(due) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#d33' });
  }

  refreshBadge();
  chrome.storage.onChanged.addListener(refreshBadge);
  chrome.alarms?.create('litcode-badge', { periodInMinutes: 60 });
  chrome.alarms?.onAlarm.addListener(refreshBadge);
});
