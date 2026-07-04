import { expect, test } from 'vitest';
import { classifyResult, shouldEnroll, enroll, onReviewResult, isDue, STAGE_DAYS } from '../lib/srs';
import type { Attempt, ReviewItem } from '../lib/types';

const meta = { slug: 'two-sum', title: 'Two Sum', difficulty: 'Easy' as const };
const attempt = (result: Attempt['result']): Attempt =>
  ({ ...meta, result, timestamp: 0, durationMs: null });

test('classifyResult maps LeetCode status_msg', () => {
  expect(classifyResult('Accepted')).toBe('AC');
  expect(classifyResult('Wrong Answer')).toBe('WA');
  expect(classifyResult('Time Limit Exceeded')).toBe('TLE');
  expect(classifyResult('Runtime Error')).toBe('OTHER');
});

test('shouldEnroll requires >= 2 failures', () => {
  expect(shouldEnroll([attempt('WA')])).toBe(false);
  expect(shouldEnroll([attempt('WA'), attempt('TLE')])).toBe(true);
  expect(shouldEnroll([attempt('WA'), attempt('AC')])).toBe(false);
});

test('enroll starts at stage 0, due in 3 days', () => {
  const item = enroll(meta, new Date('2026-07-03'));
  expect(item.stage).toBe(0);
  expect(item.dueDate).toBe('2026-07-06');
});

test('AC advances stage; final AC graduates (null)', () => {
  const s0 = enroll(meta, new Date('2026-07-03'));
  const s1 = onReviewResult(s0, 'AC', new Date('2026-07-06'))!;
  expect(s1.stage).toBe(1);
  expect(s1.dueDate).toBe('2026-07-13'); // +7
  const s2 = onReviewResult(s1, 'AC', new Date('2026-07-13'))!;
  expect(s2.stage).toBe(2);
  expect(s2.dueDate).toBe('2026-07-27'); // +14
  expect(onReviewResult(s2, 'AC', new Date('2026-07-27'))).toBeNull();
});

test('failure keeps stage and reschedules +3 days', () => {
  const s0 = enroll(meta, new Date('2026-07-03'));
  const s1 = onReviewResult(s0, 'WA', new Date('2026-07-06'))!;
  expect(s1.stage).toBe(0);
  expect(s1.dueDate).toBe('2026-07-09');
});

test('isDue compares by calendar date', () => {
  const item: ReviewItem = { ...meta, stage: 0, dueDate: '2026-07-06', addedAt: '2026-07-03' };
  expect(isDue(item, new Date('2026-07-05'))).toBe(false);
  expect(isDue(item, new Date('2026-07-06'))).toBe(true);
  expect(isDue(item, new Date('2026-07-08'))).toBe(true);
});

test('STAGE_DAYS is 3/7/14', () => {
  expect(STAGE_DAYS).toEqual([3, 7, 14]);
});
