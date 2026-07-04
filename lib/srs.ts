import type { Attempt, ReviewItem, SubmissionResult } from './types';

export const STAGE_DAYS = [3, 7, 14] as const;

export function classifyResult(statusMsg: string): SubmissionResult {
  if (statusMsg === 'Accepted') return 'AC';
  if (statusMsg === 'Wrong Answer') return 'WA';
  if (statusMsg === 'Time Limit Exceeded') return 'TLE';
  return 'OTHER';
}

export function shouldEnroll(attempts: Attempt[]): boolean {
  const fails = attempts.filter((a) => a.result === 'WA' || a.result === 'TLE').length;
  return fails >= 2;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(from: Date, days: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

type Meta = Pick<ReviewItem, 'slug' | 'title' | 'difficulty'>;

export function enroll(meta: Meta, now: Date): ReviewItem {
  return { ...meta, stage: 0, dueDate: addDays(now, STAGE_DAYS[0]), addedAt: isoDate(now) };
}

/** AC → advance one tier or graduate (returns null); fail → same tier, reschedule +3 days */
export function onReviewResult(item: ReviewItem, result: SubmissionResult, now: Date): ReviewItem | null {
  if (result === 'AC') {
    const nextStage = item.stage + 1;
    if (nextStage > 2) return null; // graduated
    return { ...item, stage: nextStage as 1 | 2, dueDate: addDays(now, STAGE_DAYS[nextStage]) };
  }
  return { ...item, dueDate: addDays(now, STAGE_DAYS[0]) };
}

export function isDue(item: ReviewItem, now: Date): boolean {
  return item.dueDate <= isoDate(now);
}
