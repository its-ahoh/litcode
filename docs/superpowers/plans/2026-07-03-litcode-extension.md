# LitCode Chrome 插件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯本地的 LeetCode 增强 Chrome 插件：Monaco 本地补全、YouTube 解法视频、错题本+间隔重复、面试模式、多版本题解存档。

**Architecture:** MV3 插件，页面内只做最小注入（MAIN world 脚本接 Monaco + isolated content script 提取信息/监听提交），全部 UI 在 Chrome Side Panel（React），数据存 chrome.storage.local，零网络请求。

**Tech Stack:** TypeScript + WXT + React + Vitest。规范文档：`docs/superpowers/specs/2026-07-03-litcode-extension-design.md`

---

## 文件结构

```
litcode/
├── wxt.config.ts                    # WXT/manifest 配置
├── package.json / tsconfig.json / vitest.config.ts
├── entrypoints/
│   ├── background.ts                # badge + sidePanel 行为
│   ├── monaco.content.ts            # MAIN world：Monaco 补全 + fetch 拦截 + 代码读写
│   ├── leetcode.content.ts          # isolated world：题目信息、提交记录、面试模式 CSS、消息中转
│   └── sidepanel/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx                  # 四个标签页容器 + 当前题目获取
│       └── tabs/
│           ├── VideosTab.tsx
│           ├── ReviewTab.tsx        # 错题本
│           ├── SolutionsTab.tsx     # 题解存档
│           └── InterviewTab.tsx     # 面试模式 + 设置 + 导出导入
├── lib/
│   ├── types.ts                     # 全部共享类型 + 消息协议
│   ├── storage.ts                   # chrome.storage.local 类型化封装
│   ├── srs.ts                       # 间隔重复纯逻辑
│   ├── solutions.ts                 # 题解槽位纯逻辑
│   └── dicts/
│       ├── types.ts                 # DictEntry
│       ├── python.ts / java.ts / javascript.ts
│       └── index.ts                 # 语言 id → 词典
├── assets/videos.ts                 # slug → 视频列表（精选映射）
└── tests/                           # Vitest 单测
    ├── srs.test.ts
    ├── solutions.test.ts
    ├── dicts.test.ts
    └── fake-chrome.ts               # storage 测试替身
```

---

### Task 1: WXT 脚手架与构建验证

**Files:**
- Create: `package.json`, `wxt.config.ts`, `tsconfig.json`, `entrypoints/background.ts`, `entrypoints/sidepanel/index.html`, `entrypoints/sidepanel/main.tsx`, `entrypoints/sidepanel/App.tsx`, `.gitignore`

- [ ] **Step 1: 初始化 npm 与依赖**

```bash
cd /Users/jackou/Documents/projects/litcode
npm init -y
npm i react react-dom
npm i -D wxt @wxt-dev/module-react typescript vitest @types/react @types/react-dom @types/chrome
```

- [ ] **Step 2: 写 `package.json` 的 scripts 段（保留 npm init 生成的其余字段）**

```json
"scripts": {
  "dev": "wxt",
  "build": "wxt build",
  "test": "vitest run",
  "postinstall": "wxt prepare"
}
```

- [ ] **Step 3: 创建 `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'LitCode',
    description: 'LeetCode 增强：本地补全、解法视频、错题本、面试模式、题解存档',
    permissions: ['storage', 'sidePanel', 'tabs'],
  },
});
```

- [ ] **Step 4: 创建 `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": { "strict": true, "jsx": "react-jsx" }
}
```

- [ ] **Step 5: 创建 `.gitignore`**

```
node_modules/
.wxt/
.output/
```

- [ ] **Step 6: 创建 `entrypoints/background.ts`（最小版，badge 逻辑 Task 11 再加）**

```ts
export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});
```

- [ ] **Step 7: 创建 Side Panel 三件套**

`entrypoints/sidepanel/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>LitCode</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`entrypoints/sidepanel/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
```

`entrypoints/sidepanel/App.tsx`（占位骨架，Task 7 完善）:

```tsx
export default function App() {
  return <h1>LitCode</h1>;
}
```

- [ ] **Step 8: 运行 `npx wxt prepare && npm run build`**

Expected: 构建成功，产出 `.output/chrome-mv3/`，其中 `manifest.json` 含 `side_panel` 字段。

- [ ] **Step 9: 手动验证**

Chrome → `chrome://extensions` → 开发者模式 → 加载已解压 `.output/chrome-mv3`。点击插件图标，侧边栏出现 "LitCode"。

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: WXT scaffold with side panel skeleton"
```

---

### Task 2: 共享类型与 storage 封装

**Files:**
- Create: `lib/types.ts`, `lib/storage.ts`, `vitest.config.ts`, `tests/fake-chrome.ts`
- Test: `tests/storage.test.ts`

- [ ] **Step 1: 创建 `lib/types.ts`**

```ts
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SubmissionResult = 'AC' | 'WA' | 'TLE' | 'OTHER';

export interface ProblemMeta {
  slug: string;
  frontendId: string; // 题号，如 "1"
  title: string;      // 如 "Two Sum"
  difficulty: Difficulty | null;
}

export interface Attempt {
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  result: SubmissionResult;
  timestamp: number;
  durationMs: number | null; // 进入题目到提交的用时
}

export interface ReviewItem {
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  stage: 0 | 1 | 2;   // 对应 3/7/14 天档
  dueDate: string;    // ISO 日期 "2026-07-06"
  addedAt: string;
}

export interface SolutionVersion {
  label: string;
  language: string;
  code: string;
  savedAt: number;
}

export interface Settings {
  interviewMode: boolean;
  targetMinutes: { easy: number; medium: number; hard: number };
}

export const DEFAULT_SETTINGS: Settings = {
  interviewMode: false,
  targetMinutes: { easy: 15, medium: 25, hard: 40 },
};

export interface StoreShape {
  settings: Settings;
  attempts: Record<string, Attempt[]>;
  reviewQueue: Record<string, ReviewItem>;
  solutions: Record<string, SolutionVersion[]>;
  session: { slug: string; enteredAt: number } | null;
}

// ---- 消息协议 ----
// window.postMessage（MAIN ⇄ isolated），一律带 source: 'litcode'
export type PageMessage =
  | { source: 'litcode'; type: 'SUBMISSION_RESULT'; statusMsg: string }
  | { source: 'litcode'; type: 'GET_CODE'; requestId: string }
  | { source: 'litcode'; type: 'CODE_VALUE'; requestId: string; code: string; language: string }
  | { source: 'litcode'; type: 'SET_CODE'; code: string };

// chrome.runtime（side panel ⇄ content script）
export type RuntimeMessage =
  | { type: 'GET_PROBLEM' }                       // → ProblemMeta | null
  | { type: 'GET_EDITOR_CODE' }                   // → { code: string; language: string } | null
  | { type: 'RESTORE_CODE'; code: string };       // → { ok: boolean }
```

- [ ] **Step 2: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 3: 创建 `tests/fake-chrome.ts`（内存版 chrome.storage.local）**

```ts
export function installFakeChrome() {
  const data: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: data[key] };
        },
        async set(items: Record<string, unknown>) {
          Object.assign(data, items);
        },
      },
      onChanged: { addListener() {} },
    },
  };
  return data;
}
```

- [ ] **Step 4: 写失败测试 `tests/storage.test.ts`**

```ts
import { beforeEach, expect, test } from 'vitest';
import { installFakeChrome } from './fake-chrome';

beforeEach(() => installFakeChrome());

test('getStore returns defaults for empty storage', async () => {
  const { getStore } = await import('../lib/storage');
  const store = await getStore();
  expect(store.settings.targetMinutes.medium).toBe(25);
  expect(store.attempts).toEqual({});
  expect(store.reviewQueue).toEqual({});
  expect(store.solutions).toEqual({});
});

test('patchStore persists partial updates', async () => {
  const { getStore, patchStore } = await import('../lib/storage');
  await patchStore({ settings: { interviewMode: true, targetMinutes: { easy: 10, medium: 20, hard: 30 } } });
  const store = await getStore();
  expect(store.settings.interviewMode).toBe(true);
  expect(store.attempts).toEqual({});
});
```

- [ ] **Step 5: 运行确认失败**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL（`lib/storage` 不存在）

- [ ] **Step 6: 创建 `lib/storage.ts`**

```ts
import { DEFAULT_SETTINGS, type StoreShape } from './types';

const KEY = 'litcode';

const DEFAULTS: StoreShape = {
  settings: DEFAULT_SETTINGS,
  attempts: {},
  reviewQueue: {},
  solutions: {},
  session: null,
};

export async function getStore(): Promise<StoreShape> {
  const res = await chrome.storage.local.get(KEY);
  const saved = (res[KEY] ?? {}) as Partial<StoreShape>;
  return { ...DEFAULTS, ...saved, settings: { ...DEFAULT_SETTINGS, ...saved.settings } };
}

export async function patchStore(patch: Partial<StoreShape>): Promise<StoreShape> {
  const current = await getStore();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
```

- [ ] **Step 7: 运行确认通过**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS × 2

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: shared types and typed storage layer"
```

---

### Task 3: 补全词典（Python / Java / JS）

**Files:**
- Create: `lib/dicts/types.ts`, `lib/dicts/python.ts`, `lib/dicts/java.ts`, `lib/dicts/javascript.ts`, `lib/dicts/index.ts`
- Test: `tests/dicts.test.ts`

- [ ] **Step 1: 创建 `lib/dicts/types.ts`**

```ts
export type DictKind = 'method' | 'function' | 'keyword' | 'module' | 'class' | 'snippet';

export interface DictEntry {
  label: string;      // 补全弹窗里的词，如 "append"
  kind: DictKind;
  signature: string;  // 如 "list.append(x)"
  doc: string;        // 一句话中文说明
  insertText: string; // Monaco snippet 语法，如 "append($0)"
}
```

- [ ] **Step 2: 写失败测试 `tests/dicts.test.ts`**

测试做两件事：schema 合法性 + 最低覆盖清单（清单即为词典的验收标准，实现时必须全部包含）。

```ts
import { expect, test } from 'vitest';
import { dictionaries } from '../lib/dicts';

const MUST_HAVE: Record<string, string[]> = {
  python: [
    // list/str/dict/set 方法
    'append', 'pop', 'sort', 'sorted', 'reverse', 'insert', 'remove', 'index', 'count',
    'join', 'split', 'strip', 'lower', 'upper', 'startswith', 'endswith', 'replace', 'find', 'isdigit', 'isalpha', 'ord', 'chr',
    'get', 'keys', 'values', 'items', 'setdefault', 'add', 'discard', 'update',
    // builtins
    'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'abs', 'all', 'any', 'set', 'dict', 'list', 'tuple', 'str', 'int', 'float', 'bool', 'print', 'reversed', 'isinstance', 'divmod', 'pow', 'round',
    // 模块
    'heapq', 'heappush', 'heappop', 'heapify', 'Counter', 'defaultdict', 'deque', 'popleft', 'appendleft', 'bisect_left', 'bisect_right', 'insort', 'lru_cache', 'cache', 'inf', 'gcd', 'sqrt', 'floor', 'ceil', 'permutations', 'combinations', 'accumulate',
    // 关键字
    'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'lambda', 'yield', 'class', 'import', 'from', 'None', 'True', 'False', 'break', 'continue', 'global', 'nonlocal', 'try', 'except',
  ],
  java: [
    'length', 'charAt', 'substring', 'indexOf', 'toCharArray', 'equals', 'compareTo', 'split', 'trim', 'toLowerCase', 'toUpperCase', 'contains', 'isEmpty', 'valueOf', 'parseInt', 'toString', 'append', 'reverse', 'deleteCharAt', 'setCharAt',
    'add', 'remove', 'get', 'set', 'size', 'put', 'getOrDefault', 'containsKey', 'containsValue', 'keySet', 'entrySet', 'putIfAbsent', 'merge', 'offer', 'poll', 'peek', 'push', 'addFirst', 'addLast', 'pollFirst', 'pollLast',
    'sort', 'fill', 'copyOf', 'copyOfRange', 'binarySearch', 'asList', 'swap', 'max', 'min', 'abs', 'sqrt', 'pow', 'floor', 'ceil',
    'public', 'private', 'static', 'final', 'void', 'int', 'long', 'char', 'boolean', 'double', 'String', 'new', 'return', 'if', 'else', 'for', 'while', 'break', 'continue', 'class', 'extends', 'implements', 'null', 'true', 'false',
    'ArrayList', 'HashMap', 'HashSet', 'LinkedList', 'ArrayDeque', 'PriorityQueue', 'TreeMap', 'TreeSet', 'StringBuilder', 'Arrays', 'Collections', 'Math', 'Integer', 'Character', 'Comparator',
  ],
  javascript: [
    'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'sort', 'reverse', 'map', 'filter', 'reduce', 'forEach', 'find', 'findIndex', 'includes', 'indexOf', 'join', 'concat', 'flat', 'fill', 'some', 'every', 'from', 'isArray', 'keys', 'values', 'entries',
    'split', 'trim', 'toLowerCase', 'toUpperCase', 'charAt', 'charCodeAt', 'fromCharCode', 'substring', 'repeat', 'padStart', 'replace', 'startsWith', 'endsWith',
    'get', 'set', 'has', 'delete', 'add', 'size',
    'max', 'min', 'abs', 'floor', 'ceil', 'sqrt', 'pow', 'round', 'sign', 'Infinity',
    'const', 'let', 'function', 'return', 'if', 'else', 'for', 'while', 'of', 'in', 'new', 'class', 'null', 'undefined', 'true', 'false', 'typeof', 'break', 'continue',
    'Map', 'Set', 'Array', 'Number', 'JSON', 'parseInt', 'parseFloat',
  ],
};

for (const [lang, words] of Object.entries(MUST_HAVE)) {
  test(`${lang} dictionary covers required words`, () => {
    const labels = new Set(dictionaries[lang].map((e) => e.label));
    const missing = words.filter((w) => !labels.has(w));
    expect(missing).toEqual([]);
  });

  test(`${lang} entries are well-formed and unique`, () => {
    const seen = new Set<string>();
    for (const e of dictionaries[lang]) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.signature.length).toBeGreaterThan(0);
      expect(e.doc.length).toBeGreaterThan(0);
      expect(e.insertText.length).toBeGreaterThan(0);
      const key = `${e.label}|${e.signature}`;
      expect(seen.has(key), `duplicate: ${key}`).toBe(false);
      seen.add(key);
    }
  });
}
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/dicts.test.ts`
Expected: FAIL（`lib/dicts` 不存在）

- [ ] **Step 4: 实现三个词典文件**

每个文件导出 `DictEntry[]`。逐条编写，格式如下（示例为 `lib/dicts/python.ts` 开头；三个文件都按 MUST_HAVE 清单逐词补齐，每词一条，方法归 `kind:'method'`，内置函数归 `'function'`，关键字归 `'keyword'`，模块/类归 `'module'`/`'class'`）：

```ts
import type { DictEntry } from './types';

export const python: DictEntry[] = [
  { label: 'append', kind: 'method', signature: 'list.append(x)', doc: '在列表末尾添加元素', insertText: 'append($0)' },
  { label: 'heappush', kind: 'function', signature: 'heapq.heappush(heap, item)', doc: '向最小堆压入元素', insertText: 'heappush($1, $0)' },
  { label: 'Counter', kind: 'class', signature: 'collections.Counter(iterable)', doc: '计数器字典', insertText: 'Counter($0)' },
  { label: 'def', kind: 'keyword', signature: 'def name(args):', doc: '定义函数', insertText: 'def ${1:name}(${2:args}):\n    $0' },
  // ……按 tests/dicts.test.ts 的 MUST_HAVE 清单逐条补全
];
```

同一 label 出现在多种容器时（如 Java 的 `add` 既在 List 又在 Set），只写一条，signature 写最常用形式，doc 里说明适用范围。

`lib/dicts/index.ts`:

```ts
import { python } from './python';
import { java } from './java';
import { javascript } from './javascript';
import type { DictEntry } from './types';

export const dictionaries: Record<string, DictEntry[]> = {
  python,
  python3: python,
  java,
  javascript,
  typescript: javascript,
};
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/dicts.test.ts`
Expected: PASS × 6

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: completion dictionaries for python/java/js"
```

---

### Task 4: Monaco 桥（MAIN world）——补全注册 + fetch 拦截 + 代码读写

**Files:**
- Create: `entrypoints/monaco.content.ts`

此脚本运行在页面 MAIN world，能访问 `window.monaco`。纯页面逻辑，无法用 Vitest 有效覆盖（依赖真实 Monaco），验收在 Task 5 手动完成。

- [ ] **Step 1: 创建 `entrypoints/monaco.content.ts`**

```ts
import { dictionaries } from '@/lib/dicts';
import type { DictEntry, DictKind } from '@/lib/dicts/types';

export default defineContentScript({
  matches: ['https://leetcode.com/problems/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    interceptFetch();
    waitForMonaco().then((monaco) => {
      if (monaco) {
        registerProviders(monaco);
        setupCodeBridge(monaco);
      }
    });
  },
});

function waitForMonaco(timeoutMs = 15000): Promise<any | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const monaco = (window as any).monaco;
      if (monaco?.languages?.registerCompletionItemProvider) {
        clearInterval(timer);
        resolve(monaco);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(null); // 静默降级
      }
    }, 250);
  });
}

const KIND_MAP: Record<DictKind, string> = {
  method: 'Method',
  function: 'Function',
  keyword: 'Keyword',
  module: 'Module',
  class: 'Class',
  snippet: 'Snippet',
};

function registerProviders(monaco: any) {
  for (const [lang, entries] of Object.entries(dictionaries)) {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.'],
      provideCompletionItems(model: any, position: any) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const lineBefore: string = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        // "." 后只出方法；否则出全部非方法项
        const afterDot = /\.\w*$/.test(lineBefore);
        const pool = entries.filter((e) =>
          afterDot ? e.kind === 'method' : e.kind !== 'method',
        );
        return { suggestions: pool.map((e) => toItem(monaco, e, range)) };
      },
    });
  }
}

function toItem(monaco: any, e: DictEntry, range: any) {
  return {
    label: { label: e.label, description: e.signature },
    kind: monaco.languages.CompletionItemKind[KIND_MAP[e.kind]],
    documentation: `${e.signature}\n${e.doc}`,
    insertText: e.insertText,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
  };
}

// ---- 提交结果拦截 ----
function interceptFetch() {
  const orig = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await orig(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      if (/\/submissions\/detail\/\d+\/check\/?/.test(url)) {
        res.clone().json().then((data: any) => {
          if (data?.state === 'SUCCESS' && data?.status_msg) {
            window.postMessage(
              { source: 'litcode', type: 'SUBMISSION_RESULT', statusMsg: data.status_msg },
              '*',
            );
          }
        }).catch(() => {});
      }
    } catch { /* 拦截失败不影响原请求 */ }
    return res;
  };
}

// ---- 代码读写桥（供题解存档用）----
function setupCodeBridge(monaco: any) {
  window.addEventListener('message', (ev: MessageEvent) => {
    const msg = ev.data;
    if (ev.source !== window || msg?.source !== 'litcode') return;
    const model = monaco.editor.getModels().find((m: any) => m.uri.scheme !== 'output') ?? monaco.editor.getModels()[0];
    if (!model) return;
    if (msg.type === 'GET_CODE') {
      window.postMessage(
        {
          source: 'litcode',
          type: 'CODE_VALUE',
          requestId: msg.requestId,
          code: model.getValue(),
          language: model.getLanguageId(),
        },
        '*',
      );
    } else if (msg.type === 'SET_CODE') {
      model.setValue(msg.code);
    }
  });
}
```

JS/TS 说明（spec 的"优待"条款）：若页面 Monaco 已加载 `monaco.languages.typescript` 语言服务，语义级补全会自动出现，与我们的静态词典 Provider 并存（Monaco 会合并多个 Provider 的候选），无需额外开启代码；Task 5 验收时观察 JS 是否出现语义候选即可。

- [ ] **Step 2: 构建确认无类型错误**

Run: `npm run build`
Expected: 构建成功，`.output/chrome-mv3/` 里出现 monaco content script 产物。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: MAIN-world monaco bridge (completions, fetch intercept, code IO)"
```

---

### Task 5: 补全功能手动验收

- [ ] **Step 1: 重新加载插件并打开题目页**

`chrome://extensions` → LitCode → 刷新按钮，然后打开 `https://leetcode.com/problems/two-sum/`。

- [ ] **Step 2: 逐项验收（语言切到 Python3）**

| # | 操作 | 预期 |
|---|---|---|
| 1 | 代码区输入 `he` | 弹窗出现 `heappush/heapify/heappop` 等，带中文说明 |
| 2 | 输入 `nums.` | 弹出方法列表（append/sort/count…），继续输入 `so` 过滤到 `sort` |
| 3 | 选中候选按 Tab/Enter | 插入 `sort()` 且光标落在括号内 |
| 4 | 语言切换 Java，输入 `map.` | 弹出 put/getOrDefault/containsKey 等 |
| 5 | 语言切换 JavaScript，输入 `arr.` | 弹出 push/map/filter 等 |

- [ ] **Step 3: 若某项不符，回 Task 4 修复后重测；全部通过后 Commit（若有修复）**

```bash
git add -A && git commit -m "fix: completion tweaks after manual acceptance"
```

---

### Task 6: 题目信息提取与消息中转（isolated content script）

**Files:**
- Create: `entrypoints/leetcode.content.ts`

- [ ] **Step 1: 创建 `entrypoints/leetcode.content.ts`**

```ts
import type { ProblemMeta, RuntimeMessage } from '@/lib/types';
import { getStore, patchStore } from '@/lib/storage';

export default defineContentScript({
  matches: ['https://leetcode.com/problems/*'],
  runAt: 'document_idle',
  main() {
    trackSession();
    listenRuntimeMessages();
  },
});

// ---- 题目信息 ----
function currentSlug(): string | null {
  const m = location.pathname.match(/^\/problems\/([^/]+)/);
  return m ? m[1] : null;
}

export function readProblemMeta(): ProblemMeta | null {
  const slug = currentSlug();
  if (!slug) return null;
  // document.title 形如 "1. Two Sum - LeetCode" 或 "Two Sum - LeetCode"
  const t = document.title.replace(/ - LeetCode.*$/, '');
  const m = t.match(/^(\d+)\.\s*(.+)$/);
  const frontendId = m ? m[1] : '';
  const title = m ? m[2] : t;
  // 难度：页面上带 text-difficulty-* class 的元素（DOM 兜底，取不到则 null）
  const diffEl = document.querySelector('[class*="text-difficulty-"]');
  const diffText = diffEl?.textContent?.trim() ?? '';
  const difficulty = (['Easy', 'Medium', 'Hard'] as const).find((d) => d === diffText) ?? null;
  return { slug, frontendId, title, difficulty };
}

// ---- 面试计时 session：进入题目记录时间戳 ----
async function trackSession() {
  const slug = currentSlug();
  if (!slug) return;
  const store = await getStore();
  if (store.session?.slug !== slug) {
    await patchStore({ session: { slug, enteredAt: Date.now() } });
  }
}

// ---- side panel ⇄ 本脚本 ----
function listenRuntimeMessages() {
  chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
    if (msg.type === 'GET_PROBLEM') {
      sendResponse(readProblemMeta());
      return;
    }
    if (msg.type === 'GET_EDITOR_CODE') {
      requestCodeFromPage().then(sendResponse);
      return true; // async
    }
    if (msg.type === 'RESTORE_CODE') {
      window.postMessage({ source: 'litcode', type: 'SET_CODE', code: msg.code }, '*');
      sendResponse({ ok: true });
      return;
    }
  });
}

function requestCodeFromPage(): Promise<{ code: string; language: string } | null> {
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(null);
    }, 2000);
    function onMsg(ev: MessageEvent) {
      const d = ev.data;
      if (ev.source === window && d?.source === 'litcode' && d.type === 'CODE_VALUE' && d.requestId === requestId) {
        clearTimeout(timeout);
        window.removeEventListener('message', onMsg);
        resolve({ code: d.code, language: d.language });
      }
    }
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'litcode', type: 'GET_CODE', requestId }, '*');
  });
}
```

注意：提交结果的处理（SUBMISSION_RESULT → 记录 attempt）在 Task 9 加进这个文件，本任务只搭骨架。

- [ ] **Step 2: 构建确认**

Run: `npm run build`
Expected: 成功，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: problem meta extraction and runtime message bridge"
```

---

### Task 7: Side Panel 骨架（四标签页 + 当前题目）

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx`（整体替换）
- Create: `entrypoints/sidepanel/useProblem.ts`, `entrypoints/sidepanel/tabs/VideosTab.tsx`, `tabs/ReviewTab.tsx`, `tabs/SolutionsTab.tsx`, `tabs/InterviewTab.tsx`, `entrypoints/sidepanel/style.css`

- [ ] **Step 1: 创建 `entrypoints/sidepanel/useProblem.ts`（向活动标签页要题目信息，每 3 秒刷新）**

```ts
import { useEffect, useState } from 'react';
import type { ProblemMeta } from '@/lib/types';

export async function activeLeetCodeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id && tab.url?.startsWith('https://leetcode.com/problems/')) return tab.id;
  return null;
}

export function useProblem(): ProblemMeta | null {
  const [meta, setMeta] = useState<ProblemMeta | null>(null);
  useEffect(() => {
    let alive = true;
    async function poll() {
      const tabId = await activeLeetCodeTabId();
      if (!tabId) { if (alive) setMeta(null); return; }
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'GET_PROBLEM' });
        if (alive) setMeta(res ?? null);
      } catch { if (alive) setMeta(null); }
    }
    poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return meta;
}
```

- [ ] **Step 2: 替换 `entrypoints/sidepanel/App.tsx`**

```tsx
import { useState } from 'react';
import { useProblem } from './useProblem';
import VideosTab from './tabs/VideosTab';
import ReviewTab from './tabs/ReviewTab';
import SolutionsTab from './tabs/SolutionsTab';
import InterviewTab from './tabs/InterviewTab';
import './style.css';

const TABS = [
  { id: 'videos', label: '📺 视频' },
  { id: 'review', label: '📕 错题本' },
  { id: 'solutions', label: '💾 题解' },
  { id: 'interview', label: '⏱ 面试' },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('videos');
  const problem = useProblem();

  return (
    <div className="app">
      <header className="header">
        <strong>LitCode</strong>
        <span className="problem-title">
          {problem ? `${problem.frontendId}. ${problem.title}` : '未打开题目页'}
        </span>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {tab === 'videos' && <VideosTab problem={problem} />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'solutions' && <SolutionsTab problem={problem} />}
        {tab === 'interview' && <InterviewTab problem={problem} />}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: 创建四个占位 Tab（本任务只要求编译通过，后续任务逐个实现）**

`tabs/VideosTab.tsx`:

```tsx
import type { ProblemMeta } from '@/lib/types';
export default function VideosTab({ problem }: { problem: ProblemMeta | null }) {
  return <p>视频（Task 8 实现）</p>;
}
```

`tabs/ReviewTab.tsx`:

```tsx
export default function ReviewTab() {
  return <p>错题本（Task 11 实现）</p>;
}
```

`tabs/SolutionsTab.tsx`:

```tsx
import type { ProblemMeta } from '@/lib/types';
export default function SolutionsTab({ problem }: { problem: ProblemMeta | null }) {
  return <p>题解（Task 13 实现）</p>;
}
```

`tabs/InterviewTab.tsx`:

```tsx
import type { ProblemMeta } from '@/lib/types';
export default function InterviewTab({ problem }: { problem: ProblemMeta | null }) {
  return <p>面试模式（Task 14 实现）</p>;
}
```

- [ ] **Step 4: 创建 `entrypoints/sidepanel/style.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 -apple-system, "PingFang SC", sans-serif; color: #1a1a1a; }
.app { display: flex; flex-direction: column; height: 100vh; }
.header { padding: 10px 12px; border-bottom: 1px solid #eee; display: flex; gap: 8px; align-items: baseline; }
.problem-title { color: #666; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tabs { display: flex; border-bottom: 1px solid #eee; }
.tab { flex: 1; padding: 8px 0; border: none; background: none; cursor: pointer; font-size: 13px; color: #666; }
.tab.active { color: #0a7; border-bottom: 2px solid #0a7; font-weight: 600; }
.content { flex: 1; overflow-y: auto; padding: 12px; }
.card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.muted { color: #888; font-size: 12px; }
button.primary { background: #0a7; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
button.ghost { background: none; border: 1px solid #ccc; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
```

- [ ] **Step 5: 构建 + 手动验证**

Run: `npm run build`，重载插件。侧边栏出现四个标签页；打开 two-sum 题目页时 header 显示 "1. Two Sum"。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: side panel skeleton with four tabs and problem header"
```

---

### Task 8: 精选视频映射 + 视频 Tab

**Files:**
- Create: `assets/videos.ts`
- Modify: `entrypoints/sidepanel/tabs/VideosTab.tsx`（整体替换）
- Test: `tests/videos.test.ts`

- [ ] **Step 1: 写失败测试 `tests/videos.test.ts`**

```ts
import { expect, test } from 'vitest';
import { videoMap, searchUrl } from '../assets/videos';

test('video entries are well-formed', () => {
  for (const [slug, vids] of Object.entries(videoMap)) {
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(vids.length).toBeGreaterThan(0);
    for (const v of vids) {
      expect(v.videoId).toMatch(/^[\w-]{11}$/);
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.channel.length).toBeGreaterThan(0);
    }
  }
});

test('searchUrl builds a YouTube query', () => {
  expect(searchUrl('1', 'Two Sum')).toBe(
    'https://www.youtube.com/results?search_query=leetcode%201%20Two%20Sum',
  );
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/videos.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 创建 `assets/videos.ts`**

v1 内置 Blind 75 的 NeetCode 视频作为起步数据集（数据条目从 neetcode.io 公开页面逐题核对 videoId 填入；先填入下方 5 条验证功能，其余作为独立的内容补充工作在 Task 15 后进行，不阻塞任何功能开发）：

```ts
export interface VideoEntry {
  videoId: string; // YouTube 11 位 id
  title: string;
  channel: string;
}

export const videoMap: Record<string, VideoEntry[]> = {
  'two-sum': [
    { videoId: 'KLlXCFG5TnA', title: 'Two Sum - Leetcode 1 - HashMap - Python', channel: 'NeetCode' },
  ],
  'valid-parentheses': [
    { videoId: 'WTzjTskDFMg', title: 'Valid Parentheses - Stack - Leetcode 20 - Python', channel: 'NeetCode' },
  ],
  'best-time-to-buy-and-sell-stock': [
    { videoId: '1pkOgXD63yU', title: 'Best Time to Buy and Sell Stock - Leetcode 121 - Python', channel: 'NeetCode' },
  ],
  'valid-anagram': [
    { videoId: '9UtInBqnCgA', title: 'Valid Anagram - Leetcode 242 - Python', channel: 'NeetCode' },
  ],
  'contains-duplicate': [
    { videoId: '3OamzN90kPg', title: 'Contains Duplicate - Leetcode 217 - Python', channel: 'NeetCode' },
  ],
};

export function searchUrl(frontendId: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`leetcode ${frontendId} ${title}`)}`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/videos.test.ts`
Expected: PASS × 2

- [ ] **Step 5: 替换 `tabs/VideosTab.tsx`**

```tsx
import type { ProblemMeta } from '@/lib/types';
import { videoMap, searchUrl } from '@/assets/videos';

export default function VideosTab({ problem }: { problem: ProblemMeta | null }) {
  if (!problem) return <p className="muted">打开一道 LeetCode 题目后，这里会显示对应的解法视频。</p>;
  const videos = videoMap[problem.slug] ?? [];
  return (
    <div>
      {videos.map((v) => (
        <a key={v.videoId} className="card video-card" target="_blank" rel="noreferrer"
           href={`https://www.youtube.com/watch?v=${v.videoId}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <img src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} alt="" style={{ width: '100%', borderRadius: 6 }} />
          <div style={{ marginTop: 6 }}>{v.title}</div>
          <div className="muted">{v.channel}</div>
        </a>
      ))}
      {videos.length === 0 && <p className="muted">这道题暂无精选视频。</p>}
      <a className="ghost" style={{ display: 'inline-block', marginTop: 8, textDecoration: 'none', padding: '5px 10px', border: '1px solid #ccc', borderRadius: 6, color: 'inherit' }}
         target="_blank" rel="noreferrer" href={searchUrl(problem.frontendId, problem.title)}>
        🔍 在 YouTube 搜索这道题
      </a>
    </div>
  );
}
```

注：缩略图 `i.ytimg.com` 是一次图片加载，若想严格零请求可去掉 `<img>` 行，仅保留文字卡片——实现时保留，验收时由用户决定。

- [ ] **Step 6: 构建 + 手动验证**

打开 two-sum → 侧边栏视频页出现 NeetCode 卡片，点击在新标签页打开；打开一道映射外的题 → 显示搜索兜底按钮。

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: curated video map and videos tab"
```

---

### Task 9: SRS 间隔重复纯逻辑

**Files:**
- Create: `lib/srs.ts`
- Test: `tests/srs.test.ts`

- [ ] **Step 1: 写失败测试 `tests/srs.test.ts`**

```ts
import { expect, test } from 'vitest';
import { classifyResult, shouldEnroll, enroll, onReviewResult, isDue, STAGE_DAYS } from '../lib/srs';
import type { Attempt, ReviewItem } from '../lib/types';

const meta = { slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy' as const };
const attempt = (result: Attempt['result']): Attempt =>
  ({ ...meta, result, timestamp: 0, durationMs: null });

test('classifyResult maps LeetCode status_msg', () => {
  expect(classifyResult('Accepted')).toBe('AC');
  expect(classifyResult('Wrong Answer')).toBe('WA');
  expect(classifyResult('Time Limit Exceeded')).toBe('TLE');
  expect(classifyResult('Runtime Error')).toBe('OTHER');
});

test('shouldEnroll requires >= 2 failures', () => {
  expect(shouldEnroll([attempt('WA')])).toBe(false);
  expect(shouldEnroll([attempt('WA'), attempt('TLE')])).toBe(true);
  expect(shouldEnroll([attempt('WA'), attempt('AC')])).toBe(false);
});

test('enroll starts at stage 0, due in 3 days', () => {
  const item = enroll(meta, new Date('2026-07-03'));
  expect(item.stage).toBe(0);
  expect(item.dueDate).toBe('2026-07-06');
});

test('AC advances stage; final AC graduates (null)', () => {
  const s0 = enroll(meta, new Date('2026-07-03'));
  const s1 = onReviewResult(s0, 'AC', new Date('2026-07-06'))!;
  expect(s1.stage).toBe(1);
  expect(s1.dueDate).toBe('2026-07-13'); // +7
  const s2 = onReviewResult(s1, 'AC', new Date('2026-07-13'))!;
  expect(s2.stage).toBe(2);
  expect(s2.dueDate).toBe('2026-07-27'); // +14
  expect(onReviewResult(s2, 'AC', new Date('2026-07-27'))).toBeNull();
});

test('failure keeps stage and reschedules +3 days', () => {
  const s0 = enroll(meta, new Date('2026-07-03'));
  const s1 = onReviewResult(s0, 'WA', new Date('2026-07-06'))!;
  expect(s1.stage).toBe(0);
  expect(s1.dueDate).toBe('2026-07-09');
});

test('isDue compares by calendar date', () => {
  const item: ReviewItem = { ...meta, stage: 0, dueDate: '2026-07-06', addedAt: '2026-07-03' };
  expect(isDue(item, new Date('2026-07-05'))).toBe(false);
  expect(isDue(item, new Date('2026-07-06'))).toBe(true);
  expect(isDue(item, new Date('2026-07-08'))).toBe(true);
});

test('STAGE_DAYS is 3/7/14', () => {
  expect(STAGE_DAYS).toEqual([3, 7, 14]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/srs.test.ts`
Expected: FAIL（`lib/srs` 不存在）

- [ ] **Step 3: 创建 `lib/srs.ts`**

```ts
import type { Attempt, ReviewItem, SubmissionResult } from './types';

export const STAGE_DAYS = [3, 7, 14] as const;

export function classifyResult(statusMsg: string): SubmissionResult {
  if (statusMsg === 'Accepted') return 'AC';
  if (statusMsg === 'Wrong Answer') return 'WA';
  if (statusMsg === 'Time Limit Exceeded') return 'TLE';
  return 'OTHER';
}

export function shouldEnroll(attempts: Attempt[]): boolean {
  const fails = attempts.filter((a) => a.result === 'WA' || a.result === 'TLE').length;
  return fails >= 2;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(from: Date, days: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

type Meta = Pick<ReviewItem, 'slug' | 'title' | 'difficulty'>;

export function enroll(meta: Meta, now: Date): ReviewItem {
  return { ...meta, stage: 0, dueDate: addDays(now, STAGE_DAYS[0]), addedAt: isoDate(now) };
}

/** AC → 推进一档或毕业（返回 null）；失败 → 原档 +3 天重排 */
export function onReviewResult(item: ReviewItem, result: SubmissionResult, now: Date): ReviewItem | null {
  if (result === 'AC') {
    const nextStage = item.stage + 1;
    if (nextStage > 2) return null; // 毕业
    return { ...item, stage: nextStage as 1 | 2, dueDate: addDays(now, STAGE_DAYS[nextStage]) };
  }
  return { ...item, dueDate: addDays(now, STAGE_DAYS[0]) };
}

export function isDue(item: ReviewItem, now: Date): boolean {
  return item.dueDate <= isoDate(now);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/srs.test.ts`
Expected: PASS × 7

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: spaced-repetition scheduling logic"
```

---

### Task 10: 提交结果接入错题本（content script 落库）

**Files:**
- Modify: `entrypoints/leetcode.content.ts`

- [ ] **Step 1: 在 `main()` 里追加 `listenSubmissions();`，并在文件末尾追加**

```ts
import { classifyResult, shouldEnroll, enroll, onReviewResult, isDue } from '@/lib/srs';
// （import 合并到文件顶部）

function listenSubmissions() {
  window.addEventListener('message', async (ev: MessageEvent) => {
    const d = ev.data;
    if (ev.source !== window || d?.source !== 'litcode' || d.type !== 'SUBMISSION_RESULT') return;
    const meta = readProblemMeta();
    if (!meta) return;
    const now = new Date();
    const store = await getStore();
    const result = classifyResult(d.statusMsg);
    const durationMs = store.session?.slug === meta.slug ? Date.now() - store.session.enteredAt : null;

    const attempts = { ...store.attempts };
    attempts[meta.slug] = [
      ...(attempts[meta.slug] ?? []),
      { slug: meta.slug, title: meta.title, difficulty: meta.difficulty, result, timestamp: Date.now(), durationMs },
    ];

    const reviewQueue = { ...store.reviewQueue };
    const existing = reviewQueue[meta.slug];
    if (existing) {
      // 已在错题本：只有"到期后重做"才推进；未到期的 AC 不动
      if (isDue(existing, now) || result !== 'AC') {
        const next = onReviewResult(existing, result, now);
        if (next) reviewQueue[meta.slug] = next;
        else delete reviewQueue[meta.slug]; // 毕业
      }
    } else {
      // 入本条件：失败 ≥2 次，或 AC 但用时严重超时（> 2× 目标，spec 面试模式条款）
      const target = meta.difficulty
        ? store.settings.targetMinutes[meta.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard']
        : store.settings.targetMinutes.medium;
      const severeOvertime = result === 'AC' && durationMs !== null && durationMs > 2 * target * 60_000;
      if (shouldEnroll(attempts[meta.slug]) || severeOvertime) {
        reviewQueue[meta.slug] = enroll(meta, now);
      }
    }

    await patchStore({ attempts, reviewQueue });
  });
}
```

- [ ] **Step 2: 构建 + 手动验证**

重载插件，打开 two-sum：
1. 故意提交一个错误解 ×2 → DevTools → `chrome.storage.local.get(console.log)`（在侧边栏页面的 DevTools 里执行）→ `reviewQueue['two-sum']` 存在，stage 0
2. 提交正确解 → attempts 里新增一条 `result: 'AC'`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: record submissions and enroll failures into review queue"
```

---

### Task 11: 错题本 Tab + 图标 badge

**Files:**
- Modify: `entrypoints/sidepanel/tabs/ReviewTab.tsx`（整体替换）、`entrypoints/background.ts`（整体替换）
- Create: `entrypoints/sidepanel/useStore.ts`

- [ ] **Step 1: 创建 `entrypoints/sidepanel/useStore.ts`（订阅 storage 变化的 React hook）**

```ts
import { useEffect, useState } from 'react';
import { getStore } from '@/lib/storage';
import type { StoreShape } from '@/lib/types';

export function useStore(): StoreShape | null {
  const [store, setStore] = useState<StoreShape | null>(null);
  useEffect(() => {
    getStore().then(setStore);
    const onChange = () => getStore().then(setStore);
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return store;
}
```

- [ ] **Step 2: 替换 `tabs/ReviewTab.tsx`**

```tsx
import { getStore, patchStore } from '@/lib/storage';
import { enroll, isDue, STAGE_DAYS } from '@/lib/srs';
import type { ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';

export default function ReviewTab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  if (!store) return null;
  const items = Object.values(store.reviewQueue);
  const now = new Date();
  const due = items.filter((i) => isDue(i, now));
  const upcoming = items.filter((i) => !isDue(i, now)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  async function markForReview() {
    if (!problem) return;
    const s = await getStore();
    if (s.reviewQueue[problem.slug]) return;
    await patchStore({ reviewQueue: { ...s.reviewQueue, [problem.slug]: enroll(problem, new Date()) } });
  }

  async function remove(slug: string) {
    const s = await getStore();
    const q = { ...s.reviewQueue };
    delete q[slug];
    await patchStore({ reviewQueue: q });
  }

  const row = (i: (typeof items)[number], dueNow: boolean) => (
    <div className="card" key={i.slug}>
      <a href={`https://leetcode.com/problems/${i.slug}/`} target="_blank" rel="noreferrer">{i.title}</a>
      <div className="muted">
        {dueNow ? '今日到期' : `${i.dueDate} 到期`} · 第 {i.stage + 1}/3 轮（{STAGE_DAYS[i.stage]} 天档）
        <button className="ghost" style={{ float: 'right' }} onClick={() => remove(i.slug)}>移除</button>
      </div>
    </div>
  );

  return (
    <div>
      {problem && !store.reviewQueue[problem.slug] && (
        <button className="primary" onClick={markForReview}>➕ 把当前题目标记重做</button>
      )}
      <h3>今日到期（{due.length}）</h3>
      {due.length === 0 ? <p className="muted">没有到期题目 🎉</p> : due.map((i) => row(i, true))}
      <h3>待复习（{upcoming.length}）</h3>
      {upcoming.map((i) => row(i, false))}
    </div>
  );
}
```

同时在 `App.tsx` 中把 `<ReviewTab />` 改为 `<ReviewTab problem={problem} />`。

- [ ] **Step 3: 替换 `entrypoints/background.ts`（badge 显示今日到期数）**

```ts
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
```

并在 `wxt.config.ts` 的 permissions 中加入 `'alarms'`。

- [ ] **Step 4: 构建 + 手动验证**

重载插件：错题本页显示 Task 10 里造出的 two-sum 条目；「标记重做」对当前题可用；手动把 storage 里 dueDate 改成今天（DevTools）后 badge 显示 1。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: review tab and due-count badge"
```

---

### Task 12: 题解槽位纯逻辑

**Files:**
- Create: `lib/solutions.ts`
- Test: `tests/solutions.test.ts`

- [ ] **Step 1: 写失败测试 `tests/solutions.test.ts`**

```ts
import { expect, test } from 'vitest';
import { MAX_SLOTS, saveVersion, canSaveWithoutOverwrite } from '../lib/solutions';
import type { SolutionVersion } from '../lib/types';

const v = (label: string): SolutionVersion =>
  ({ label, language: 'python3', code: 'pass', savedAt: 0 });

test('MAX_SLOTS is 3', () => {
  expect(MAX_SLOTS).toBe(3);
});

test('saveVersion appends when slots available', () => {
  const next = saveVersion([v('a')], v('b'), null);
  expect(next.map((x) => x.label)).toEqual(['a', 'b']);
});

test('saveVersion overwrites given slot index when full', () => {
  const full = [v('a'), v('b'), v('c')];
  const next = saveVersion(full, v('d'), 1);
  expect(next.map((x) => x.label)).toEqual(['a', 'd', 'c']);
});

test('saveVersion throws when full and no slot chosen', () => {
  const full = [v('a'), v('b'), v('c')];
  expect(() => saveVersion(full, v('d'), null)).toThrow();
});

test('canSaveWithoutOverwrite', () => {
  expect(canSaveWithoutOverwrite([v('a'), v('b')])).toBe(true);
  expect(canSaveWithoutOverwrite([v('a'), v('b'), v('c')])).toBe(false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/solutions.test.ts`
Expected: FAIL（`lib/solutions` 不存在）

- [ ] **Step 3: 创建 `lib/solutions.ts`**

```ts
import type { SolutionVersion } from './types';

export const MAX_SLOTS = 3;

export function canSaveWithoutOverwrite(versions: SolutionVersion[]): boolean {
  return versions.length < MAX_SLOTS;
}

/** 槽位未满时 overwriteIndex 传 null 追加；已满必须指定要覆盖的下标 */
export function saveVersion(
  versions: SolutionVersion[],
  incoming: SolutionVersion,
  overwriteIndex: number | null,
): SolutionVersion[] {
  if (overwriteIndex !== null) {
    if (overwriteIndex < 0 || overwriteIndex >= versions.length) throw new Error('bad slot');
    return versions.map((v, i) => (i === overwriteIndex ? incoming : v));
  }
  if (!canSaveWithoutOverwrite(versions)) throw new Error('slots full, must choose overwrite');
  return [...versions, incoming];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/solutions.test.ts`
Expected: PASS × 5

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: solution slot management logic"
```

---

### Task 13: 题解 Tab（保存 / 恢复 / 复制 / 删除）

**Files:**
- Modify: `entrypoints/sidepanel/tabs/SolutionsTab.tsx`（整体替换）

- [ ] **Step 1: 替换 `tabs/SolutionsTab.tsx`**

```tsx
import { useState } from 'react';
import { getStore, patchStore } from '@/lib/storage';
import { MAX_SLOTS, canSaveWithoutOverwrite, saveVersion } from '@/lib/solutions';
import type { ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';
import { activeLeetCodeTabId } from '../useProblem';

export default function SolutionsTab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  if (!store) return null;
  if (!problem) return <p className="muted">打开一道题目后可保存该题的代码版本（最多 {MAX_SLOTS} 个）。</p>;
  const versions = store.solutions[problem.slug] ?? [];

  async function grabCode() {
    const tabId = await activeLeetCodeTabId();
    if (!tabId) return null;
    return (await chrome.tabs.sendMessage(tabId, { type: 'GET_EDITOR_CODE' })) as
      | { code: string; language: string } | null;
  }

  async function persist(overwriteIndex: number | null) {
    const grabbed = await grabCode();
    if (!grabbed) { alert('读取编辑器失败，请确认题目页已加载'); return; }
    const label = prompt('给这个版本起个名字（如：暴力解 / 最优 O(n)）', `版本 ${versions.length + 1}`);
    if (label === null) return;
    const s = await getStore();
    const cur = s.solutions[problem!.slug] ?? [];
    const next = saveVersion(cur, { label, language: grabbed.language, code: grabbed.code, savedAt: Date.now() }, overwriteIndex);
    await patchStore({ solutions: { ...s.solutions, [problem!.slug]: next } });
    setPendingOverwrite(false);
  }

  async function onSaveClick() {
    if (canSaveWithoutOverwrite(versions)) await persist(null);
    else setPendingOverwrite(true); // 进入"点击某个卡片以覆盖"状态
  }

  async function restore(code: string) {
    if (!confirm('恢复会覆盖编辑器中当前的代码，确定？')) return;
    const tabId = await activeLeetCodeTabId();
    if (tabId) await chrome.tabs.sendMessage(tabId, { type: 'RESTORE_CODE', code });
  }

  async function remove(index: number) {
    const s = await getStore();
    const next = (s.solutions[problem!.slug] ?? []).filter((_, i) => i !== index);
    await patchStore({ solutions: { ...s.solutions, [problem!.slug]: next } });
  }

  return (
    <div>
      <button className="primary" onClick={onSaveClick}>
        💾 保存当前代码（{versions.length}/{MAX_SLOTS}）
      </button>
      {pendingOverwrite && <p className="muted">槽位已满：点击下方某个版本的「覆盖」，或 <button className="ghost" onClick={() => setPendingOverwrite(false)}>取消</button></p>}
      {versions.map((v, i) => (
        <div className="card" key={i}>
          <strong>{v.label}</strong>
          <span className="muted"> · {v.language} · {new Date(v.savedAt).toLocaleString()}</span>
          <pre style={{ maxHeight: 120, overflow: 'auto', background: '#f7f7f7', padding: 8, borderRadius: 6 }}>{v.code}</pre>
          <button className="ghost" onClick={() => restore(v.code)}>恢复到编辑器</button>{' '}
          <button className="ghost" onClick={() => navigator.clipboard.writeText(v.code)}>复制</button>{' '}
          <button className="ghost" onClick={() => remove(i)}>删除</button>{' '}
          {pendingOverwrite && <button className="primary" onClick={() => persist(i)}>覆盖此槽</button>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 构建 + 手动验证**

| # | 操作 | 预期 |
|---|---|---|
| 1 | 题目页写几行代码 → 保存当前代码 | 输入备注后出现版本卡片，含代码预览 |
| 2 | 连续保存到 3 个 | 按钮再点进入"选择覆盖"状态，选一个槽后旧版本被替换 |
| 3 | 点「恢复到编辑器」 | 弹确认后编辑器内容被替换 |
| 4 | 复制 / 删除 | 剪贴板拿到代码；卡片消失 |

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: solutions tab with save/restore/copy/delete"
```

---

### Task 14: 面试模式（计时 + 隐藏干扰 + 超时提醒）

**Files:**
- Modify: `entrypoints/sidepanel/tabs/InterviewTab.tsx`（整体替换）、`entrypoints/leetcode.content.ts`（追加 CSS 注入）

- [ ] **Step 1: `leetcode.content.ts` 的 `main()` 追加 `applyInterviewCss();`，文件末尾追加**

```ts
const INTERVIEW_CSS = `
  [class*="text-difficulty-"],
  div[class*="acceptance"],
  button[aria-label*="like" i],
  a[href$="/discuss/"], a[href*="/discussion"] { visibility: hidden !important; }
`;

async function applyInterviewCss() {
  const update = async () => {
    const { settings } = await getStore();
    let el = document.getElementById('litcode-interview') as HTMLStyleElement | null;
    if (settings.interviewMode) {
      if (!el) {
        el = document.createElement('style');
        el.id = 'litcode-interview';
        document.head.appendChild(el);
      }
      el.textContent = INTERVIEW_CSS;
    } else {
      el?.remove();
    }
  };
  await update();
  chrome.storage.onChanged.addListener(update);
}
```

- [ ] **Step 2: 替换 `tabs/InterviewTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { getStore, patchStore } from '@/lib/storage';
import type { ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';

export default function InterviewTab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!store) return null;
  const { settings, session } = store;

  async function toggle() {
    const s = await getStore();
    await patchStore({ settings: { ...s.settings, interviewMode: !s.settings.interviewMode } });
  }

  async function setTarget(key: 'easy' | 'medium' | 'hard', minutes: number) {
    const s = await getStore();
    await patchStore({ settings: { ...s.settings, targetMinutes: { ...s.settings.targetMinutes, [key]: minutes } } });
  }

  async function restartTimer() {
    if (!problem) return;
    await patchStore({ session: { slug: problem.slug, enteredAt: Date.now() } });
  }

  const timing = settings.interviewMode && problem && session?.slug === problem.slug;
  const elapsedMin = timing ? (nowMs - session!.enteredAt) / 60000 : 0;
  const targetMin = problem?.difficulty
    ? settings.targetMinutes[problem.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard']
    : settings.targetMinutes.medium;
  const over = elapsedMin > targetMin;

  return (
    <div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={settings.interviewMode} onChange={toggle} />
        面试模式（隐藏难度/通过率/讨论区，进入题目自动计时）
      </label>

      {timing && (
        <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: over ? '#d33' : '#0a7' }}>
            {Math.floor(elapsedMin)}:{String(Math.floor((elapsedMin % 1) * 60)).padStart(2, '0')}
          </div>
          <div className="muted">目标 {targetMin} 分钟{over && ' · 已超时！'}</div>
          <button className="ghost" onClick={restartTimer}>重新计时</button>
        </div>
      )}

      <h3>目标时间（分钟）</h3>
      {(['easy', 'medium', 'hard'] as const).map((k) => (
        <label key={k} style={{ display: 'block', marginBottom: 6 }}>
          {k}: <input type="number" min={1} value={settings.targetMinutes[k]}
            onChange={(e) => setTarget(k, Number(e.target.value) || 1)} style={{ width: 60 }} />
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 构建 + 手动验证**

开启面试模式 → 题目页难度标签消失、通过率消失；侧边栏计时器走动；改目标时间为 1 分钟等待超时 → 数字变红。关闭面试模式 → 页面元素恢复。

注：LeetCode 的 class 名可能变化，验收时若隐藏不完整，按当时 DOM 调整 `INTERVIEW_CSS` 选择器。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: interview mode with timer and distraction hiding"
```

---

### Task 15: 导出 / 导入 + 收尾

**Files:**
- Modify: `entrypoints/sidepanel/tabs/InterviewTab.tsx`（追加数据管理区块）

- [ ] **Step 1: 在 `InterviewTab` 组件 return 的最后（目标时间设置之后）追加**

```tsx
<h3>数据管理</h3>
<button className="ghost" onClick={exportData}>导出 JSON</button>{' '}
<label className="ghost" style={{ display: 'inline-block' }}>
  导入 JSON<input type="file" accept=".json" hidden onChange={importData} />
</label>
```

并在组件内添加两个函数：

```tsx
async function exportData() {
  const s = await getStore();
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `litcode-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importData(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (typeof parsed !== 'object' || !parsed.attempts || !parsed.reviewQueue || !parsed.solutions) {
      throw new Error('bad shape');
    }
    if (!confirm('导入会覆盖当前全部数据，确定？')) return;
    await patchStore(parsed);
    alert('导入成功');
  } catch {
    alert('文件格式不正确，导入失败');
  }
}
```

- [ ] **Step 2: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全部 PASS，构建成功。

- [ ] **Step 3: 端到端手动验收（最终清单）**

| # | 功能 | 验收 |
|---|---|---|
| 1 | 补全 | Python/Java/JS 三语言字母与 `.` 触发均工作 |
| 2 | 视频 | 精选命中显示卡片，未命中显示搜索按钮 |
| 3 | 错题本 | 2 次失败自动入本；AC 推进档位；badge 正确 |
| 4 | 题解 | 3 槽保存/覆盖/恢复/复制/删除全通 |
| 5 | 面试模式 | 计时、隐藏、超时变红、关闭恢复 |
| 6 | 数据 | 导出的 JSON 再导入后数据一致 |

- [ ] **Step 4: 更新 README（简短：是什么、如何构建、如何加载）并最终提交**

```bash
git add -A && git commit -m "feat: data export/import and final polish"
```

---

## 后续内容工作（不阻塞 v1）

- 扩充 `assets/videos.ts` 至 NeetCode 全集（~600 题），从 neetcode.io 公开的 practice 页面逐题核对 videoId
- 按实际刷题体验补充词典条目（结构与测试已固定，加词即改数据 + MUST_HAVE 清单）
