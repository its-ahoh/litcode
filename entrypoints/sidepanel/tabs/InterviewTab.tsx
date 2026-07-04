import { useEffect, useState } from 'react';
import { getStore, patchStore, updateStore } from '@/lib/storage';
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
    await updateStore((s) => ({ settings: { ...s.settings, interviewMode: !s.settings.interviewMode } }));
  }

  async function setTarget(key: 'easy' | 'medium' | 'hard', minutes: number) {
    await updateStore((s) => ({
      settings: { ...s.settings, targetMinutes: { ...s.settings.targetMinutes, [key]: minutes } },
    }));
  }

  async function restartTimer() {
    if (!problem) return;
    await updateStore(() => ({ session: { slug: problem.slug, enteredAt: Date.now() } }));
  }

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
        Interview mode (hides difficulty/acceptance/discussion; auto-timer per problem)
      </label>

      {timing && (
        <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: over ? '#d33' : '#0a7' }}>
            {Math.floor(elapsedMin)}:{String(Math.floor((elapsedMin % 1) * 60)).padStart(2, '0')}
          </div>
          <div className="muted">Target {targetMin} min{over && ' · Overtime!'}</div>
          <button className="ghost" onClick={restartTimer}>Restart timer</button>
        </div>
      )}

      <h3>Target time (minutes)</h3>
      {(['easy', 'medium', 'hard'] as const).map((k) => (
        <label key={k} style={{ display: 'block', marginBottom: 6 }}>
          {k}: <input type="number" min={1} value={settings.targetMinutes[k]}
            onChange={(e) => setTarget(k, Number(e.target.value) || 1)} style={{ width: 60 }} />
        </label>
      ))}

      <h3>Data</h3>
      <button className="ghost" onClick={exportData}>Export JSON</button>{' '}
      <label className="ghost" style={{ display: 'inline-block' }}>
        Import JSON<input type="file" accept=".json" hidden onChange={importData} />
      </label>
    </div>
  );
}
