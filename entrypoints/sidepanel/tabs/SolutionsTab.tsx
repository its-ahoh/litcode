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
    try {
      await updateStore((s) => {
        const cur = s.solutions[problem!.slug] ?? [];
        const next = saveVersion(cur, { label, language: grabbed.language, code: grabbed.code, savedAt: Date.now() }, overwriteIndex);
        return { solutions: { ...s.solutions, [problem!.slug]: next } };
      });
    } catch {
      alert('槽位状态已变化，请重试');
      return;
    }
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
    await updateStore((s) => {
      const next = (s.solutions[problem!.slug] ?? []).filter((_, i) => i !== index);
      return { solutions: { ...s.solutions, [problem!.slug]: next } };
    });
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
