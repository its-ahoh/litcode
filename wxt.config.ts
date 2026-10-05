import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LitCode',
    description: 'LeetCode enhancer: local autocomplete, solution videos, review queue, interview mode, solution snapshots',
    // clipboardRead: Explain selection falls back to reading the clipboard when the editor has no selection
    // declarativeNetRequest: inject a Referer on the YouTube embed subframe — extension pages send none,
    // which YouTube now rejects with "error 153 / embedder.identity.missing.referrer" (see background.ts)
    permissions: ['storage', 'sidePanel', 'tabs', 'alarms', 'clipboardRead', 'declarativeNetRequest'],
    // action must be declared, otherwise chrome.action is undefined in the service worker
    // (badge would crash), and clicking the toolbar icon to open the side panel
    // (openPanelOnActionClick) wouldn't work either
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      96: '/icon/96.png',
      128: '/icon/128.png',
    },
    action: {
      default_title: 'LitCode',
      default_icon: { 16: '/icon/16.png', 32: '/icon/32.png', 48: '/icon/48.png', 128: '/icon/128.png' },
    },
    // AI note: extension pages bypass CORS for requests to these default API domains;
    // custom base URLs are granted at runtime via chrome.permissions.request
    host_permissions: [
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://duckduckgo.com/*', // video search (no key needed, falls back to external links on failure)
      'https://html.duckduckgo.com/*', // fallback when DDG's video endpoint blocks the extension
      'https://www.youtube.com/*', // needed for the declarativeNetRequest Referer rule on video embeds
    ],
    optional_host_permissions: ['<all_urls>'],
  },
});
