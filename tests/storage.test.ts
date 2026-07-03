import { beforeEach, expect, test } from 'vitest';
import { installFakeChrome } from './fake-chrome';

beforeEach(() => installFakeChrome());

test('getStore returns defaults for empty storage', async () => {
  const { getStore } = await import('../lib/storage');
  const store = await getStore();
  expect(store.settings.targetMinutes.medium).toBe(25);
  expect(store.attempts).toEqual({});
  expect(store.reviewQueue).toEqual({});
  expect(store.solutions).toEqual({});
});

test('patchStore persists partial updates', async () => {
  const { getStore, patchStore } = await import('../lib/storage');
  await patchStore({ settings: { interviewMode: true, targetMinutes: { easy: 10, medium: 20, hard: 30 } } });
  const store = await getStore();
  expect(store.settings.interviewMode).toBe(true);
  expect(store.attempts).toEqual({});
});

test('concurrent updateStore calls do not lose updates', async () => {
  const { getStore, updateStore } = await import('../lib/storage');
  const attempt = (slug: string) => ({
    slug,
    title: slug,
    difficulty: null,
    result: 'AC' as const,
    timestamp: 0,
    durationMs: null,
  });
  // Fire both without awaiting the first: with unserialized read-merge-write
  // both read the same stale snapshot and the second write clobbers the first.
  await Promise.all([
    updateStore((s) => ({ attempts: { ...s.attempts, a: [attempt('a')] } })),
    updateStore((s) => ({ attempts: { ...s.attempts, b: [attempt('b')] } })),
  ]);
  const store = await getStore();
  expect(Object.keys(store.attempts).sort()).toEqual(['a', 'b']);
});

test('a rejected updateStore does not break subsequent writes', async () => {
  const { getStore, updateStore, patchStore } = await import('../lib/storage');
  await expect(
    updateStore(() => {
      throw new Error('boom');
    }),
  ).rejects.toThrow('boom');
  await patchStore({ settings: { interviewMode: true, targetMinutes: { easy: 1, medium: 2, hard: 3 } } });
  const store = await getStore();
  expect(store.settings.interviewMode).toBe(true);
});
