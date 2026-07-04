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

  // 编辑器右键 AI 动作：打开侧边栏（用户手势经消息链传递），并把动作写入 session 存储供 AI 页消费
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type !== 'AI_ACTION') return;
    if (sender.tab?.id != null) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {
        /* 手势未传递到位时静默失败；用户手动打开侧边栏后 pending 动作仍会执行 */
      });
    }
    chrome.storage.session.set({
      pendingAiAction: { action: msg.action, selection: msg.selection ?? '', ts: Date.now() },
    });
  });
});
