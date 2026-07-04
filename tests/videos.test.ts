import { expect, test } from 'vitest';
import { videoMap, searchUrl } from '../assets/videos';

test('video entries are well-formed', () => {
  for (const [slug, vids] of Object.entries(videoMap)) {
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(vids.length).toBeGreaterThan(0);
    for (const v of vids) {
      expect(v.videoId).toMatch(/^[\w-]{11}$/);
      expect(v.title.length).toBeGreaterThan(0);
      expect(v.channel.length).toBeGreaterThan(0);
    }
  }
});

test('starter slugs are present', () => {
  for (const slug of ['two-sum', 'valid-parentheses', 'best-time-to-buy-and-sell-stock', 'valid-anagram', 'contains-duplicate']) {
    expect(videoMap[slug]).toBeDefined();
  }
});

test('searchUrl builds a YouTube query', () => {
  expect(searchUrl('1', 'Two Sum')).toBe(
    'https://www.youtube.com/results?search_query=leetcode%201%20Two%20Sum',
  );
});
