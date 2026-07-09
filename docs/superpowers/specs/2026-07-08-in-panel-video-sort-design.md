# In-panel video sorting (Videos tab)

**Date:** 2026-07-08
**Status:** Approved

## Problem

In the Videos tab, the Filter select (Relevance / Most viewed / Latest / Most liked) and the
"Search on…" select (YouTube / Google Videos / DuckDuckGo) both open a new browser tab with an
external search. The user expects them to refresh the video list inside the panel.

## Decision

Sort in-panel over the already-fetched DuckDuckGo results; remove the external-search select.

- The DDG `v.js` response already carries `statistics.viewCount` and `published` per result —
  enough to sort by views and date client-side. No refetch, no new tab.
- "Search on…" is removed: Google/YouTube result lists can't be fetched in-panel without
  scraping, and the in-panel list is DDG-sourced YouTube videos anyway.
- "Most liked" is removed: DDG provides no like data; no honest way to sort by it.

## Changes

### `lib/videoSearch.ts`

- `VideoResult` gains `views: number` (from `statistics.viewCount`, default `0`) and
  `publishedAt: string` (from `published`, default `''`).
- New pure function `sortVideos(results, sort)` where `sort` is
  `'relevance' | 'views' | 'date'`:
  - `relevance` → the original array order (DDG's ranking), returned as-is
  - `views` → descending `views`
  - `date` → descending `publishedAt` (ISO strings compare lexicographically; empty sorts last)
  - Returns a new array; never mutates input. Stable sort.

### `entrypoints/sidepanel/tabs/VideosTab.tsx`

- Remove the "Search on…" select, `onSearchElsewhere`, and the
  `youtubeSearchUrl`/`googleSearchUrl`/`duckduckgoSearchUrl` imports.
- Filter select becomes a controlled `sort` state (default `'relevance'`), options:
  Relevance / Most viewed / Latest. Changing it re-sorts the rendered list in place.
- Keep more results: slice to 20 instead of 8 (one fetch either way; sorting is more useful
  over the fuller set).
- Curated videos (`videoMap`): no views/dates, small hand-ordered lists → hide the Filter
  select when showing a curated list.
- `searchCache` keeps storing the relevance-ordered list; sorting is applied at render time,
  so cached lists and the sort state stay independent.
- Sort state resets to `'relevance'` when the problem changes.

## Not doing

- No re-query of DDG with sort parameters (its video API has no reliable sort params).
- No YouTube InnerTube integration.
- No sort persistence across problems or sessions.

## Testing

- Extend existing `videoSearch` parsing tests for `views` / `publishedAt` (including
  missing-field defaults).
- Unit-test `sortVideos`: each sort key, immutability, empty/missing values sorting last.
