# LitCode — LeetCode Enhancement Chrome Extension Design Doc

Date: 2026-07-03
Status: Confirmed

## Background & Goals

LeetCode locks editor autocomplete (Autocomplete/IntelliSense) and similar features behind Premium membership. This project builds a **100% local, zero-AI, zero-external-server** Chrome extension (Manifest V3) that, while solving problems on leetcode.com (international version), provides the following capabilities:

1. **Local IntelliSense completion** — pops up method-name candidates when typing a letter prefix or `.` (Python / Java / JavaScript/TypeScript)
2. **YouTube solution video linking** — curated mapping first, search link as fallback
3. **Mistake book + spaced repetition** — automatically records problems you got stuck on, and reschedules them for retry at 3/7/14-day intervals
4. **Interview mode** — timing, hiding distracting info such as difficulty
5. **Multi-version solution archive** — save up to 3 versions of your own answer per problem

Explicitly out of scope (YAGNI): AI autocomplete, progressive hints, code review, complexity analysis, a self-built backend, cross-device cloud sync, leetcode.cn support.

## Overall Architecture

Tech stack: **TypeScript + WXT framework + React (Side Panel UI only) + Vitest**.

```
┌─ leetcode.com page ────────────────┐   ┌─ Chrome Side Panel ──────────┐
│ Content Script                     │   │ React UI, four tabs:          │
│ ├─ Inject MAIN world script to hook│◄─►│ 📺Video | 📕Mistakes | 💾Solutions | ⏱Interview│
│ │   into Monaco                    │  └───────────┬──────────────────┘
│ │   → registerCompletionItemProvider│              │
│ ├─ Extract problem info (slug/title/difficulty)│   │
│ ├─ Listen for submission results   │   ┌──────────▼──────────────────┐
│ │   (AC / WA / TLE)                │   │ chrome.storage.local         │
│ └─ Read/write editor code          │   │ Practice records / solution   │
│   (for solution archiving)         │   │ versions / settings           │
└────────────────────────────────────┘   └─────────────────────────────┘
Static assets (bundled into the extension, fully offline):
├─ Completion dictionary JSON × 3 languages (Python / Java / JS-TS)
└─ Curated video mapping JSON (slug → YouTube video list)
```

- Minimize the page-injection surface: only handle four things — Monaco integration, problem info extraction, submission monitoring, and code read/write
- All feature UI lives in the native Chrome Side Panel, unaffected by LeetCode frontend redesigns
- The extension makes no network requests of its own; the only network activity is the user clicking a video link to open YouTube

### Components & Communication

| Component | Responsibility | Communication |
|---|---|---|
| MAIN world injected script | Access `window.monaco`, register completion Provider; read/write editor content | `window.postMessage` with the content script |
| Content script (isolated world) | Problem info extraction, submission result monitoring, message relay | `chrome.runtime` messages with side panel / background |
| Side Panel (React) | All feature UI | Reads/writes `chrome.storage.local`, requests current problem/code from content script |
| Background service worker | Icon badge (today's due count), side panel open logic | `chrome.storage` + `chrome.runtime` messages |

## Feature Design

### 1. Local IntelliSense Completion

- Register one Provider each for Python / Java / JavaScript / TypeScript via `registerCompletionItemProvider`, with `triggerCharacters: ['.']`; letter-triggered completion relies on Monaco's native word-prefix fuzzy matching
- Candidate content = language keywords + built-in functions + common methods (each with a function signature and a one-line English description), sorted by usage frequency in problem-solving
- On `.` trigger, no type inference is performed — the merged common-methods table for that language is shown, and continued typing fuzzy-filters it
- Dictionary scope:
  - Python: builtins, `list/dict/str/set/tuple` methods, `heapq/collections/bisect/math/itertools/functools`
  - Java: `String/StringBuilder/List/ArrayList/Map/HashMap/Set/Deque/PriorityQueue/Arrays/Collections/Character/Integer`
  - JS/TS: `Array/String/Map/Set/Object/Math/Number/JSON`
- JS/TS special treatment: detect whether the page's Monaco has the `monaco.languages.typescript` language service; if so, enable semantic-level completion directly, with the static dictionary only as a fallback
- The dictionary is a JSON file bundled into the extension, with structure: `{ label, kind, signature, doc, insertText }`

### 2. YouTube Solution Video Linking

- Built-in curated mapping JSON: `slug → [{ videoId, title, channel, duration }]`, primarily based on the NeetCode series (~600 problems)
- The Side Panel's "Video" tab shows video cards based on the current problem's slug; clicking opens YouTube in a new tab
- When there's no mapping match, show a "Search this problem on YouTube" button, linking to `https://www.youtube.com/results?search_query=leetcode+<problem number>+<English title>`
- The mapping table is updated with extension releases

### 3. Mistake Book + Spaced Repetition

- The content script intercepts the LeetCode submission-check API response and records each submission: `{ slug, title, difficulty, result, timestamp, durationMs }`
- Auto-add rule: a problem is automatically added to the mistake book after ≥ 2 cumulative WA/TLE results for the same problem; the side panel also supports manually marking "retry"
- Review scheduling: once added, a 3-day due date is generated; on retry, an AC advances it to the 7-day tier, then the 14-day tier; passing all three tiers automatically graduates it out
- The "Mistake Book" tab shows today's due list + the full list; the extension icon badge shows today's due count
- Data is stored in `chrome.storage.local`; supports one-click export/import as JSON (including the solution archive)

### 4. Interview Mode

- One-click toggle in the Side Panel, with persisted state
- When enabled: timing starts automatically upon entering a problem page (shown in the side panel, with an optional floating in-page mini timer); injected CSS hides the difficulty label, acceptance rate, like count, and discussion-section entry point
- Default target times: Easy 15 / Medium 25 / Hard 40 minutes, adjustable in settings; the timer changes color as a warning when the target is exceeded
- After finishing (AC or manual stop), the time taken is written to the practice record; problems with severe timeouts (> 2× target) are suggested for addition to the mistake book

### 5. Multi-version Solution Archive

- The Side Panel's "Solutions" tab provides 3 version slots for the current problem
- "Save current code": grabs the current code + language + timestamp from Monaco via the message chain and stores it in an empty slot; when all 3 slots are full, the user is prompted to choose which one to overwrite
- Each version's label/note is editable (e.g. "brute force", "hash-optimized", "optimal O(n)")
- Each version supports: one-click restore to the editor (with a confirmation prompt before overwriting), one-click copy, and delete
- Data structure: `solutions[slug] = [{ label, language, code, savedAt }]` (max 3 entries), included in the unified export/import

## Data Model (chrome.storage.local)

```ts
{
  settings: { languages: string[], interviewMode: boolean, targetMinutes: {easy,medium,hard} },
  attempts: Record<slug, Attempt[]>,        // submission records
  reviewQueue: Record<slug, { stage: 0|1|2, dueDate: string, addedAt: string }>,
  solutions: Record<slug, SolutionVersion[]>, // max 3 per problem
}
```

## Error Handling

- **Monaco not found**: MutationObserver + polling wait for up to 10 seconds; on failure, degrade silently — only completion is disabled, other features work normally
- **DOM redesign**: problem info is preferentially read from the URL and page-embedded data (`__NEXT_DATA__` / GraphQL cache), with DOM selectors only as a fallback; if submission monitoring fails, the mistake book falls back to pure manual mode
- **Feature isolation**: a failed initialization in any one module does not block the others
- **Storage safety**: schema validation before writes; importing JSON validates the format and prompts for merge/overwrite

## Testing Strategy

- **Vitest unit tests**: completion dictionary data integrity, spaced-repetition scheduling logic, solution slot management, export/import serialization
- **Manual acceptance**: each feature comes with an acceptance checklist, verified on the actual leetcode.com page (completion triggering, submission capture, interview mode element hiding, etc.)
- No browser automation testing introduced in v1

## Suggested Implementation Phases

1. Project scaffolding (WXT) + Monaco integration + Python completion (core value validation)
2. Java / JS dictionaries + problem info extraction + Side Panel skeleton + video tab
3. Submission monitoring + mistake book + spaced repetition + badge
4. Solution archive + interview mode + export/import + polish
