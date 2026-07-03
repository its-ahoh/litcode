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
