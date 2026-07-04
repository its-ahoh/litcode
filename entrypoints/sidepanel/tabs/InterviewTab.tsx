import { useEffect, useState } from 'react';
import { updateStore } from '@/lib/storage';
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
        面试模式（隐藏难度/通过率/讨论区，进入题目自动计时）
      </label>

      {timing && (
        <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: over ? '#d33' : '#0a7' }}>
            {Math.floor(elapsedMin)}:{String(Math.floor((elapsedMin % 1) * 60)).padStart(2, '0')}
          </div>
          <div className="muted">目标 {targetMin} 分钟{over && ' · 已超时！'}</div>
          <button className="ghost" onClick={restartTimer}>重新计时</button>
        </div>
      )}

      <h3>目标时间（分钟）</h3>
      {(['easy', 'medium', 'hard'] as const).map((k) => (
        <label key={k} style={{ display: 'block', marginBottom: 6 }}>
          {k}: <input type="number" min={1} value={settings.targetMinutes[k]}
            onChange={(e) => setTarget(k, Number(e.target.value) || 1)} style={{ width: 60 }} />
        </label>
      ))}
    </div>
  );
}
