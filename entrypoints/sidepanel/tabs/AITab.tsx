import { useState } from 'react';
import { getStore, patchStore, updateStore } from '@/lib/storage';
import { explainCode, DEFAULT_MODELS } from '@/lib/ai';
import type { AiSettings, ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';
import { activeLeetCodeTabId } from '../useProblem';

export default function AITab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [explained, setExplained] = useState<'selection' | 'code' | null>(null);
  if (!store) return null;
  const ai = store.settings.ai;

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
    setExplained(selectionOnly ? 'selection' : 'code');
    try {
      const text = await explainCode(ai, {
        problem,
        language: grabbed.language,
        code: grabbed.code,
        selection,
      });
      setAnswer(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // ---- 数据导出/导入（自面试模式页迁移而来）----
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
      <button className="primary" disabled={busy} onClick={() => explain(true)}>
        ✨ Explain selection
      </button>{' '}
      <button className="ghost" disabled={busy} onClick={() => explain(false)}>
        Explain whole code
      </button>
      <p className="muted">
        Select code in the LeetCode editor, then click "Explain selection" for a focused explanation.
      </p>

      {busy && <p className="muted">Thinking… (explaining {explained})</p>}
      {error && <p style={{ color: '#d33' }}>{error}</p>}
      {answer && (
        <div className="card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{answer}</div>
      )}

      <h3>AI settings</h3>
      <label style={{ display: 'block', marginBottom: 6 }}>
        Provider:{' '}
        <select value={ai.provider} onChange={(e) => setAi({ provider: e.target.value as AiSettings['provider'] })}>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI / compatible</option>
        </select>
      </label>
      <label style={{ display: 'block', marginBottom: 6 }}>
        API key:{' '}
        <input type="password" value={ai.apiKey} style={{ width: '100%' }}
          placeholder={ai.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          onChange={(e) => setAi({ apiKey: e.target.value.trim() })} />
      </label>
      <label style={{ display: 'block', marginBottom: 6 }}>
        Base URL:{' '}
        <input type="text" value={ai.baseUrl} style={{ width: '100%' }}
          placeholder={ai.provider === 'anthropic' ? 'default: https://api.anthropic.com' : 'default: https://api.openai.com/v1'}
          onChange={(e) => setAi({ baseUrl: e.target.value.trim() })} />
      </label>
      <label style={{ display: 'block', marginBottom: 6 }}>
        Model:{' '}
        <input type="text" value={ai.model} style={{ width: '100%' }}
          placeholder={`default: ${DEFAULT_MODELS[ai.provider]}`}
          onChange={(e) => setAi({ model: e.target.value.trim() })} />
      </label>
      <p className="muted">
        Your key is stored only in this browser (chrome.storage.local) and sent only to the API host above.
        Custom base URLs must allow CORS from extensions.
      </p>

      <h3>Data</h3>
      <button className="ghost" onClick={exportData}>Export JSON</button>{' '}
      <label className="ghost" style={{ display: 'inline-block' }}>
        Import JSON<input type="file" accept=".json" hidden onChange={importData} />
      </label>
    </div>
  );
}
