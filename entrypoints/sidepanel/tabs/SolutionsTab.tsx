import { useState } from 'react';
import { updateStore } from '@/lib/storage';
import { MAX_SLOTS, canSaveWithoutOverwrite, saveVersion } from '@/lib/solutions';
import type { ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';
import { activeLeetCodeTabId } from '../useProblem';

export default function SolutionsTab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  if (!store) return null;
  if (!problem) return <p className="muted">Open a problem to save code versions for it (up to {MAX_SLOTS}).</p>;
  const versions = store.solutions[problem.slug] ?? [];

  async function grabCode() {
    const tabId = await activeLeetCodeTabId();
    if (!tabId) return null;
    return (await chrome.tabs.sendMessage(tabId, { type: 'GET_EDITOR_CODE' })) as
      | { code: string; language: string } | null;
  }

  async function persist(overwriteIndex: number | null) {
    const grabbed = await grabCode();
    if (!grabbed) { alert('Failed to read the editor — make sure the problem page is loaded.'); return; }
    const label = prompt('Name this version (e.g. brute force / optimal O(n))', `Version ${versions.length + 1}`);
    if (label === null) return;
    try {
      await updateStore((s) => {
        const cur = s.solutions[problem!.slug] ?? [];
        const next = saveVersion(cur, { label, language: grabbed.language, code: grabbed.code, savedAt: Date.now() }, overwriteIndex);
        return { solutions: { ...s.solutions, [problem!.slug]: next } };
      });
    } catch {
      alert('Slots changed in the meantime — please retry.');
      return;
    }
    setPendingOverwrite(false);
  }

  async function onSaveClick() {
    if (canSaveWithoutOverwrite(versions)) await persist(null);
    else setPendingOverwrite(true); // 进入"点击某个卡片以覆盖"状态
  }

  async function restore(code: string) {
    if (!confirm('Restoring will overwrite the current code in the editor. Continue?')) return;
    const tabId = await activeLeetCodeTabId();
    if (tabId) await chrome.tabs.sendMessage(tabId, { type: 'RESTORE_CODE', code });
  }

  async function remove(index: number) {
    await updateStore((s) => {
      const next = (s.solutions[problem!.slug] ?? []).filter((_, i) => i !== index);
      return { solutions: { ...s.solutions, [problem!.slug]: next } };
    });
  }

  return (
    <div>
      <button className="primary" onClick={onSaveClick}>
        💾 Save current code ({versions.length}/{MAX_SLOTS})
      </button>
      {pendingOverwrite && <p className="muted">All slots full: click "Overwrite" on a version below, or <button className="ghost" onClick={() => setPendingOverwrite(false)}>Cancel</button></p>}
      {versions.length === 0 && (
        <p className="muted">
          Write code on the problem page, then click "Save current code" to snapshot it here.
          You can restore any saved version back into the LeetCode editor at any time.
        </p>
      )}
      {versions.map((v, i) => (
        <div className="card" key={i}>
          <strong>{v.label}</strong>
          <span className="muted"> · {v.language} · {new Date(v.savedAt).toLocaleString()}</span>
          <pre style={{ maxHeight: 120, overflow: 'auto', background: '#f7f7f7', padding: 8, borderRadius: 6 }}>{v.code}</pre>
          <button className="ghost" onClick={() => restore(v.code)}>Restore to editor</button>{' '}
          <button className="ghost" onClick={() => navigator.clipboard.writeText(v.code)}>Copy</button>{' '}
          <button className="ghost" onClick={() => remove(i)}>Delete</button>{' '}
          {pendingOverwrite && <button className="primary" onClick={() => persist(i)}>Overwrite this slot</button>}
        </div>
      ))}
    </div>
  );
}
