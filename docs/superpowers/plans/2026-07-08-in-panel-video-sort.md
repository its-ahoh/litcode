# In-Panel Video Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Videos tab Filter select sorts the fetched list in-panel (no new tab); the "Search on…" select is removed.

**Architecture:** `lib/videoSearch.ts` gains `views`/`publishedAt` on `VideoResult` (parsed from fields the DDG API already returns) plus a pure `sortVideos()` function. `VideosTab.tsx` holds a controlled `sort` state and applies `sortVideos` at render time, so the cache keeps storing relevance order. External-search URL helpers in `assets/videos.ts` become dead code and are removed.

**Tech Stack:** WXT + React + TypeScript, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-07-08-in-panel-video-sort-design.md`

---

### Task 1: Parse `views`/`publishedAt` and add `sortVideos` in lib/videoSearch.ts

**Files:**
- Modify: `lib/videoSearch.ts`
- Test: `tests/videosearch.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/videosearch.test.ts` (also add the new imports to the existing import line):

```ts
import { extractVqd, youtubeIdFromUrl, parseResults, sortVideos, type VideoResult } from '../lib/videoSearch';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/videosearch.test.ts`
Expected: FAIL — `parseResults` and `sortVideos` are not exported.

- [ ] **Step 3: Implement in `lib/videoSearch.ts`**

Extend the interface (after `duration`):

```ts
export interface VideoResult {
  videoId: string;   // YouTube 11-char id (only embeddable YouTube results are kept)
  title: string;
  channel: string;
  duration: string;  // e.g. "12:34", may be an empty string
  views: number;     // DDG statistics.viewCount, 0 when absent
  publishedAt: string; // ISO timestamp from DDG `published`, '' when absent
}
```

Extract the parsing loop out of `searchVideos` into a pure exported function, and add `sortVideos`:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
```

And the tail of `searchVideos` becomes:

```ts
  const data = await apiRes.json();
  return parseResults(data?.results ?? []);
```

(If the eslint disable comment is unnecessary — check with `npx eslint lib/videoSearch.ts` — drop it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/videosearch.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add lib/videoSearch.ts tests/videosearch.test.ts
git commit -m "feat(videos): parse views/publishedAt and add pure sortVideos"
```

---

### Task 2: In-panel sort select in VideosTab

**Files:**
- Modify: `entrypoints/sidepanel/tabs/VideosTab.tsx`

No component test harness exists in this repo (tests are pure logic); this task is verified by typecheck, lint, build, and the end-to-end check in Task 4.

- [ ] **Step 1: Rewrite the imports and component state**

Replace the current imports/state at the top of `VideosTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { ProblemMeta } from '@/lib/types';
import { videoMap } from '@/assets/videos';
import { searchVideos, sortVideos, type VideoResult, type VideoSort } from '@/lib/videoSearch';

// Session-level cache: switching back to the same problem doesn't repeat the search
const searchCache = new Map<string, VideoResult[]>();

export default function VideosTab({ problem }: { problem: ProblemMeta | null }) {
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState<string | null>(null);
  const [sort, setSort] = useState<VideoSort>('relevance');

  const slug = problem?.slug ?? null;
  // Curated lists are small and hand-ordered, and carry no view/date data to sort by
  const isCurated = slug ? Boolean(videoMap[slug]) : false;
```

- [ ] **Step 2: Update runSearch (curated defaults, top 20, sort reset)**

```tsx
  function runSearch(force = false) {
    if (!problem || !slug) return () => {};
    setPlaying(null);
    setSort('relevance');
    const curated = videoMap[slug];
    if (curated) {
      setVideos(curated.map((v) => ({ ...v, duration: '', views: 0, publishedAt: '' })));
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
        const top = results.slice(0, 20);
        searchCache.set(slug, top);
        if (alive) { setVideos(top); setState('ready'); }
      })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }

  useEffect(() => runSearch(), [slug]);
```

- [ ] **Step 3: Delete `onSort` and `onSearchElsewhere`, replace the toolbar**

Remove both handler functions and the old two-select toolbar. New toolbar (the sort select is controlled and hidden for curated lists):

```tsx
  const toolbar = (refreshLabel: string) => (
    <div className="video-toolbar">
      <button className="ghost small" onClick={() => runSearch(true)}>↻ {refreshLabel}</button>
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
```

Note: the old markup wrapped the two selects in `<div className="video-toolbar-selects">`; with a single select that wrapper goes away. Check `entrypoints/sidepanel/style.css` (or wherever `.video-toolbar-selects` is defined) — if the class is now unreferenced, delete its CSS rule.

- [ ] **Step 4: Sort at render time**

In the returned JSX, map over the sorted list instead of `videos`:

```tsx
      {sortVideos(videos, sort).map((v) => (
```

(The rest of the card JSX is unchanged.)

- [ ] **Step 5: Typecheck, lint, and test**

Run: `npx tsc --noEmit && npx eslint entrypoints/sidepanel/tabs/VideosTab.tsx && npx vitest run`
Expected: tsc exit 0; eslint may still show the pre-existing `set-state-in-effect` / `exhaustive-deps` warnings on this file (not errors — leave them); all tests pass.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/sidepanel/tabs/VideosTab.tsx
git commit -m "feat(videos): sort in-panel instead of opening external search tabs"
```

---

### Task 3: Remove dead external-search helpers from assets/videos.ts

**Files:**
- Modify: `assets/videos.ts`
- Modify: `tests/videos.test.ts`

After Task 2, nothing imports `searchUrl`, `youtubeSearchUrl`, `googleSearchUrl`, `duckduckgoSearchUrl`, `YouTubeSort`, or `YT_SORT` from `assets/videos.ts` (only `videoMap` remains used). Verify, then delete.

- [ ] **Step 1: Verify they are unreferenced**

Run: `grep -rn "searchUrl\|YouTubeSort" --include="*.ts" --include="*.tsx" entrypoints lib assets tests | grep -v "assets/videos.ts:" | grep -v "tests/videos.test.ts:"`
Expected: no output.

- [ ] **Step 2: Delete the helpers**

In `assets/videos.ts`, delete the `query()`, `searchUrl()`, `youtubeSearchUrl()`, `googleSearchUrl()`, `duckduckgoSearchUrl()` functions and the `YouTubeSort` type + `YT_SORT` table (everything from the `function query(` line through the end of `duckduckgoSearchUrl`). Keep `videoMap` and its types.

In `tests/videos.test.ts`, change the import to `import { videoMap } from '../assets/videos';` and delete the `test('searchUrl builds a YouTube query', ...)` block.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run && npx eslint assets/videos.ts tests/videos.test.ts`
Expected: all pass, no new lint problems.

- [ ] **Step 4: Commit**

```bash
git add assets/videos.ts tests/videos.test.ts
git commit -m "chore(videos): drop dead external-search URL helpers"
```

---

### Task 4: Pack and verify end-to-end

**Files:**
- Modify: `extension/` (generated by pack)

The user's Chrome loads the committed `extension/` folder — `npm run build` alone is not enough (see memory: litcode-pack-workflow).

- [ ] **Step 1: Pack**

Run: `npm run pack`
Expected: `✔ Built extension` and `extension/` refreshed.

- [ ] **Step 2: End-to-end check**

Load the packed extension in a headed browser and confirm: the Videos tab shows one sort select (Relevance/Most viewed/Latest), no "Search on…" select, and changing the sort reorders the cards without opening a tab. A ready-made harness pattern from the error-153 session lives at `/private/tmp/claude-501/-Users-jackou-Documents-projects-litcode/67f99b88-1cd8-477e-8030-f1c4113119d2/scratchpad/test-embed.mjs` (Playwright `launchPersistentContext` with `--load-extension`); adapt it to open `chrome-extension://<id>/sidepanel.html` — or, since the panel needs a LeetCode problem context to search, at minimum screenshot the sidepanel and verify the toolbar renders. If browser verification is impractical in the session, state that plainly and ask the user to verify after reload.

- [ ] **Step 3: Commit the packed build**

```bash
git add extension/
git commit -m "chore: pack extension with in-panel video sorting"
```
