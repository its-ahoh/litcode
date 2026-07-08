import { expect, test } from 'vitest';
import { pythonGenerated } from '../lib/dicts/generated/python';

function labels(entries: { label: string }[]) {
  return new Set(entries.map((e) => e.label));
}

test('python generated dictionary covers canary symbols', () => {
  const l = labels(pythonGenerated);
  const want = [
    // the ones the old hand-written dict had
    'append', 'popleft', 'appendleft', 'heappush', 'heappop', 'heapify',
    'Counter', 'defaultdict', 'deque', 'bisect_left', 'insort', 'lru_cache',
    'cache', 'inf', 'gcd', 'sorted', 'len', 'enumerate',
    // ones it did NOT have — the point of generating
    'rotate', 'extendleft', 'most_common', 'heappushpop', 'nlargest',
    'nsmallest', 'product', 'groupby', 'comb', 'isqrt',
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('python generated entries are well-formed', () => {
  for (const e of pythonGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});
