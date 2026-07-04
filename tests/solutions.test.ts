import { expect, test } from 'vitest';
import { MAX_SLOTS, saveVersion, canSaveWithoutOverwrite } from '../lib/solutions';
import type { SolutionVersion } from '../lib/types';

const v = (label: string): SolutionVersion =>
  ({ label, language: 'python3', code: 'pass', savedAt: 0 });

test('MAX_SLOTS is 3', () => {
  expect(MAX_SLOTS).toBe(3);
});

test('saveVersion appends when slots available', () => {
  const next = saveVersion([v('a')], v('b'), null);
  expect(next.map((x) => x.label)).toEqual(['a', 'b']);
});

test('saveVersion overwrites given slot index when full', () => {
  const full = [v('a'), v('b'), v('c')];
  const next = saveVersion(full, v('d'), 1);
  expect(next.map((x) => x.label)).toEqual(['a', 'd', 'c']);
});

test('saveVersion throws when full and no slot chosen', () => {
  const full = [v('a'), v('b'), v('c')];
  expect(() => saveVersion(full, v('d'), null)).toThrow();
});

test('canSaveWithoutOverwrite', () => {
  expect(canSaveWithoutOverwrite([v('a'), v('b')])).toBe(true);
  expect(canSaveWithoutOverwrite([v('a'), v('b'), v('c')])).toBe(false);
});
