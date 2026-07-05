import { beforeEach, expect, test, vi } from 'vitest';
import { installFakeChrome } from './fake-chrome';

beforeEach(() => {
  vi.resetModules();
  installFakeChrome();
});

test('caches and reads back a solution', async () => {
  const m = await import('../lib/solutionCache');
  await m.setCachedSolution('slug|python|code', 'answer one');
  await m.hydrateSolutionCache();
  expect(m.getCachedSolution('slug|python|code')).toBe('answer one');
});

test('persists across a module reload (simulated panel refresh)', async () => {
  const m1 = await import('../lib/solutionCache');
  await m1.setCachedSolution('k1', 'persisted');
  // Simulate a reload: fresh module instance reading the same chrome.storage
  vi.resetModules();
  const m2 = await import('../lib/solutionCache');
  await m2.hydrateSolutionCache();
  expect(m2.getCachedSolution('k1')).toBe('persisted');
});

test('bounds the cache to 50 entries, dropping the oldest', async () => {
  const m = await import('../lib/solutionCache');
  for (let i = 0; i < 51; i++) await m.setCachedSolution(`k${i}`, `v${i}`);
  await m.hydrateSolutionCache();
  expect(m.getCachedSolution('k0')).toBeUndefined(); // oldest evicted
  expect(m.getCachedSolution('k50')).toBe('v50');     // newest kept
});
