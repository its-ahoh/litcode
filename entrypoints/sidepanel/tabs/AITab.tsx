import { useEffect, useRef, useState } from 'react';
import { getStore, patchStore, updateStore } from '@/lib/storage';
import { chat, DEFAULT_MODELS, type ChatMsg } from '@/lib/ai';
import type { AiSettings, ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';
import { activeLeetCodeTabId } from '../useProblem';
import Markdown from '../Markdown';

const MAX_HINT_LEVEL = 4;
const HISTORY_CAP = 16; // 发给 API 的最近轮次上限

// UI 轮次：content 是实际发送的完整 prompt，display 是气泡里展示的短标签
interface Turn extends ChatMsg {
  display: string;
}

export default function AITab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const slug = problem?.slug ?? null;
  // 切换题目 → 重置对话
  useEffect(() => {
    setTurns([]);
    setHintLevel(0);
    setError('');
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  // 编辑器右键触发的动作：从 session 存储取出并执行。
  // 必须在任何早返回之前声明（Hooks 规则）；内部自行判断就绪状态，无依赖数组保证闭包新鲜。
  useEffect(() => {
    async function consumePending() {
      if (busy || !store?.settings.ai.apiKey) return; // key 未配 / 忙时先不消费，留待就绪后再触发
      const r = await chrome.storage.session.get('pendingAiAction');
      const p = r?.pendingAiAction as { action: string; selection: string; ts: number } | undefined;
      if (!p) return;
      await chrome.storage.session.remove('pendingAiAction');
      if (Date.now() - p.ts > 30_000) return; // 过期动作丢弃
      if (p.action === 'hint') hint();
      else if (p.action === 'explain-selection') explainSelection(p.selection);
      else if (p.action === 'explain-solution') explainSolution();
    }
    consumePending();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.pendingAiAction?.newValue) consumePending();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  });

  if (!store) return null;
  const ai = store.settings.ai;
  const configured = ai.apiKey.length > 0;

  async function setAi(patch: Partial<AiSettings>) {
    await updateStore((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, ...patch } } }));
  }

  async function grab() {
    const tabId = await activeLeetCodeTabId();
    if (!tabId) return null;
    try {
      return (await chrome.tabs.sendMessage(tabId, { type: 'GET_EDITOR_CODE' })) as
        | { code: string; language: string; selection: string } | null;
    } catch {
      return null; // content script 未就绪 / 非题目页：不抛未捕获 rejection
    }
  }

  async function grabProblemText(): Promise<string | null> {
    const tabId = await activeLeetCodeTabId();
    if (!tabId) return null;
    try {
      return (await chrome.tabs.sendMessage(tabId, { type: 'GET_PROBLEM_TEXT' })) as string | null;
    } catch {
      return null;
    }
  }

  function problemHeader(): string {
    return problem
      ? `LeetCode ${problem.frontendId}. ${problem.title} (${problem.difficulty ?? 'unknown difficulty'})`
      : 'A LeetCode problem';
  }

  /** 发送一轮：把新 user turn 加入历史并请求回复 */
  async function send(turn: Turn) {
    setError('');
    setBusy(true);
    const nextTurns = [...turns, turn];
    setTurns(nextTurns);
    try {
      const history: ChatMsg[] = nextTurns
        .slice(-HISTORY_CAP)
        .map(({ role, content }) => ({ role, content }));
      const reply = await chat(ai, history);
      setTurns([...nextTurns, { role: 'assistant', content: reply, display: reply }]);
    } catch (e) {
      setTurns(turns); // 回滚本轮，避免残留没有回复的提问
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- 三个快捷动作 ----

  async function hint() {
    const level = hintLevel + 1;
    let content: string;
    if (level === 1) {
      const desc = await grabProblemText();
      content =
        `${problemHeader()}\n\n` +
        (desc ? `Problem statement:\n${desc}\n\n` : '') +
        `I'm stuck. Give me HINT level 1/${MAX_HINT_LEVEL} only.`;
    } else {
      content = `That's not enough. Give me HINT level ${level}/${MAX_HINT_LEVEL} now.`;
    }
    setHintLevel(level);
    await send({ role: 'user', content, display: `💡 Hint ${level}/${MAX_HINT_LEVEL}` });
  }

  async function explainSelection(presetSelection?: string) {
    const grabbed = await grab();
    if (!grabbed) { setError('Failed to read the editor — make sure the problem page is loaded.'); return; }
    let excerpt = (presetSelection ?? grabbed.selection).trim();
    let source = 'selection';
    if (!excerpt) {
      // 编辑器无选区 → 尝试剪贴板兜底
      try {
        excerpt = (await navigator.clipboard.readText()).trim();
        source = 'clipboard';
      } catch { /* 剪贴板不可读则保持空 */ }
    }
    if (!excerpt) {
      setError('Nothing selected — select code in the editor (or copy it), then click again.');
      return;
    }
    const content =
      `${problemHeader()}\n\nFull ${grabbed.language} code for context:\n\`\`\`${grabbed.language}\n${grabbed.code}\n\`\`\`\n\n` +
      `Explain specifically this excerpt (from my ${source}), line-by-line where useful:\n\`\`\`${grabbed.language}\n${excerpt}\n\`\`\``;
    const preview = excerpt.length > 60 ? `${excerpt.slice(0, 60)}…` : excerpt;
    await send({ role: 'user', content, display: `✨ Explain ${source}: \`${preview}\`` });
  }

  async function explainSolution() {
    const grabbed = await grab();
    if (!grabbed || !grabbed.code.trim()) {
      setError('Failed to read the editor — make sure the problem page is loaded.');
      return;
    }
    const content =
      `${problemHeader()}\n\nExplain my ${grabbed.language} solution:\n\`\`\`${grabbed.language}\n${grabbed.code}\n\`\`\``;
    await send({ role: 'user', content, display: 'Get solutions' });
  }

  async function sendInput() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await send({ role: 'user', content: text, display: text });
  }

  // ---- 数据导出/导入 ----
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
      if (!confirm('Importing will overwrite all current data. Continue?')) return;
      await patchStore(parsed);
      alert('Import successful');
    } catch {
      alert('Invalid file format — import failed.');
    }
  }

  async function saveKey() {
    await setAi({ apiKey: keyDraft.trim() });
    setKeyDraft('');
    setEditingKey(false);
  }

  const disabled = busy || !configured;

  return (
    <div className="chat">
      {!configured && <p className="muted">Add an API key below to enable the AI tutor.</p>}

      <div className="chat-log">
        {turns.length === 0 && !busy && !error && configured && (
          <div className="empty-state">
            <div className="empty-title">Ask me anything about this problem</div>
            <p className="muted">Type a question below to start chatting — or use a shortcut:</p>
            <ul className="empty-list muted">
              <li><strong>Hint</strong> — nudges you level by level (1 → 4), no spoilers until you ask.</li>
              <li><strong>Explain selection</strong> — explains the code you've selected in the editor.</li>
              <li><strong>Get solutions</strong> — walks through your whole current solution.</li>
            </ul>
            <p className="muted">Tip: right-click inside the LeetCode editor for the same shortcuts.</p>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div className="bubble user" key={i}>{t.display}</div>
          ) : (
            <div className="bubble assistant" key={i}>
              <Markdown text={t.content} />
              <button className="ghost small copy-btn" onClick={() => navigator.clipboard.writeText(t.content)}>Copy</button>
            </div>
          ),
        )}
        {busy && (
          <div className="bubble assistant thinking">
            <span className="spinner" /> Thinking…
          </div>
        )}
        {error && <div className="card error-card">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input">
        <input
          type="text"
          value={input}
          placeholder={!configured ? 'Set up API key first' : turns.length ? 'Ask a follow-up…' : 'Ask anything about this problem…'}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendInput(); }}
        />
        <button className="primary" disabled={disabled || !input.trim()} onClick={sendInput}>Send</button>
      </div>

      <div className="action-row">
        <button className="action" disabled={disabled || hintLevel >= MAX_HINT_LEVEL} onClick={hint}>
          💡 {hintLevel === 0 ? 'Hint' : `Hint ${Math.min(hintLevel + 1, MAX_HINT_LEVEL)}/${MAX_HINT_LEVEL}`}
        </button>
        <button className="action" disabled={disabled} onClick={() => explainSelection()}>✨ Explain Selection</button>
        <button className="action" disabled={disabled} onClick={explainSolution}>📖 Get Solutions</button>
      </div>
      {turns.length > 0 && (
        <button className="ghost small clear-btn" disabled={busy} onClick={() => { setTurns([]); setHintLevel(0); setError(''); }}>
          Clear chat
        </button>
      )}

      <details className="settings" open={!configured}>
        <summary>⚙️ AI settings {configured ? '' : '· setup required'}</summary>
        <label className="field">
          Provider
          <select value={ai.provider} onChange={(e) => setAi({ provider: e.target.value as AiSettings['provider'] })}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI / compatible</option>
          </select>
        </label>

        <div className="field">
          API key
          {configured && !editingKey ? (
            <div className="keyrow">
              <code className="masked">••••••••{ai.apiKey.slice(-4)}</code>
              <button className="ghost small" onClick={() => { setKeyDraft(''); setEditingKey(true); }}>Change</button>
            </div>
          ) : (
            <div className="keyrow">
              <input type="password" value={keyDraft} autoFocus={editingKey}
                placeholder={ai.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && keyDraft.trim()) saveKey(); }} />
              <button className="primary small" disabled={!keyDraft.trim()} onClick={saveKey}>Save</button>
              {configured && <button className="ghost small" onClick={() => setEditingKey(false)}>Cancel</button>}
            </div>
          )}
        </div>

        <label className="field">
          Base URL <span className="muted">(optional)</span>
          <input type="text" value={ai.baseUrl}
            placeholder={ai.provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'}
            onChange={(e) => setAi({ baseUrl: e.target.value.trim() })} />
        </label>
        <label className="field">
          Model <span className="muted">(optional)</span>
          <input type="text" value={ai.model}
            placeholder={DEFAULT_MODELS[ai.provider]}
            onChange={(e) => setAi({ model: e.target.value.trim() })} />
        </label>
        <p className="muted">
          Your key is stored only in this browser and sent only to the API host above.
          Custom base URLs must allow CORS from extensions.
        </p>
      </details>

      <details className="settings">
        <summary>💾 Data backup</summary>
        <div className="btn-row">
          <button className="ghost" onClick={exportData}>Export JSON</button>
          <label className="ghost file-btn">
            Import JSON<input type="file" accept=".json" hidden onChange={importData} />
          </label>
        </div>
      </details>
    </div>
  );
}
