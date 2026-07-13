import { expect, test } from 'vitest';
import { extractVqd, youtubeIdFromUrl, parseResults, parseHtmlResults, sortVideos, type VideoResult } from '../lib/videoSearch';

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

test('parseResults maps DDG fields including views and publishedAt', () => {
  const raw = [
    {
      content: 'https://www.youtube.com/watch?v=KLlXCFG5TnA',
      title: 'Two Sum explained',
      uploader: 'NeetCode',
      duration: '12:34',
      published: '2023-12-18T22:00:02.0000000',
      statistics: { viewCount: 63028 },
    },
    // missing optional fields -> defaults
    { content: 'https://youtu.be/dQw4w9WgXcQ', title: 'Bare' },
    // non-YouTube -> dropped
    { content: 'https://vimeo.com/12345', title: 'Nope' },
    // missing title -> dropped
    { content: 'https://www.youtube.com/watch?v=KLlXCFG5TnA' },
  ];
  expect(parseResults(raw)).toEqual([
    {
      videoId: 'KLlXCFG5TnA',
      title: 'Two Sum explained',
      channel: 'NeetCode',
      duration: '12:34',
      views: 63028,
      publishedAt: '2023-12-18T22:00:02.0000000',
    },
    { videoId: 'dQw4w9WgXcQ', title: 'Bare', channel: '', duration: '', views: 0, publishedAt: '' },
  ]);
});

test('parseHtmlResults extracts YouTube results from DuckDuckGo HTML fallback', () => {
  const html = `
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DKLlXCFG5TnA&amp;rut=abc">Two &amp; Sum <b>explained</b></a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fvimeo.com%2F123&amp;rut=def">Not YouTube</a>
  `;
  expect(parseHtmlResults(html)).toEqual([
    { videoId: 'KLlXCFG5TnA', title: 'Two & Sum explained', channel: '', duration: '', views: 0, publishedAt: '' },
  ]);
});

const mk = (videoId: string, views: number, publishedAt: string): VideoResult =>
  ({ videoId, title: videoId, channel: '', duration: '', views, publishedAt });

test('sortVideos: relevance keeps original order', () => {
  const list = [mk('a', 1, '2020-01-01'), mk('b', 9, '2024-01-01')];
  expect(sortVideos(list, 'relevance')).toEqual(list);
});

test('sortVideos: views sorts descending', () => {
  const list = [mk('a', 5, ''), mk('b', 100, ''), mk('c', 20, '')];
  expect(sortVideos(list, 'views').map((v) => v.videoId)).toEqual(['b', 'c', 'a']);
});

test('sortVideos: date sorts newest first, empty dates last', () => {
  const list = [mk('a', 0, '2020-06-10T05:57:05'), mk('b', 0, ''), mk('c', 0, '2026-06-14T03:06:17')];
  expect(sortVideos(list, 'date').map((v) => v.videoId)).toEqual(['c', 'a', 'b']);
});

test('sortVideos does not mutate its input', () => {
  const list = [mk('a', 1, '2020-01-01'), mk('b', 9, '2024-01-01')];
  const before = [...list];
  sortVideos(list, 'views');
  expect(list).toEqual(before);
});
