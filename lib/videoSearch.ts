// DuckDuckGo 视频搜索（非官方接口，无需 Key）：
// 1) 拉搜索页拿 vqd 令牌；2) 调 v.js 拿 JSON 结果。改版失效时由调用方回退到外链搜索。

export interface VideoResult {
  videoId: string;   // YouTube 11 位 id（仅保留可内嵌的 YouTube 结果）
  title: string;
  channel: string;
  duration: string;  // 如 "12:34"，可能为空串
}

export function extractVqd(html: string): string | null {
  const m = html.match(/vqd=["']?([\d-]+)/);
  return m ? m[1] : null;
}

export function youtubeIdFromUrl(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
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
  const results: VideoResult[] = [];
  for (const r of data?.results ?? []) {
    const videoId = typeof r?.content === 'string' ? youtubeIdFromUrl(r.content) : null;
    if (!videoId || typeof r?.title !== 'string') continue;
    results.push({
      videoId,
      title: r.title,
      channel: typeof r?.uploader === 'string' ? r.uploader : '',
      duration: typeof r?.duration === 'string' ? r.duration : '',
    });
  }
  return results;
}
