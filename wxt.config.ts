import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LitCode',
    description: 'LeetCode 增强：本地补全、解法视频、错题本、面试模式、题解存档',
    permissions: ['storage', 'sidePanel', 'tabs', 'alarms'],
  },
});
