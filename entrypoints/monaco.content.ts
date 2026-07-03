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
