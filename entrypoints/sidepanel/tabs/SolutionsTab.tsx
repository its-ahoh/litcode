import { useState } from 'react';
import { updateStore } from '@/lib/storage';
import { MAX_SLOTS, canSaveWithoutOverwrite, saveVersion } from '@/lib/solutions';
import type { ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';
import { activeLeetCodeTabId } from '../useProblem';
import CodePreview from '../CodePreview';

export default function SolutionsTab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  if (!store) return null;
  if (!problem) return <p className="muted">Open a problem to save code versions for it (up to {MAX_SLOTS}).</p>;
  const versions = store.solutions[problem.slug] ?? [];

  async function grabCode() {
    const tabId = await activeLeetCodeTabId();
    if (!tabId) return null;
    try {
      return (await chrome.tabs.sendMessage(tabId, { type: 'GET_EDITOR_CODE' })) as
        | { code: string; language: string } | null;
    } catch {
      return null; // content script not ready / not a problem page
    }
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
    else setPendingOverwrite(true); // enter "click a card to overwrite" state
  }

  async function restore(code: string) {
    if (!confirm('Restoring will overwrite the current code in the editor. Continue?')) return;
    const tabId = await activeLeetCodeTabId();
    if (!tabId) { alert('Open the problem page first, then restore.'); return; }
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'RESTORE_CODE', code });
    } catch {
      alert('Could not reach the editor — reload the problem page and try again.');
    }
  }

  async function remove(index: number) {
    await updateStore((s) => {
      const next = (s.solutions[problem!.slug] ?? []).filter((_, i) => i !== index);
      return { solutions: { ...s.solutions, [problem!.slug]: next } };
    });
  }

  return (
    <div>
      <button className="primary save-code" onClick={onSaveClick}>
        Save current code ({versions.length}/{MAX_SLOTS})
      </button>
      {pendingOverwrite && <p className="muted">All slots full: click "Overwrite" on a version below, or <button className="ghost" onClick={() => setPendingOverwrite(false)}>Cancel</button></p>}
      {versions.length === 0 && (
        <p className="muted">
          Write code on the problem page, then click "Save current code" to snapshot it here.
          You can restore any saved version back into the LeetCode editor at any time.
        </p>
      )}
      {versions.map((v, i) => (
        <div className="card sol-card" key={i}>
          <div className="sol-head">
            <strong>{v.label}</strong>
            <span className="muted">{v.language} · {new Date(v.savedAt).toLocaleString()}</span>
          </div>
          <CodePreview code={v.code} />
          <div className="sol-actions">
            <button className="ghost small" onClick={() => restore(v.code)}>Restore to editor</button>
            <button className="ghost small" onClick={() => navigator.clipboard.writeText(v.code)}>Copy</button>
            <button className="ghost small danger" onClick={() => remove(i)}>Delete</button>
            {pendingOverwrite && <button className="primary small" onClick={() => persist(i)}>Overwrite this slot</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
