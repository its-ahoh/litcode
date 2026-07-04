# 设计变更附录：移除面试模式，新增 AI 代码解释

日期：2026-07-04
状态：已确认（用户决策，取代原 spec 的「面试模式」章节与「不做 AI」约束）

## 变更内容

**移除（彻底）**：面试模式整体——计时器 UI、隐藏干扰 CSS（`applyInterviewCss`/`INTERVIEW_CSS`）、目标时间设置（`targetMinutes`）、「AC 严重超时自动入错题本」规则。保留 `session` 追踪与 `attempts.durationMs`（作为历史统计数据）。错题本自动入库仅剩「WA/TLE ≥ 2 次」一条规则。

**新增**：AI 代码解释（侧边栏第四个标签页 🤖 AI，替换 ⏱ Interview）：

- 在 LeetCode 编辑器中选中代码 → 「Explain selection」针对选中片段结合全文上下文讲解；「Explain whole code」解释整段代码。回答语言：英文
- 双后端 BYOK：`provider: 'anthropic' | 'openai'`，`apiKey`、`baseUrl`（可覆盖，支持兼容代理）、`model`（可覆盖）均存 `settings.ai`（chrome.storage.local）
- Anthropic 走官方 `@anthropic-ai/sdk`（`dangerouslyAllowBrowser`，默认模型 `claude-opus-4-8`，adaptive thinking）；OpenAI 兼容端走 `fetch` `{baseUrl}/chat/completions`（默认 `gpt-5` 占位，用户可改）
- 调用发自侧边栏页面；manifest 声明 `host_permissions`（api.anthropic.com / api.openai.com）绕过 CORS；自定义 baseUrl 依赖对端 CORS
- 选区捕获：MAIN world 桥的 `CODE_VALUE` 消息新增 `selection` 字段（活跃编辑器 `getSelection` → `getValueInRange`，空选区为空串）
- 原「数据导出/导入」区块从面试模式页迁移至 AI 页底部

## 数据模型变更

```ts
Settings = { ai: { provider, apiKey, baseUrl, model } }  // 原 interviewMode/targetMinutes 移除
```

旧存量数据无需迁移：`getStore` 的默认值合并会自动补上 `ai` 字段，残留旧键无害。
