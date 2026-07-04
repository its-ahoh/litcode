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
        enableSuggestUI(monaco);
        registerProviders(monaco);
        setupCodeBridge(monaco);
        registerContextActions(monaco);
      }
    });
  },
});

// LeetCode 给免费用户创建编辑器时会关闭建议弹窗（quickSuggestions 全 false、
// suggestOnTriggerCharacters false），Provider 注册了也不会弹出，必须重新打开。
const SUGGEST_OPTIONS = {
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
};

function enableSuggestUI(monaco: any) {
  for (const ed of monaco.editor.getEditors?.() ?? []) {
    ed.updateOptions?.(SUGGEST_OPTIONS);
  }
  // 之后新建的编辑器（如切换语言/布局重建）延后一拍覆盖，确保盖过 LeetCode 的初始选项
  monaco.editor.onDidCreateEditor?.((ed: any) => {
    setTimeout(() => ed.updateOptions?.(SUGGEST_OPTIONS), 0);
  });
}

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
  constant: 'Constant',
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

// ---- 编辑器右键菜单：注册 LitCode AI 动作（Monaco 自带菜单，原生 contextMenus 插不进去）----
function registerContextActions(monaco: any) {
  const register = (ed: any) => {
    if (!ed?.addAction || ed.__litcodeActions) return;
    ed.__litcodeActions = true;
    const post = (action: string, editor: any) => {
      let selection = '';
      try {
        const sel = editor.getSelection?.();
        if (sel && !sel.isEmpty()) selection = editor.getModel().getValueInRange(sel);
      } catch { /* selection 保持空串 */ }
      window.postMessage({ source: 'litcode', type: 'AI_ACTION', action, selection }, '*');
    };
    ed.addAction({
      id: 'litcode-hint',
      label: '💡 LitCode: Get a hint',
      contextMenuGroupId: 'litcode',
      contextMenuOrder: 1,
      run: (e: any) => post('hint', e),
    });
    ed.addAction({
      id: 'litcode-explain-selection',
      label: '✨ LitCode: Explain selection',
      contextMenuGroupId: 'litcode',
      contextMenuOrder: 2,
      precondition: 'editorHasSelection',
      run: (e: any) => post('explain-selection', e),
    });
    ed.addAction({
      id: 'litcode-explain-solution',
      label: '📖 LitCode: Explain my solution',
      contextMenuGroupId: 'litcode',
      contextMenuOrder: 3,
      run: (e: any) => post('explain-solution', e),
    });
  };
  for (const ed of monaco.editor.getEditors?.() ?? []) register(ed);
  monaco.editor.onDidCreateEditor?.((ed: any) => setTimeout(() => register(ed), 0));
}

// ---- 提交结果拦截 ----
function interceptFetch() {
  const orig = window.fetch;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await orig(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const m = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
      if (m) {
        res.clone().json().then((data: any) => {
          if (data?.state === 'SUCCESS' && data?.status_msg) {
            window.postMessage(
              { source: 'litcode', type: 'SUBMISSION_RESULT', statusMsg: data.status_msg, submissionId: m[1] },
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
    // Prefer the model of the focused/active code editor if available
    const editors = monaco.editor.getEditors?.() ?? [];
    const active = editors.find((e: any) => e.hasTextFocus?.()) ?? editors[0];
    const model =
      active?.getModel?.() ??
      monaco.editor.getModels().find((m: any) => m.uri.scheme !== 'output') ??
      monaco.editor.getModels()[0];
    if (!model) return;
    if (msg.type === 'GET_CODE') {
      // 选中片段：取当前活跃编辑器的 selection（空选区 → 空串）
      let selection = '';
      try {
        const sel = active?.getSelection?.();
        if (sel && !sel.isEmpty()) selection = active.getModel().getValueInRange(sel);
      } catch { /* 忽略，selection 保持空串 */ }
      window.postMessage(
        {
          source: 'litcode',
          type: 'CODE_VALUE',
          requestId: msg.requestId,
          code: model.getValue(),
          language: model.getLanguageId(),
          selection,
        },
        '*',
      );
    } else if (msg.type === 'SET_CODE') {
      model.setValue(msg.code);
    }
  });
}
