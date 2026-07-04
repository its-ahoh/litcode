# LitCode

LitCode 是一个本地优先的 LeetCode 增强 Chrome 插件（MV3）。它不依赖任何自建后端，所有数据（包括 AI 的 API Key）都保存在浏览器本地存储中。插件在 leetcode.com 页面上做最小化注入，把主要交互放进 Chrome 侧边栏（Side Panel），提供本地代码补全、精选解法视频、错题本与间隔重复复习、题解多版本存档、AI 代码解释等功能。唯一的网络请求是可选的：YouTube 视频跳转，以及你主动触发的 AI 解释（直连你配置的 API，BYOK）。

## 功能列表

- **本地代码补全**：在 Monaco 编辑器中为 Python / Java / JavaScript 提供静态词典补全（字母触发与 `.` 成员触发）。
- **精选解法视频**：识别当前题目后，在侧边栏展示对应的 NeetCode 视频卡片；未命中时提供一键 YouTube 搜索兜底按钮。
- **错题本 + 间隔重复（SRS）**：自动记录提交结果，连续失败会将题目计入复习队列，通过后按 3/7/14 天档位推进，侧边栏显示到期数量徽标。
- **题解存档**：每道题最多 3 个槽位，支持保存、覆盖、恢复到编辑器、复制、删除。
- **AI 代码解释**：在编辑器中选中一段代码，点击「Explain selection」即可获得针对性讲解（思路、逐段说明、复杂度、易错点）；也可一键解释整段代码。支持 Anthropic（Claude）与 OpenAI 兼容两种后端，API Key 自备（BYOK），可覆盖 Base URL 指向兼容代理，回答为英文。
- **数据导出 / 导入**：一键导出全部本地数据为 JSON 文件备份，也可导入 JSON 文件整体恢复（会覆盖当前数据，导入前会二次确认）。

## 如何构建

```bash
npm install
npm run build   # 生产构建，产物在 .output/chrome-mv3
npm run test    # 运行 Vitest 单元测试
```

其他常用命令：

```bash
npm run dev      # WXT 开发模式（自动生成 .output 供加载调试）
npx tsc --noEmit # 仅类型检查，不产出文件
```

## 如何加载到 Chrome

1. 执行 `npm run build`，确认 `.output/chrome-mv3` 目录已生成。
2. 打开 Chrome，访问 `chrome://extensions`。
3. 打开右上角的「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择项目下的 `.output/chrome-mv3` 目录。
5. 打开任意 leetcode.com 题目页面，通过工具栏图标或侧边栏入口打开 LitCode 侧边栏即可使用。

## 已知限制

1. 复习到期日（`dueDate`）按 UTC 日历计算，处于负时区（如美洲地区）的用户在午夜前后可能会与本地日期相差一天。
2. AI 解释默认支持 api.anthropic.com 与 api.openai.com（已声明 host_permissions 绕过 CORS）；自定义 Base URL 的代理需要其自身允许跨域请求。API Key 明文存于 chrome.storage.local，仅发往你配置的 API 域名，请勿在共享电脑上使用。
3. 精选视频映射（`assets/videos.ts`）目前只是起步数据集，覆盖 Blind 75 中的 5 道题，后续会随版本逐步扩充到 NeetCode 全集。
4. 代码补全为静态词典驱动，不做真实的类型推断或上下文分析，仅按语言关键字/成员做字符串匹配提示。
