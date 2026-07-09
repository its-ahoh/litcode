import { expect, test } from 'vitest';
import { videoMap } from '../assets/videos';

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
