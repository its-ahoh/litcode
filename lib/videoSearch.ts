// DuckDuckGo video search (unofficial API, no key needed):
// 1) fetch the search page to get the vqd token; 2) call v.js for JSON results. If DDG changes their
// markup and this breaks, the caller falls back to an external link search.

export interface VideoResult {
  videoId: string;   // YouTube 11-char id (only embeddable YouTube results are kept)
  title: string;
  channel: string;
  duration: string;  // e.g. "12:34", may be an empty string
  views: number;     // DDG statistics.viewCount, 0 when absent
  publishedAt: string; // ISO timestamp from DDG `published`, '' when absent
}

export function extractVqd(html: string): string | null {
  const m = html.match(/vqd=["']?([\d-]+)/);
  return m ? m[1] : null;
}

export function youtubeIdFromUrl(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function parseResults(results: any[]): VideoResult[] {
  const out: VideoResult[] = [];
  for (const r of results) {
    const videoId = typeof r?.content === 'string' ? youtubeIdFromUrl(r.content) : null;
    if (!videoId || typeof r?.title !== 'string') continue;
    out.push({
      videoId,
      title: r.title,
      channel: typeof r?.uploader === 'string' ? r.uploader : '',
      duration: typeof r?.duration === 'string' ? r.duration : '',
      views: Number(r?.statistics?.viewCount) || 0,
      publishedAt: typeof r?.published === 'string' ? r.published : '',
    });
  }
  return out;
}

export type VideoSort = 'relevance' | 'views' | 'date';

// Pure client-side sort; 'relevance' is DDG's original ranking. Never mutates the input.
export function sortVideos(results: VideoResult[], sort: VideoSort): VideoResult[] {
  if (sort === 'relevance') return results;
  const copy = [...results];
  if (sort === 'views') copy.sort((a, b) => b.views - a.views);
  else copy.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)); // ISO strings; '' sorts last
  return copy;
}

export async function searchVideos(query: string): Promise<VideoResult[]> {
  const q = encodeURIComponent(query);
  const pageRes = await fetch(`https://duckduckgo.com/?q=${q}&iax=videos&ia=videos`);
  if (!pageRes.ok) throw new Error(`DDG page ${pageRes.status}`);
  const vqd = extractVqd(await pageRes.text());
  if (!vqd) throw new Error('DDG vqd token not found');

  const apiRes = await fetch(`https://duckduckgo.com/v.js?l=us-en&o=json&q=${q}&vqd=${vqd}&f=,,,&p=1`);
  if (!apiRes.ok) throw new Error(`DDG v.js ${apiRes.status}`);
  const data = await apiRes.json();
  return parseResults(data?.results ?? []);
}
