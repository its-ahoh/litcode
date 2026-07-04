import { expect, test } from 'vitest';
import { extractVqd, youtubeIdFromUrl } from '../lib/videoSearch';

test('extractVqd finds token in page html', () => {
  expect(extractVqd(`x;vqd="4-123456789012345";y`)).toBe('4-123456789012345');
  expect(extractVqd(`vqd=4-987654321`)).toBe('4-987654321');
  expect(extractVqd('no token here')).toBeNull();
});

test('youtubeIdFromUrl extracts 11-char ids', () => {
  expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=KLlXCFG5TnA')).toBe('KLlXCFG5TnA');
  expect(youtubeIdFromUrl('https://www.youtube.com/watch?app=desktop&v=KLlXCFG5TnA&t=1s')).toBe('KLlXCFG5TnA');
  expect(youtubeIdFromUrl('https://youtu.be/KLlXCFG5TnA')).toBe('KLlXCFG5TnA');
  expect(youtubeIdFromUrl('https://vimeo.com/12345')).toBeNull();
});
