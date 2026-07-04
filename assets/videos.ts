export interface VideoEntry {
  videoId: string; // YouTube 11-char id
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

function query(frontendId: string, title: string): string {
  return encodeURIComponent(`leetcode ${frontendId} ${title}`);
}

// YouTube sort codes (the `sp` param encodes a protobuf; these are the stable well-known values)
export type YouTubeSort = 'relevance' | 'date' | 'views' | 'rating';
const YT_SORT: Record<YouTubeSort, string> = {
  relevance: '',
  date: 'CAI%3D',   // upload date (latest)
  views: 'CAM%3D',  // view count (most viewed)
  rating: 'CAE%3D', // rating (most liked)
};

export function searchUrl(frontendId: string, title: string): string {
  return youtubeSearchUrl(frontendId, title);
}

export function youtubeSearchUrl(frontendId: string, title: string, sort: YouTubeSort = 'relevance'): string {
  const sp = YT_SORT[sort];
  return `https://www.youtube.com/results?search_query=${query(frontendId, title)}${sp ? `&sp=${sp}` : ''}`;
}

export function googleSearchUrl(frontendId: string, title: string): string {
  // tbm=vid: Google video search results
  return `https://www.google.com/search?tbm=vid&q=${query(frontendId, title)}`;
}

export function duckduckgoSearchUrl(frontendId: string, title: string): string {
  return `https://duckduckgo.com/?q=${query(frontendId, title)}&iar=videos&ia=videos`;
}
