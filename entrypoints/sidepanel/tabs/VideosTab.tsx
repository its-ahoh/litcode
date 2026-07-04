import { useEffect, useState } from 'react';
import type { ProblemMeta } from '@/lib/types';
import { videoMap, youtubeSearchUrl, googleSearchUrl } from '@/assets/videos';
import { searchVideos, type VideoResult } from '@/lib/videoSearch';

// Session-level cache: switching back to the same problem doesn't repeat the search
const searchCache = new Map<string, VideoResult[]>();

export default function VideosTab({ problem }: { problem: ProblemMeta | null }) {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState<string | null>(null);

  const slug = problem?.slug ?? null;

  function runSearch(force = false) {
    if (!problem || !slug) return () => {};
    setPlaying(null);
    const curated = videoMap[slug];
    if (curated) {
      setVideos(curated.map((v) => ({ ...v, duration: '' })));
      setState('ready');
      return () => {};
    }
    if (!force) {
      const cached = searchCache.get(slug);
      if (cached) {
        setVideos(cached);
        setState('ready');
        return () => {};
      }
    }
    let alive = true;
    setVideos([]);
    setState('loading');
    searchVideos(`leetcode ${problem.frontendId} ${problem.title}`)
      .then((results) => {
        const top = results.slice(0, 8);
        searchCache.set(slug, top);
        if (alive) { setVideos(top); setState('ready'); }
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }

  useEffect(() => runSearch(), [slug]);

  if (!problem) return <p className="muted">Open a LeetCode problem to see solution videos here.</p>;

  function openExternal(e: React.ChangeEvent<HTMLSelectElement>) {
    const where = e.target.value;
    if (!where || !problem) return;
    const url = where === 'google'
      ? googleSearchUrl(problem.frontendId, problem.title)
      : youtubeSearchUrl(problem.frontendId, problem.title);
    window.open(url, '_blank', 'noreferrer');
    e.target.value = ''; // reset so it can be selected again
  }

  const externalDropdown = (
    <select className="video-search-select" defaultValue="" onChange={openExternal}>
      <option value="" disabled>Search elsewhere…</option>
      <option value="youtube">YouTube</option>
      <option value="google">Google Videos</option>
    </select>
  );

  return (
    <div>
      {state === 'loading' && <p className="muted">Searching videos…</p>}
      {state === 'error' && (
        <div className="card video-error">
          <p className="muted" style={{ margin: '0 0 8px' }}>Video search failed.</p>
          <div className="btn-row">
            <button className="ghost small" onClick={() => runSearch(true)}>↻ Retry</button>
            {externalDropdown}
          </div>
        </div>
      )}
      {state === 'ready' && videos.length === 0 && (
        <div className="card video-error">
          <p className="muted" style={{ margin: '0 0 8px' }}>No videos found for this problem.</p>
          <div className="btn-row">
            <button className="ghost small" onClick={() => runSearch(true)}>↻ Retry</button>
            {externalDropdown}
          </div>
        </div>
      )}
      {state === 'ready' && videos.length > 0 && (
        <div className="btn-row video-toolbar">
          <button className="ghost small" onClick={() => runSearch(true)}>↻ Refresh</button>
          {externalDropdown}
        </div>
      )}
      {videos.map((v) => (
        <div className="card" key={v.videoId} style={{ padding: 0, overflow: 'hidden' }}>
          {playing === v.videoId ? (
            <iframe
              src={`https://www.youtube.com/embed/${v.videoId}?autoplay=1`}
              style={{ width: '100%', aspectRatio: '16 / 9', border: 0, display: 'block' }}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              title={v.title}
            />
          ) : (
            <button
              onClick={() => setPlaying(v.videoId)}
              style={{ display: 'block', width: '100%', padding: 0, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ position: 'relative' }}>
                <img src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} alt=""
                  style={{ width: '100%', display: 'block' }} />
                <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 36 }}>▶️</span>
                {v.duration && (
                  <span style={{ position: 'absolute', right: 6, bottom: 6, background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: 11, padding: '1px 5px', borderRadius: 4 }}>
                    {v.duration}
                  </span>
                )}
              </div>
            </button>
          )}
          <div style={{ padding: '8px 10px' }}>
            <div>{v.title}</div>
            <div className="muted">{v.channel}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
