import { expect, test } from 'vitest';
import { tokenizeCodeLine } from '../entrypoints/sidepanel/CodePreview';

test('tokenizeCodeLine identifies common syntax tokens without changing source text', () => {
  const tokens = tokenizeCodeLine('const total = sum(nums); // done');
  expect(tokens.map((token) => token.text).join('')).toBe('const total = sum(nums); // done');
  expect(tokens.find((token) => token.text === 'const')?.kind).toBe('keyword');
  expect(tokens.find((token) => token.text === 'sum')?.kind).toBe('function');
  expect(tokens.find((token) => token.text === '// done')?.kind).toBe('comment');
});
