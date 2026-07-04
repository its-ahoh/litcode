import type { ProblemMeta } from '@/lib/types';
import { videoMap, searchUrl } from '@/assets/videos';

export default function VideosTab({ problem }: { problem: ProblemMeta | null }) {
  if (!problem) return <p className="muted">Open a LeetCode problem to see curated solution videos here.</p>;
  const videos = videoMap[problem.slug] ?? [];
  return (
    <div>
      {videos.map((v) => (
        <a key={v.videoId} className="card video-card" target="_blank" rel="noreferrer"
           href={`https://www.youtube.com/watch?v=${v.videoId}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <img src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`} alt="" style={{ width: '100%', borderRadius: 6 }} />
          <div style={{ marginTop: 6 }}>{v.title}</div>
          <div className="muted">{v.channel}</div>
        </a>
      ))}
      {videos.length === 0 && <p className="muted">No curated videos for this problem yet.</p>}
      <a className="ghost" style={{ display: 'inline-block', marginTop: 8, textDecoration: 'none', padding: '5px 10px', border: '1px solid #ccc', borderRadius: 6, color: 'inherit' }}
         target="_blank" rel="noreferrer" href={searchUrl(problem.frontendId, problem.title)}>
        🔍 Search this problem on YouTube
      </a>
    </div>
  );
}
