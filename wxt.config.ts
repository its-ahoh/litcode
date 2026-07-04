import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LitCode',
    description: 'LeetCode 增强：本地补全、解法视频、错题本、面试模式、题解存档',
    permissions: ['storage', 'sidePanel', 'tabs', 'alarms'],
    // 必须声明 action，否则 service worker 里 chrome.action 为 undefined（badge 会崩），
    // 且点击工具栏图标打开侧边栏（openPanelOnActionClick）也不生效
    action: { default_title: 'LitCode' },
  },
});
