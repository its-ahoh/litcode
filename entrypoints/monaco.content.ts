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

// LeetCode disables several editor interaction features: the suggestion popup
// (quickSuggestions/suggestOnTriggerCharacters) and Monaco's built-in context menu
// (contextmenu:false, which lets right-click fall through to the browser's native menu,
// leaving nowhere for our addAction items to show). Force these back on here.
const EDITOR_OPTIONS = {
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
  contextmenu: true,
};

function enableSuggestUI(monaco: any) {
  for (const ed of monaco.editor.getEditors?.() ?? []) {
    ed.updateOptions?.(EDITOR_OPTIONS);
  }
  // Editors created afterwards (e.g. language switch/layout rebuild) get overridden a tick later,
  // to make sure it overrides LeetCode's initial options
  monaco.editor.onDidCreateEditor?.((ed: any) => {
    setTimeout(() => ed.updateOptions?.(EDITOR_OPTIONS), 0);
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
        resolve(null); // fail silently
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
        // After "." only show methods; otherwise show all non-method items
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

// ---- Editor context menu: register LitCode AI actions (Monaco's own menu; native contextMenus can't inject here) ----
function registerContextActions(monaco: any) {
  const register = (ed: any) => {
    if (!ed?.addAction || ed.__litcodeActions) return;
    ed.__litcodeActions = true;
    const post = (action: string, editor: any) => {
      let selection = '';
      try {
        const sel = editor.getSelection?.();
        if (sel && !sel.isEmpty()) selection = editor.getModel().getValueInRange(sel);
      } catch { /* selection stays empty */ }
      window.postMessage({ source: 'litcode', type: 'AI_ACTION', action, selection }, '*');
    };
    ed.addAction({
      id: 'litcode-hint',
      label: 'LitCode: Get a hint',
      contextMenuGroupId: 'litcode',
      contextMenuOrder: 1,
      run: (e: any) => post('hint', e),
    });
    ed.addAction({
      id: 'litcode-explain-selection',
      label: 'LitCode: Explain selection',
      contextMenuGroupId: 'litcode',
      contextMenuOrder: 2,
      precondition: 'editorHasSelection',
      run: (e: any) => post('explain-selection', e),
    });
    ed.addAction({
      id: 'litcode-explain-solution',
      label: 'LitCode: Get solutions',
      contextMenuGroupId: 'litcode',
      contextMenuOrder: 3,
      run: (e: any) => post('explain-solution', e),
    });
  };
  for (const ed of monaco.editor.getEditors?.() ?? []) register(ed);
  monaco.editor.onDidCreateEditor?.((ed: any) => setTimeout(() => register(ed), 0));
}

// ---- Submission result interception ----
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
    } catch { /* interception failure doesn't affect the original request */ }
    return res;
  };
}

// ---- Code read/write bridge (for solution archiving) ----
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
      // Selected snippet: take the active editor's selection (empty selection → empty string)
      let selection = '';
      try {
        const sel = active?.getSelection?.();
        if (sel && !sel.isEmpty()) selection = active.getModel().getValueInRange(sel);
      } catch { /* ignore, selection stays empty */ }
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
