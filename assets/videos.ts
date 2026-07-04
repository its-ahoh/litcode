export interface VideoEntry {
  videoId: string; // YouTube 11 位 id
  title: string;
  channel: string;
}

export const videoMap: Record<string, VideoEntry[]> = {
  'two-sum': [
    { videoId: 'KLlXCFG5TnA', title: 'Two Sum - Leetcode 1 - HashMap - Python', channel: 'NeetCode' },
  ],
  'valid-parentheses': [
    { videoId: 'WTzjTskDFMg', title: 'Valid Parentheses - Stack - Leetcode 20 - Python', channel: 'NeetCode' },
  ],
  'best-time-to-buy-and-sell-stock': [
    { videoId: '1pkOgXD63yU', title: 'Sliding Window: Best Time to Buy and Sell Stock - Leetcode 121 - Python', channel: 'NeetCode' },
  ],
  'valid-anagram': [
    { videoId: '9UtInBqnCgA', title: 'Valid Anagram - Leetcode 242 - Python', channel: 'NeetCode' },
  ],
  'contains-duplicate': [
    { videoId: '3OamzN90kPg', title: 'Contains Duplicate - Leetcode 217 - Python', channel: 'NeetCode' },
  ],
};

export function searchUrl(frontendId: string, title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`leetcode ${frontendId} ${title}`)}`;
}
