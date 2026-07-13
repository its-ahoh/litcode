import { useEffect, useState } from 'react';
import type { ProblemMeta } from '@/lib/types';
import { videoMap } from '@/assets/videos';
import { searchVideos, sortVideos, type VideoResult, type VideoSort } from '@/lib/videoSearch';
import { updateStore } from '@/lib/storage';
import { SPOKEN_LANGUAGES, type VideoLanguage } from '@/lib/languages';
import { useStore } from '../useStore';

// Session-level cache: switching back to the same problem doesn't repeat the search
const searchCache = new Map<string, VideoResult[]>();

export default function VideosTab({ problem }: { problem: ProblemMeta | null }) {
  const store = useStore();
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState<string | null>(null);
  const [sort, setSort] = useState<VideoSort>('relevance');
  const language = store?.settings.videoLanguage ?? 'all';

  const slug = problem?.slug ?? null;
  const searchQuery = problem
    ? `leetcode ${problem.frontendId} ${problem.title}${language === 'all' ? '' : ` ${language}`} solution`
    : '';
  // Curated NeetCode videos are English. Other spoken-language choices use live search.
  const curated = slug && (language === 'all' || language === 'English') ? videoMap[slug] : undefined;
  const isCurated = Boolean(curated?.length);

  function runSearch(force = false) {
    if (!problem || !slug) return () => {};
    setPlaying(null);
    setSort('relevance');
    if (curated?.length) {
      setVideos(curated.map((v) => ({ ...v, duration: '', views: 0, publishedAt: '' })));
      setState('ready');
      return () => {};
    }
    if (!force) {
      const cached = searchCache.get(`${slug}:${language}`);
      if (cached) {
        setVideos(cached);
        setState('ready');
        return () => {};
      }
    }
    let alive = true;
    setVideos([]);
    setState('loading');
    searchVideos(searchQuery)
      .then((results) => {
        const top = results.slice(0, 20);
        searchCache.set(`${slug}:${language}`, top);
        if (alive) { setVideos(top); setState('ready'); }
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }

  async function setLanguage(nextLanguage: VideoLanguage) {
    await updateStore((s) => ({ settings: { ...s.settings, videoLanguage: nextLanguage } }));
  }

  useEffect(() => runSearch(), [slug, language]);

  if (!problem) return <p className="muted">Open a LeetCode problem to see solution videos here.</p>;

  const externalSearches = (
    <div className="external-search">
      <span>Search directly:</span>
      <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`} target="_blank" rel="noreferrer">YouTube</a>
      <a href={`https://www.google.com/search?tbm=vid&q=${encodeURIComponent(searchQuery)}`} target="_blank" rel="noreferrer">Google Videos</a>
    </div>
  );

  const toolbar = (refreshLabel: string) => (
    <div className="video-toolbar">
      <button className="ghost small" onClick={() => runSearch(true)}>↻ {refreshLabel}</button>
      <select
        className="video-select language-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value as VideoLanguage)}
        title="Filter videos by spoken language"
      >
        <option value="all">Any language</option>
        {SPOKEN_LANGUAGES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      {!isCurated && (
        <select
          className="video-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as VideoSort)}
          title="Sort videos"
        >
          <option value="relevance">Relevance</option>
          <option value="views">Most viewed</option>
          <option value="date">Latest</option>
        </select>
      )}
    </div>
  );

  return (
    <div>
      {state === 'loading' && <p className="muted">Searching videos…</p>}
      {state === 'error' && (
        <div className="card video-error">
          <p className="muted" style={{ margin: '0 0 8px' }}>Video search is temporarily unavailable.</p>
          {toolbar('Retry')}
          {externalSearches}
        </div>
      )}
      {state === 'ready' && videos.length === 0 && (
        <div className="card video-error">
          <p className="muted" style={{ margin: '0 0 8px' }}>No videos found for this problem.</p>
          {toolbar('Retry')}
          {externalSearches}
        </div>
      )}
      {state === 'ready' && videos.length > 0 && toolbar('Refresh')}
      {sortVideos(videos, sort).map((v) => (
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
