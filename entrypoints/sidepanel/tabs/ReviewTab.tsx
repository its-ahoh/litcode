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
    <div className={dueNow ? 'card review-card due' : 'card review-card'} key={i.slug}>
      <div className="review-main">
        <a className="review-title" href={`https://leetcode.com/problems/${i.slug}/`} target="_blank" rel="noreferrer">
          {i.title}
        </a>
        <div className="review-meta">
          {i.difficulty && (
            <span className={`diff-badge diff-${i.difficulty.toLowerCase()}`}>{i.difficulty}</span>
          )}
          <span className={dueNow ? 'due-tag' : 'muted'}>{dueNow ? 'Due today' : `Due ${i.dueDate}`}</span>
          <span className="muted">· Round {i.stage + 1}/3 · {STAGE_DAYS[i.stage]}-day</span>
        </div>
      </div>
      <button className="ghost small" onClick={() => remove(i.slug)}>Remove</button>
    </div>
  );

  return (
    <div>
      {problem && !store.reviewQueue[problem.slug] && (
        <button className="primary" onClick={markForReview}>➕ Mark current problem for review</button>
      )}
      <h3>Due today ({due.length})</h3>
      {due.length === 0 ? <p className="muted">Nothing due today 🎉</p> : due.map((i) => row(i, true))}
      <h3>Upcoming ({upcoming.length})</h3>
      {upcoming.length === 0 ? <p className="muted">No upcoming reviews.</p> : upcoming.map((i) => row(i, false))}
    </div>
  );
}
