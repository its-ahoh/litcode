# LitCode — LeetCode 增强 Chrome 插件设计文档

日期：2026-07-03
状态：已确认

## 背景与目标

LeetCode 将编辑器自动补全（Autocomplete/IntelliSense）等功能锁在 Premium 会员内。本项目构建一个 **100% 本地运行、零 AI、零外部服务器** 的 Chrome 插件（Manifest V3），在 leetcode.com（国际版）刷题时提供以下能力：

1. **本地 IntelliSense 补全** — 输入字母前缀或 `.` 时弹出方法名候选（Python / Java / JavaScript/TypeScript）
2. **YouTube 解法视频关联** — 精选映射优先，搜索链接兜底
3. **错题本 + 间隔重复** — 自动记录卡壳题目，按 3/7/14 天调度重做
4. **面试模式** — 计时、隐藏难度等干扰信息
5. **多版本题解存档** — 每题最多保存 3 个版本的自己写的答案

明确不做（YAGNI）：AI 补全、渐进式提示、Code Review、复杂度分析、自建后端、跨设备云同步、leetcode.cn 适配。

## 总体架构

技术栈：**TypeScript + WXT 框架 + React（仅 Side Panel UI）+ Vitest**。

```
┌─ leetcode.com 页面 ────────────────┐   ┌─ Chrome Side Panel ──────────┐
│ Content Script                     │   │ React UI，四个标签页：         │
│ ├─ 注入 MAIN world 脚本接入 Monaco  │◄─►│ 📺视频 | 📕错题本 | 💾题解 | ⏱面试│
│ │   → registerCompletionItemProvider│  └───────────┬──────────────────┘
│ ├─ 提取题目信息（slug/标题/难度）     │              │
│ ├─ 监听提交结果（AC / WA / TLE）     │   ┌──────────▼──────────────────┐
│ └─ 读写编辑器代码（题解存档用）       │   │ chrome.storage.local         │
└────────────────────────────────────┘   │ 做题记录 / 题解版本 / 设置     │
                                          └─────────────────────────────┘
静态资源（打包进插件，完全离线）：
├─ 补全词典 JSON × 3 种语言（Python / Java / JS-TS）
└─ 精选视频映射 JSON（slug → YouTube 视频列表）
```

- 页面内注入面最小化：只做 Monaco 接入、题目信息提取、提交监听、代码读写四件事
- 所有功能 UI 放 Chrome 原生 Side Panel，不受 LeetCode 前端改版影响
- 插件不发起任何网络请求；唯一联网行为是用户点击视频链接打开 YouTube

### 组件与通信

| 组件 | 职责 | 通信 |
|---|---|---|
| MAIN world 注入脚本 | 访问 `window.monaco`，注册补全 Provider；读/写编辑器内容 | 与 content script 之间 `window.postMessage` |
| Content script（isolated world） | 题目信息提取、提交结果监听、消息中转 | 与 side panel / background 之间 `chrome.runtime` 消息 |
| Side Panel（React） | 全部功能 UI | 读写 `chrome.storage.local`，向 content script 请求当前题目/代码 |
| Background service worker | 图标 badge（今日到期数）、side panel 开启逻辑 | `chrome.storage` + `chrome.runtime` 消息 |

## 功能设计

### 1. 本地 IntelliSense 补全

- 通过 `registerCompletionItemProvider` 为 Python / Java / JavaScript / TypeScript 各注册一个 Provider，`triggerCharacters: ['.']`；字母触发依赖 Monaco 原生的词首模糊匹配
- 候选内容 = 语言关键字 + 内置函数 + 常用方法（各带函数签名与一句话中文说明），按刷题使用频率排序
- `.` 触发时不做类型推断，展示该语言合并的常用方法表，继续输入即模糊过滤
- 词典范围：
  - Python：builtins、`list/dict/str/set/tuple` 方法、`heapq/collections/bisect/math/itertools/functools`
  - Java：`String/StringBuilder/List/ArrayList/Map/HashMap/Set/Deque/PriorityQueue/Arrays/Collections/Character/Integer`
  - JS/TS：`Array/String/Map/Set/Object/Math/Number/JSON`
- JS/TS 优待：检测页面 Monaco 是否带 `monaco.languages.typescript` 语言服务，有则直接启用语义级补全，静态词典仅作兜底
- 词典为打包进插件的 JSON 文件，结构：`{ label, kind, signature, doc, insertText }`

### 2. YouTube 解法视频关联

- 内置精选映射 JSON：`slug → [{ videoId, title, channel, duration }]`，以 NeetCode 系列（约 600 题）为主
- Side Panel「视频」页根据当前题目 slug 展示视频卡片，点击新标签页打开 YouTube
- 未命中映射时展示「在 YouTube 搜索这道题」按钮，链接为 `https://www.youtube.com/results?search_query=leetcode+<题号>+<英文题名>`
- 映射表随插件版本更新

### 3. 错题本 + 间隔重复

- Content script 拦截 LeetCode 提交检查接口响应，记录每次提交：`{ slug, title, difficulty, result, timestamp, durationMs }`
- 入本规则：同一题 WA/TLE 累计 ≥ 2 次自动入本；侧边栏也可手动「标记重做」
- 复习调度：入本后生成 3 天到期；到期重做 AC 则推进到 7 天档，再到 14 天档，三档通过自动毕业移出
- 「错题本」页展示今日到期列表 + 全部列表；插件图标 badge 显示今日到期数
- 数据存 `chrome.storage.local`；支持一键导出/导入 JSON（含题解存档）

### 4. 面试模式

- Side Panel 一键开关，状态持久化
- 开启后：进入题目页自动开始计时（侧边栏显示，可选页面内悬浮小计时器）；注入 CSS 隐藏难度标签、通过率、点赞数、讨论区入口
- 目标时间默认 Easy 15 / Medium 25 / Hard 40 分钟，可在设置中调整；超时计时器变色提醒
- 结束（AC 或手动结束）后用时写入做题记录；超时严重（> 2× 目标）的题建议加入错题本

### 5. 多版本题解存档

- Side Panel「题解」页，针对当前题目提供 3 个版本槽位
- 「保存当前代码」：经消息链从 Monaco 抓取当前代码 + 语言 + 时间戳，存入空槽；3 槽已满时让用户选择覆盖哪一个
- 每个版本可编辑备注名（如「暴力解」「哈希优化」「最优 O(n)」）
- 每个版本支持：一键恢复到编辑器（覆盖前弹确认）、一键复制、删除
- 数据结构：`solutions[slug] = [{ label, language, code, savedAt }]`（最多 3 条），纳入统一导出/导入

## 数据模型（chrome.storage.local）

```ts
{
  settings: { languages: string[], interviewMode: boolean, targetMinutes: {easy,medium,hard} },
  attempts: Record<slug, Attempt[]>,        // 提交记录
  reviewQueue: Record<slug, { stage: 0|1|2, dueDate: string, addedAt: string }>,
  solutions: Record<slug, SolutionVersion[]>, // 最多 3 条/题
}
```

## 错误处理

- **Monaco 未找到**：MutationObserver + 轮询等待最多 10 秒，失败静默降级，仅补全失效，其余功能正常
- **DOM 改版**：题目信息优先取 URL 与页面内嵌数据（`__NEXT_DATA__` / GraphQL 缓存），DOM 选择器仅兜底；提交监听失效时错题本退化为纯手动模式
- **各功能互相隔离**：任一模块初始化失败不阻断其他模块
- **storage 安全**：写入前 schema 校验；导入 JSON 时验证格式并提示合并/覆盖

## 测试策略

- **Vitest 单测**：补全词典数据完整性、间隔重复调度逻辑、题解槽位管理、导出/导入序列化
- **手动验收**：每个功能附验收清单，在 leetcode.com 实际页面验证（补全触发、提交捕获、面试模式隐藏元素等）
- v1 不引入浏览器自动化测试

## 实现阶段建议

1. 项目脚手架（WXT）+ Monaco 接入 + Python 补全（核心价值验证）
2. Java / JS 词典 + 题目信息提取 + Side Panel 骨架 + 视频页
3. 提交监听 + 错题本 + 间隔重复 + badge
4. 题解存档 + 面试模式 + 导出/导入 + 打磨
