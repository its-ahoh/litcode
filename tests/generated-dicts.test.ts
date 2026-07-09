import fs from 'node:fs';
import { expect, test } from 'vitest';
import { pythonGenerated } from '../lib/dicts/generated/python';
import { javascriptGenerated } from '../lib/dicts/generated/javascript';
import { javaGenerated } from '../lib/dicts/generated/java';
import { goGenerated } from '../lib/dicts/generated/go';

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

test('javascript generated dictionary covers canary symbols', () => {
  const l = labels(javascriptGenerated);
  const want = [
    // old hand-written coverage
    'push', 'splice', 'reduce', 'flatMap', 'padStart', 'fromCharCode',
    'includes', 'has', 'set', 'get', 'max', 'floor', 'Infinity', 'parseInt',
    // new coverage the old dict lacked
    'findLast', 'findLastIndex', 'padEnd', 'at', 'toSorted', 'toReversed',
    'trunc', 'cbrt', 'hypot', 'codePointAt', 'localeCompare',
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('javascript generated entries are well-formed', () => {
  for (const e of javascriptGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});

test('java generated dictionary covers canary symbols including Deque', () => {
  const l = labels(javaGenerated);
  const want = [
    // the Deque gap that motivated this work
    'Deque', 'pollFirst', 'pollLast', 'peekFirst', 'peekLast', 'offerFirst',
    'offerLast', 'getFirst', 'getLast', 'pop', 'push', 'addFirst', 'addLast',
    // old hand-written coverage
    'charAt', 'substring', 'toCharArray', 'parseInt', 'getOrDefault',
    'containsKey', 'binarySearch', 'ArrayDeque', 'PriorityQueue', 'TreeMap',
    // new coverage the old dict lacked
    'computeIfAbsent', 'floorKey', 'ceilingKey', 'descendingIterator',
    'lastIndexOf', 'repeat', 'chars', 'Stack', 'List', 'Map',
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('java generated entries are well-formed', () => {
  for (const e of javaGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});

test('go generated dictionary covers canary symbols', () => {
  const l = labels(goGenerated);
  const want = [
    'Ints', 'Slice', 'SliceStable', 'SearchInts',       // sort
    'Itoa', 'Atoi',                                     // strconv
    'Join', 'Split', 'Contains', 'Repeat', 'TrimSpace', // strings
    'Init', 'Push', 'Pop', 'Fix',                       // container/heap
    'PushBack', 'PushFront',                            // container/list
    'Abs', 'Sqrt', 'Floor', 'Ceil', 'Max',              // math
    'Println', 'Printf', 'Sprintf',                     // fmt
    'append', 'len', 'make', 'copy', 'cap',             // builtins
    'sort', 'strings', 'strconv', 'heap', 'list', 'fmt', 'slices', 'maps',
    'func', 'range', 'defer', 'chan', 'select', 'go',   // keywords
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('go generated entries are well-formed', () => {
  for (const e of goGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});

test('generated dictionaries stay within the size budget', () => {
  for (const lang of ['java', 'python', 'javascript', 'go']) {
    const size = fs.statSync(`lib/dicts/generated/${lang}.ts`).size;
    expect(size, `${lang}.ts is ${size} bytes`).toBeLessThan(250_000);
  }
});
