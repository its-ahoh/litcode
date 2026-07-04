import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LitCode',
    description: 'LeetCode enhancer: local autocomplete, solution videos, review queue, interview mode, solution snapshots',
    // clipboardRead：Explain selection 在编辑器无选区时回退读剪贴板
    permissions: ['storage', 'sidePanel', 'tabs', 'alarms', 'clipboardRead'],
    // 必须声明 action，否则 service worker 里 chrome.action 为 undefined（badge 会崩），
    // 且点击工具栏图标打开侧边栏（openPanelOnActionClick）也不生效
    action: { default_title: 'LitCode' },
    // AI 解释：扩展页面对这两个默认 API 域的请求绕过 CORS；自定义 baseUrl 依赖对端 CORS
    host_permissions: [
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://duckduckgo.com/*', // 视频搜索（无 Key，失败时回退外链）
    ],
  },
});
