import { updateStore } from '@/lib/storage';
import { enroll, isDue, STAGE_DAYS } from '@/lib/srs';
import type { ProblemMeta } from '@/lib/types';
import { useStore } from '../useStore';

export default function ReviewTab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  if (!store) return null;
  const items = Object.values(store.reviewQueue);
  const now = new Date();
  const due = items.filter((i) => isDue(i, now));
  const upcoming = items.filter((i) => !isDue(i, now)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  async function markForReview() {
    if (!problem) return;
    await updateStore((s) => {
      if (s.reviewQueue[problem.slug]) return {};
      return { reviewQueue: { ...s.reviewQueue, [problem.slug]: enroll(problem, new Date()) } };
    });
  }

  async function remove(slug: string) {
    await updateStore((s) => {
      const q = { ...s.reviewQueue };
      delete q[slug];
      return { reviewQueue: q };
    });
  }

  const row = (i: (typeof items)[number], dueNow: boolean) => (
    <div className="card" key={i.slug}>
      <a href={`https://leetcode.com/problems/${i.slug}/`} target="_blank" rel="noreferrer">{i.title}</a>
      <div className="muted">
        {dueNow ? '今日到期' : `${i.dueDate} 到期`} · 第 {i.stage + 1}/3 轮（{STAGE_DAYS[i.stage]} 天档）
        <button className="ghost" style={{ float: 'right' }} onClick={() => remove(i.slug)}>移除</button>
      </div>
    </div>
  );

  return (
    <div>
      {problem && !store.reviewQueue[problem.slug] && (
        <button className="primary" onClick={markForReview}>➕ 把当前题目标记重做</button>
      )}
      <h3>今日到期（{due.length}）</h3>
      {due.length === 0 ? <p className="muted">没有到期题目 🎉</p> : due.map((i) => row(i, true))}
      <h3>待复习（{upcoming.length}）</h3>
      {upcoming.map((i) => row(i, false))}
    </div>
  );
}
