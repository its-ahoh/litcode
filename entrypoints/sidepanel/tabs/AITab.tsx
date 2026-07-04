import { useState } from 'react';
import { getStore, patchStore, updateStore } from '@/lib/storage';
import { explainCode, DEFAULT_MODELS } from '@/lib/ai';
import type { AiSettings, ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';
import { activeLeetCodeTabId } from '../useProblem';
import Markdown from '../Markdown';

export default function AITab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  if (!store) return null;
  const ai = store.settings.ai;
  const configured = ai.apiKey.length > 0;

  async function setAi(patch: Partial<AiSettings>) {
    await updateStore((s) => ({ settings: { ...s.settings, ai: { ...s.settings.ai, ...patch } } }));
  }

  async function grab() {
    const tabId = await activeLeetCodeTabId();
    if (!tabId) return null;
    return (await chrome.tabs.sendMessage(tabId, { type: 'GET_EDITOR_CODE' })) as
      | { code: string; language: string; selection: string } | null;
  }

  async function explain(selectionOnly: boolean) {
    setError('');
    setAnswer('');
    const grabbed = await grab();
    if (!grabbed) { setError('Failed to read the editor — make sure the problem page is loaded.'); return; }
    const selection = selectionOnly ? grabbed.selection : '';
    if (selectionOnly && !selection.trim()) {
      setError('Nothing selected — select some code in the editor first, then click again.');
      return;
    }
    setBusy(true);
    try {
      const text = await explainCode(ai, { problem, language: grabbed.language, code: grabbed.code, selection });
      setAnswer(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveKey() {
    await setAi({ apiKey: keyDraft.trim() });
    setKeyDraft('');
    setEditingKey(false);
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

  return (
    <div>
      <div className="btn-row">
        <button className="primary" disabled={busy || !configured} onClick={() => explain(true)}>
          ✨ Explain selection
        </button>
        <button className="ghost" disabled={busy || !configured} onClick={() => explain(false)}>
          Explain whole code
        </button>
      </div>
      <p className="muted">
        {configured
          ? 'Select code in the LeetCode editor, then click "Explain selection".'
          : 'Add an API key below to enable AI explanations.'}
      </p>

      {busy && (
        <div className="card thinking">
          <span className="spinner" /> Thinking…
        </div>
      )}
      {error && <div className="card error-card">{error}</div>}
      {answer && !busy && (
        <div className="card answer-card">
          <div className="answer-head">
            <span className="muted">{ai.model.trim() || DEFAULT_MODELS[ai.provider]}</span>
            <button className="ghost small" onClick={() => navigator.clipboard.writeText(answer)}>Copy</button>
          </div>
          <Markdown text={answer} />
        </div>
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
