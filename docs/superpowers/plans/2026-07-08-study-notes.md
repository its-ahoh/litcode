# Study Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically distill each finished AI-tutor conversation into per-problem markdown study notes, stored in the extension and written into the user's Obsidian vault folder.

**Architecture:** Chat turns are mirrored into `chrome.storage` (`pendingConversation`); finalization triggers (clear chat, new-slug conversation, sidepanel mount) run one LLM call that appends a dated session to `studyNotes[slug]` and appends a `## Session` block to `<frontendId>-<slug>.md` in a user-picked File System Access folder. A new 📝 Notes tab browses, downloads, and syncs notes.

**Tech Stack:** React (WXT sidepanel), chrome.storage.local via existing `lib/storage.ts`, existing `chat()` in `lib/ai.ts` (BYOK Anthropic/OpenAI), File System Access API + IndexedDB handle persistence, vitest.

**Spec:** `docs/superpowers/specs/2026-07-08-study-notes-design.md` (branch `study-notes`)

**Facts about the codebase this plan relies on:**
- `lib/types.ts` — `ProblemMeta { slug, frontendId, title, difficulty }`, `Difficulty`, `StoreShape { settings, attempts, reviewQueue, solutions, session }`.
- `lib/storage.ts` — single `chrome.storage.local` key `'litcode'`; `getStore()` merges `{ ...DEFAULTS, ...saved }` (so new fields need only a DEFAULTS entry); `updateStore(fn)` serialized read-modify-write; `patchStore(patch)` shallow merge.
- `lib/ai.ts` — `chat(ai, messages)` hard-codes `TUTOR_SYSTEM_PROMPT` in both provider paths (`chatViaAnthropic` line 42, `chatViaOpenAi` line 59); `ChatMsg { role: 'user'|'assistant'; content: string }`.
- `entrypoints/sidepanel/tabs/AITab.tsx` — chat state `turns: Turn[]` where `Turn extends ChatMsg { display: string }` (user turns: `content` = full injected prompt, `display` = friendly label; assistant turns: `content === display`). Conversation resets in a `useEffect` keyed on `[slug]` (lines 31-35). Clear-chat button at line 307-311. `send()` (line 118) appends the assistant reply in two paths: cache hit (line 126) and API reply (line 139). Export uses a Blob+anchor pattern (`exportData`, lines 218-226). `problem: ProblemMeta | null` prop; `store` from `useStore()`.
- `entrypoints/sidepanel/App.tsx` — `TABS` array (line 9-14: videos/review/solutions/ai), single-select tab state, only the active tab is mounted. `problem` from `useProblem()`.
- `entrypoints/sidepanel/Markdown.tsx` — `<Markdown text={...} />` renders sanitized markdown.
- `tests/fake-chrome.ts` — `installFakeChrome()` installs a fake `chrome.storage.local` (single-string-key `get`) + `onChanged.addListener` no-op; returns the backing data object. Used by storage tests.
- `vitest.config.ts` includes `tests/**/*.test.ts`. `npm test` (33 tests, 7 files), `npm run lint`, `npx tsc --noEmit` all currently pass on branch `study-notes`.
- eslint: `@typescript-eslint/no-explicit-any` is off; unused vars prefixed `_` are allowed.
- CSS: reuse existing classes (`card`, `muted`, `ghost`, `small`, `primary`, `btn-row`, `settings`, `field`, `action`, `error-card`); no stylesheet changes planned.

---

### Task 1: Types, store defaults, and `chat()` system-prompt parameter

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/storage.ts:5-11`
- Modify: `lib/ai.ts`
- Test: existing suite (`npm test`) + `npx tsc --noEmit` (pure additions; behavior unchanged)

- [ ] **Step 1: Add the new types**

In `lib/types.ts`, insert after the `SolutionVersion` interface (line 34):

```ts
// One mirrored tutor conversation awaiting distillation into study notes
export interface PendingConversation {
  slug: string;
  title: string;
  frontendId: string;
  difficulty: Difficulty | null;
  turns: { role: 'user' | 'assistant'; text: string }[];
  updatedAt: number;
}

// One distilled conversation session (H3 sections only; H1/H2 added at file build)
export interface StudyNote {
  markdown: string;
  createdAt: number;
  turnCount: number;
  synced: boolean; // written to the vault folder?
}

export interface StudyNotesEntry {
  title: string;
  frontendId: string;
  difficulty: Difficulty | null;
  sessions: StudyNote[]; // oldest first
}
```

In the `StoreShape` interface, add after `session`:

```ts
  pendingConversation: PendingConversation | null;
  studyNotes: Record<string, StudyNotesEntry>; // keyed by slug
```

- [ ] **Step 2: Add store defaults**

In `lib/storage.ts`, extend `DEFAULTS`:

```ts
const DEFAULTS: StoreShape = {
  settings: DEFAULT_SETTINGS,
  attempts: {},
  reviewQueue: {},
  solutions: {},
  session: null,
  pendingConversation: null,
  studyNotes: {},
};
```

(No migration needed: `getStore()` spreads `DEFAULTS` under saved data, and `patchStore` on import keeps current values for keys the imported blob lacks.)

- [ ] **Step 3: Give `chat()` an optional system prompt**

In `lib/ai.ts`, thread a `system` parameter through all three functions, defaulting to the tutor prompt so existing callers are unchanged:

```ts
/** Multi-turn chat; messages is an ordered sequence of user/assistant turns */
export async function chat(
  ai: AiSettings,
  messages: ChatMsg[],
  system: string = TUTOR_SYSTEM_PROMPT,
): Promise<string> {
  if (!ai.apiKey) throw new Error('No API key configured — add one in the settings below.');
  const model = ai.model.trim() || DEFAULT_MODELS[ai.provider];
  return ai.provider === 'anthropic'
    ? chatViaAnthropic(ai, model, messages, system)
    : chatViaOpenAi(ai, model, messages, system);
}
```

`chatViaAnthropic(ai, model, messages, system)`: replace `system: TUTOR_SYSTEM_PROMPT` with `system`.
`chatViaOpenAi(ai, model, messages, system)`: replace `{ role: 'system', content: TUTOR_SYSTEM_PROMPT }` with `{ role: 'system', content: system }`.
Update both private function signatures accordingly.

- [ ] **Step 4: Verify nothing broke**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 33/33 tests pass (this branch predates gen-dicts), tsc clean, lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/storage.ts lib/ai.ts
git commit -m "feat(notes): store types for pending conversations and study notes; chat() system param"
```

---

### Task 2: Pure note builders (`lib/notes.ts` part 1)

**Files:**
- Create: `lib/notes.ts`
- Test: `tests/notes.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/notes.test.ts`:

```ts
import { expect, test } from 'vitest';
import {
  MIN_TURNS,
  buildHeaderBlock,
  buildSessionBlock,
  noteFileName,
  buildNotesRequest,
  buildNoteFile,
} from '../lib/notes';
import type { PendingConversation, StudyNotesEntry } from '../lib/types';

const pending: PendingConversation = {
  slug: 'sliding-window-maximum',
  title: 'Sliding Window Maximum',
  frontendId: '239',
  difficulty: 'Hard',
  turns: [
    { role: 'user', text: '💡 Hint 1/4' },
    { role: 'assistant', text: 'Think about what information becomes useless.' },
  ],
  updatedAt: 0,
};

test('MIN_TURNS is 2 (one exchange)', () => {
  expect(MIN_TURNS).toBe(2);
});

test('buildHeaderBlock renders title, tags, and URL', () => {
  expect(buildHeaderBlock(pending)).toBe(
    '# 239. Sliding Window Maximum (Hard)\n' +
      '#leetcode #hard\n' +
      'https://leetcode.com/problems/sliding-window-maximum/\n',
  );
});

test('buildHeaderBlock omits difficulty when unknown', () => {
  const p = { ...pending, difficulty: null };
  expect(buildHeaderBlock(p)).toBe(
    '# 239. Sliding Window Maximum\n' +
      '#leetcode\n' +
      'https://leetcode.com/problems/sliding-window-maximum/\n',
  );
});

test('buildSessionBlock wraps markdown in a dated H2', () => {
  const block = buildSessionBlock('### What I asked\n- hint', new Date('2026-07-08T12:00:00Z'));
  expect(block).toBe('## Session 2026-07-08\n\n### What I asked\n- hint\n');
});

test('noteFileName uses frontendId-slug, slug alone when id missing', () => {
  expect(noteFileName(pending)).toBe('239-sliding-window-maximum.md');
  expect(noteFileName({ ...pending, frontendId: '' })).toBe('sliding-window-maximum.md');
});

test('buildNotesRequest is a single user message containing the transcript', () => {
  const msgs = buildNotesRequest(pending);
  expect(msgs).toHaveLength(1);
  expect(msgs[0].role).toBe('user');
  expect(msgs[0].content).toContain('239. Sliding Window Maximum');
  expect(msgs[0].content).toContain('USER: 💡 Hint 1/4');
  expect(msgs[0].content).toContain('ASSISTANT: Think about what information becomes useless.');
});

test('buildNoteFile concatenates header and all session blocks', () => {
  const entry: StudyNotesEntry = {
    title: pending.title,
    frontendId: pending.frontendId,
    difficulty: pending.difficulty,
    sessions: [
      { markdown: '### Key insights\n- a', createdAt: Date.parse('2026-07-01T00:00:00Z'), turnCount: 2, synced: true },
      { markdown: '### Key insights\n- b', createdAt: Date.parse('2026-07-08T00:00:00Z'), turnCount: 4, synced: false },
    ],
  };
  const file = buildNoteFile('sliding-window-maximum', entry);
  expect(file).toContain('# 239. Sliding Window Maximum (Hard)');
  expect(file).toContain('## Session 2026-07-01');
  expect(file).toContain('## Session 2026-07-08');
  expect(file.indexOf('- a')).toBeLessThan(file.indexOf('- b'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/notes.test.ts`
Expected: FAIL — cannot resolve `../lib/notes`.

- [ ] **Step 3: Implement the builders**

Create `lib/notes.ts`:

```ts
import type { ChatMsg } from './ai';
import type { PendingConversation, StudyNotesEntry } from './types';

/** Minimum turns (one user + one assistant) for a conversation to be worth distilling */
export const MIN_TURNS = 2;

export const NOTES_SYSTEM_PROMPT =
  'You distill a LeetCode tutoring conversation into concise study notes the learner will review later. ' +
  'Output ONLY markdown with exactly these level-3 sections, in this order: ' +
  '"### What I asked", "### Key insights", "### Techniques & patterns", "### Pitfalls", "### Complexity". ' +
  'Use short, specific bullet points grounded in this conversation; keep code identifiers as-is. ' +
  'If a section has nothing, write "- (none)". Do not add any H1/H2 headings, preamble, or closing remarks.';

interface ProblemLike {
  slug: string;
  title: string;
  frontendId: string;
  difficulty: string | null;
}

function displayTitle(p: ProblemLike): string {
  const id = p.frontendId ? `${p.frontendId}. ` : '';
  const diff = p.difficulty ? ` (${p.difficulty})` : '';
  return `${id}${p.title}${diff}`;
}

/** H1 + tags + URL; written once when the vault file is created */
export function buildHeaderBlock(p: ProblemLike): string {
  const tags = p.difficulty ? `#leetcode #${p.difficulty.toLowerCase()}` : '#leetcode';
  return `# ${displayTitle(p)}\n${tags}\nhttps://leetcode.com/problems/${p.slug}/\n`;
}

/** One dated session wrapper around the LLM's H3 body */
export function buildSessionBlock(markdown: string, date: Date): string {
  const day = date.toISOString().slice(0, 10);
  return `## Session ${day}\n\n${markdown.trim()}\n`;
}

export function noteFileName(p: ProblemLike): string {
  return p.frontendId ? `${p.frontendId}-${p.slug}.md` : `${p.slug}.md`;
}

/** The whole conversation as ONE user message (avoids role-alternation constraints) */
export function buildNotesRequest(pending: PendingConversation): ChatMsg[] {
  const transcript = pending.turns
    .map((t) => `${t.role === 'user' ? 'USER' : 'ASSISTANT'}: ${t.text}`)
    .join('\n\n');
  return [
    {
      role: 'user',
      content:
        `Here is a tutoring conversation about LeetCode ${displayTitle(pending)}:\n\n` +
        `${transcript}\n\nProduce the study notes now.`,
    },
  ];
}

/** Full markdown file for a problem: header + every session (for downloads) */
export function buildNoteFile(slug: string, entry: StudyNotesEntry): string {
  const header = buildHeaderBlock({ slug, ...entry });
  const sessions = entry.sessions.map((s) => buildSessionBlock(s.markdown, new Date(s.createdAt)));
  return [header, ...sessions].join('\n');
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/notes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notes.ts tests/notes.test.ts
git commit -m "feat(notes): pure builders for note markdown, file names, and the LLM request"
```

---

### Task 3: Finalize & sync orchestration (`lib/notes.ts` part 2)

**Files:**
- Modify: `lib/notes.ts`
- Test: `tests/notes.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/notes.test.ts` (add imports at the top: `finalizePending`, `syncNotes` from `../lib/notes`; `installFakeChrome` from `./fake-chrome`; `getStore`, `patchStore` from `../lib/storage`; `beforeEach` from `vitest`):

```ts
import { beforeEach } from 'vitest';
import { finalizePending, syncNotes } from '../lib/notes';
import { installFakeChrome } from './fake-chrome';
import { getStore, patchStore } from '../lib/storage';

beforeEach(() => {
  installFakeChrome();
});

const aiSettings = { provider: 'anthropic' as const, apiKey: 'sk-test', baseUrl: '', model: '' };

async function seedPending(turns = pending.turns) {
  await patchStore({
    settings: { ai: aiSettings },
    pendingConversation: { ...pending, turns },
  });
}

test('finalizePending: no pending → none, no chat call', async () => {
  let called = 0;
  const result = await finalizePending({ chatFn: async () => { called++; return 'x'; } });
  expect(result).toBe('none');
  expect(called).toBe(0);
});

test('finalizePending: short conversation → discarded, pending cleared', async () => {
  await seedPending([{ role: 'user', text: 'hi' }]);
  const result = await finalizePending({ chatFn: async () => 'x' });
  expect(result).toBe('discarded');
  const s = await getStore();
  expect(s.pendingConversation).toBeNull();
  expect(Object.keys(s.studyNotes)).toHaveLength(0);
});

test('finalizePending: success appends a synced session and clears pending', async () => {
  await seedPending();
  const result = await finalizePending({
    chatFn: async (_ai, _msgs, system) => {
      expect(system).toContain('study notes');
      return '### What I asked\n- for a hint';
    },
    writeNoteFn: async () => true,
    now: () => Date.parse('2026-07-08T00:00:00Z'),
  });
  expect(result).toBe('finalized');
  const s = await getStore();
  expect(s.pendingConversation).toBeNull();
  const entry = s.studyNotes['sliding-window-maximum'];
  expect(entry.title).toBe('Sliding Window Maximum');
  expect(entry.sessions).toHaveLength(1);
  expect(entry.sessions[0]).toMatchObject({
    markdown: '### What I asked\n- for a hint',
    turnCount: 2,
    synced: true,
  });
});

test('finalizePending: vault write failure stores the note unsynced', async () => {
  await seedPending();
  await finalizePending({ chatFn: async () => 'notes', writeNoteFn: async () => false });
  const s = await getStore();
  expect(s.studyNotes['sliding-window-maximum'].sessions[0].synced).toBe(false);
});

test('finalizePending: chat failure keeps the pending conversation', async () => {
  await seedPending();
  const result = await finalizePending({ chatFn: async () => { throw new Error('boom'); } });
  expect(result).toBe('failed');
  const s = await getStore();
  expect(s.pendingConversation?.slug).toBe('sliding-window-maximum');
  expect(Object.keys(s.studyNotes)).toHaveLength(0);
});

test('finalizePending: second session appends after the first', async () => {
  await seedPending();
  await finalizePending({ chatFn: async () => 'first', writeNoteFn: async () => true });
  await seedPending([...pending.turns, { role: 'user', text: 'more' }, { role: 'assistant', text: 'sure' }]);
  await finalizePending({ chatFn: async () => 'second', writeNoteFn: async () => true });
  const s = await getStore();
  const sessions = s.studyNotes['sliding-window-maximum'].sessions;
  expect(sessions.map((x) => x.markdown)).toEqual(['first', 'second']);
  expect(sessions[1].turnCount).toBe(4);
});

test('syncNotes writes unsynced sessions and marks them synced', async () => {
  await seedPending();
  await finalizePending({ chatFn: async () => 'notes', writeNoteFn: async () => false });
  const written: string[] = [];
  const count = await syncNotes({
    writeNoteFn: async (fileName) => { written.push(fileName); return true; },
  });
  expect(count).toBe(1);
  expect(written).toEqual(['239-sliding-window-maximum.md']);
  const s = await getStore();
  expect(s.studyNotes['sliding-window-maximum'].sessions[0].synced).toBe(true);
});

test('syncNotes leaves sessions unsynced when a write fails', async () => {
  await seedPending();
  await finalizePending({ chatFn: async () => 'notes', writeNoteFn: async () => false });
  const count = await syncNotes({ writeNoteFn: async () => false });
  expect(count).toBe(0);
  const s = await getStore();
  expect(s.studyNotes['sliding-window-maximum'].sessions[0].synced).toBe(false);
});
```

Note for the implementer: `patchStore({ settings: { ai: aiSettings } })` — `Settings` has only the `ai` field, so this typechecks; if TS complains, cast via `settings: { ai: aiSettings } as StoreShape['settings']`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/notes.test.ts`
Expected: FAIL — `finalizePending` / `syncNotes` not exported.

- [ ] **Step 3: Implement orchestration**

Append to `lib/notes.ts` (add imports: `chat` and `AiSettings`, `getStore`, `updateStore`, `StudyNote`, `StoreShape` as needed):

```ts
import { chat } from './ai';
import { getStore, updateStore } from './storage';
import type { AiSettings } from './types';
import type { StudyNote } from './types';

export interface FinalizeDeps {
  /** LLM call; injectable for tests. Defaults to lib/ai chat(). */
  chatFn?: (ai: AiSettings, messages: ChatMsg[], system: string) => Promise<string>;
  /** Vault write; returns true when the file was written. Defaults to no-op (unsynced). */
  writeNoteFn?: (fileName: string, headerBlock: string, sessionBlock: string) => Promise<boolean>;
  now?: () => number;
}

export type FinalizeResult = 'finalized' | 'discarded' | 'failed' | 'none';

// Multiple UI surfaces (App mount, AITab slug effect, clear button) can trigger
// finalization near-simultaneously; serialize so the LLM is called once.
let finalizeChain: Promise<FinalizeResult> = Promise.resolve('none');

export function finalizePending(deps: FinalizeDeps = {}): Promise<FinalizeResult> {
  const run = () => doFinalize(deps).catch(() => 'failed' as const);
  finalizeChain = finalizeChain.then(run, run);
  return finalizeChain;
}

async function doFinalize(deps: FinalizeDeps): Promise<FinalizeResult> {
  const { chatFn = chat, writeNoteFn = async () => false, now = Date.now } = deps;
  const store = await getStore();
  const pending = store.pendingConversation;
  if (!pending) return 'none';
  if (pending.turns.length < MIN_TURNS) {
    await updateStore(() => ({ pendingConversation: null }));
    return 'discarded';
  }

  let markdown: string;
  try {
    markdown = await chatFn(store.settings.ai, buildNotesRequest(pending), NOTES_SYSTEM_PROMPT);
  } catch {
    return 'failed'; // keep pending; retried on the next trigger
  }

  const createdAt = now();
  const sessionBlock = buildSessionBlock(markdown, new Date(createdAt));
  const synced = await writeNoteFn(noteFileName(pending), buildHeaderBlock(pending), sessionBlock).catch(() => false);

  const note: StudyNote = { markdown, createdAt, turnCount: pending.turns.length, synced };
  await updateStore((s) => {
    const prev = s.studyNotes[pending.slug];
    const entry: StudyNotesEntry = prev
      ? { ...prev, sessions: [...prev.sessions, note] }
      : {
          title: pending.title,
          frontendId: pending.frontendId,
          difficulty: pending.difficulty,
          sessions: [note],
        };
    return {
      pendingConversation: null,
      studyNotes: { ...s.studyNotes, [pending.slug]: entry },
    };
  });
  return 'finalized';
}

export interface SyncDeps {
  writeNoteFn: (fileName: string, headerBlock: string, sessionBlock: string) => Promise<boolean>;
}

/** Write every unsynced session to the vault, oldest first. Returns sessions synced. */
export async function syncNotes({ writeNoteFn }: SyncDeps): Promise<number> {
  const store = await getStore();
  let count = 0;
  for (const [slug, entry] of Object.entries(store.studyNotes)) {
    const p = { slug, ...entry };
    for (let i = 0; i < entry.sessions.length; i++) {
      const session = entry.sessions[i];
      if (session.synced) continue;
      const block = buildSessionBlock(session.markdown, new Date(session.createdAt));
      const ok = await writeNoteFn(noteFileName(p), buildHeaderBlock(p), block).catch(() => false);
      if (!ok) continue;
      count++;
      await updateStore((s) => {
        const cur = s.studyNotes[slug];
        if (!cur) return {};
        const sessions = cur.sessions.map((x, j) => (j === i ? { ...x, synced: true } : x));
        return { studyNotes: { ...s.studyNotes, [slug]: { ...cur, sessions } } };
      });
    }
  }
  return count;
}
```

(Adjust the import lines at the top of the file so `ChatMsg`, `StudyNotesEntry` etc. are all imported once — no duplicate import statements.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/notes.test.ts` then full `npm test`
Expected: all notes tests pass; full suite passes.

- [ ] **Step 5: Commit**

```bash
git add lib/notes.ts tests/notes.test.ts
git commit -m "feat(notes): finalize and sync orchestration with injectable deps"
```

---

### Task 4: Vault module (`lib/vault.ts`)

**Files:**
- Create: `lib/vault.ts`
- Test: compile + lint only (File System Access API is browser-only; module stays thin)

- [ ] **Step 1: Implement the module**

Create `lib/vault.ts`:

```ts
// Obsidian vault folder integration via the File System Access API.
// The directory handle persists in IndexedDB (it cannot be stored in chrome.storage).
// After a browser restart Chrome demotes permission to 'prompt'; requestVaultPermission()
// must then be called from a user gesture before writes succeed again.

const DB_NAME = 'litcode-vault';
const DB_STORE = 'handles';
const DB_KEY = 'vaultDir';

type DirHandle = {
  queryPermission(opts: { mode: string }): Promise<string>;
  requestPermission(opts: { mode: string }): Promise<string>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<DirHandle | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => resolve((req.result as DirHandle) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbSet(value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type VaultStatus = 'disconnected' | 'granted' | 'needs-permission';

/** Pick the vault folder (must be called from a user gesture). Returns true when connected. */
export async function connectVault(): Promise<boolean> {
  try {
    const picker = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<DirHandle> })
      .showDirectoryPicker;
    if (!picker) return false;
    const handle = await picker({ mode: 'readwrite' });
    await idbSet(handle);
    return true;
  } catch {
    return false; // user cancelled or API unavailable
  }
}

export async function disconnectVault(): Promise<void> {
  await idbSet(null);
}

export async function vaultStatus(): Promise<VaultStatus> {
  const handle = await idbGet();
  if (!handle) return 'disconnected';
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    return perm === 'granted' ? 'granted' : 'needs-permission';
  } catch {
    return 'needs-permission';
  }
}

/** Re-request folder permission (must be called from a user gesture). */
export async function requestVaultPermission(): Promise<boolean> {
  const handle = await idbGet();
  if (!handle) return false;
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Append one session block to <fileName> in the vault folder.
 * Creates the file with headerBlock first when it doesn't exist; appending (not
 * rebuilding) preserves any edits the user made to the file in Obsidian.
 * Returns true when written; false when the vault is unavailable/not permitted.
 */
export async function writeNote(
  fileName: string,
  headerBlock: string,
  sessionBlock: string,
): Promise<boolean> {
  const handle = await idbGet();
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    const file = await handle.getFileHandle(fileName, { create: true });
    const existing = await file.getFile().then((f) => f.text());
    const content = existing.trim()
      ? `${existing.replace(/\n+$/, '\n')}\n${sessionBlock}`
      : `${headerBlock}\n${sessionBlock}`;
    const w = await file.createWritable();
    await w.write(content);
    await w.close();
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify compile + lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean (no tests for this module).

- [ ] **Step 3: Commit**

```bash
git add lib/vault.ts
git commit -m "feat(notes): vault folder module via File System Access API"
```

---

### Task 5: AITab integration (mirroring + finalize triggers)

**Files:**
- Modify: `entrypoints/sidepanel/tabs/AITab.tsx`
- Test: existing suite + manual reasoning (React wiring; no component tests in this repo)

- [ ] **Step 1: Add imports and a finalize helper**

In `AITab.tsx`, extend the imports:

```ts
import { finalizePending } from '@/lib/notes';
import { writeNote } from '@/lib/vault';
```

Inside the component (after `const [error, setError] = useState('')`), add a status state:

```ts
const [notesStatus, setNotesStatus] = useState('');
```

Add the helper (place next to `setAi`, after the early `if (!store) return null;` block):

```ts
// Distill any finished pending conversation into study notes (fire-and-forget safe)
async function finalizeNotes() {
  const result = await finalizePending({ writeNoteFn: writeNote });
  if (result === 'finalized') {
    setNotesStatus('📝 Study notes saved');
    setTimeout(() => setNotesStatus(''), 4000);
  }
}
```

- [ ] **Step 2: Mirror the conversation into the store**

Add a mirroring helper next to `finalizeNotes`:

```ts
// Mirror the finished turn pairs into the store so notes survive unmount/close.
// User turns keep the friendly display label; assistant turns keep full content.
async function mirrorConversation(allTurns: Turn[]) {
  if (!problem) return; // no problem context — nothing to attribute the notes to
  await patchStore({
    pendingConversation: {
      slug: problem.slug,
      title: problem.title,
      frontendId: problem.frontendId,
      difficulty: problem.difficulty,
      turns: allTurns.map((t) => ({
        role: t.role,
        text: t.role === 'user' ? t.display : t.content,
      })),
      updatedAt: Date.now(),
    },
  });
}
```

In `send()`, mirror in BOTH assistant-reply paths:

Cache-hit path (currently `setTurns([...nextTurns, { role: 'assistant', content: cached, display: cached }]); return;`) becomes:

```ts
      if (cached) {
        const finalTurns: Turn[] = [...nextTurns, { role: 'assistant', content: cached, display: cached }];
        setTurns(finalTurns);
        await mirrorConversation(finalTurns);
        return;
      }
```

API-reply path (currently `setTurns([...nextTurns, { role: 'assistant', content: reply, display: reply }]);`) becomes:

```ts
      const finalTurns: Turn[] = [...nextTurns, { role: 'assistant', content: reply, display: reply }];
      setTurns(finalTurns);
      await mirrorConversation(finalTurns);
```

- [ ] **Step 3: Finalize triggers**

Replace the problem-switch effect (lines 31-35) with:

```ts
  // Switching problems → distill any finished conversation, then reset the chat
  useEffect(() => {
    finalizePending({ writeNoteFn: writeNote }).catch(() => {});
    setTurns([]);
    setHintLevel(0);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
```

(This uses `finalizePending` directly, not `finalizeNotes`, because the effect runs before `store` is loaded on first mount and `finalizeNotes` is declared after the early return. The saved-status toast is a nice-to-have only for the clear-button path.)

Update the Clear-chat button (line 307-311) to finalize first:

```tsx
      {turns.length > 0 && (
        <button
          className="ghost small clear-btn"
          disabled={busy}
          onClick={() => {
            finalizeNotes();
            setTurns([]);
            setHintLevel(0);
            setError('');
          }}
        >
          Clear chat
        </button>
      )}
```

- [ ] **Step 4: Show the status line**

In the JSX, right below the `{error && ...}` line inside `chat-log`, add:

```tsx
        {notesStatus && <div className="muted">{notesStatus}</div>}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. (React wiring is exercised manually in Task 7.)

- [ ] **Step 6: Commit**

```bash
git add entrypoints/sidepanel/tabs/AITab.tsx
git commit -m "feat(notes): mirror tutor conversations and finalize on clear/problem-switch"
```

---

### Task 6: Notes tab + App wiring

**Files:**
- Create: `entrypoints/sidepanel/tabs/NotesTab.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`

- [ ] **Step 1: Create the Notes tab**

Create `entrypoints/sidepanel/tabs/NotesTab.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { updateStore } from '@/lib/storage';
import { buildNoteFile, finalizePending, noteFileName, syncNotes, MIN_TURNS } from '@/lib/notes';
import {
  connectVault,
  disconnectVault,
  requestVaultPermission,
  vaultStatus,
  writeNote,
  type VaultStatus,
} from '@/lib/vault';
import type { StudyNotesEntry } from '@/lib/types';
import { useStore } from '../useStore';
import Markdown from '../Markdown';

function download(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function NotesTab() {
  const store = useStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [vault, setVault] = useState<VaultStatus>('disconnected');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    vaultStatus().then(setVault);
  }, []);

  if (!store) return null;

  const entries = Object.entries(store.studyNotes).sort(
    ([, a], [, b]) =>
      (b.sessions[b.sessions.length - 1]?.createdAt ?? 0) -
      (a.sessions[a.sessions.length - 1]?.createdAt ?? 0),
  );
  const unsynced = entries.reduce(
    (n, [, e]) => n + e.sessions.filter((s) => !s.synced).length,
    0,
  );
  const waiting =
    store.pendingConversation && store.pendingConversation.turns.length >= MIN_TURNS;

  async function onConnect() {
    if (await connectVault()) setVault(await vaultStatus());
  }

  async function onDisconnect() {
    await disconnectVault();
    setVault('disconnected');
  }

  async function onSync() {
    setBusy(true);
    try {
      if ((await vaultStatus()) === 'needs-permission') await requestVaultPermission();
      await syncNotes({ writeNoteFn: writeNote });
      setVault(await vaultStatus());
    } finally {
      setBusy(false);
    }
  }

  async function onGenerateNow() {
    setBusy(true);
    try {
      await finalizePending({ writeNoteFn: writeNote });
    } finally {
      setBusy(false);
    }
  }

  async function remove(slug: string) {
    if (!confirm('Delete the notes for this problem from the extension? (Vault files are not touched.)')) return;
    await updateStore((s) => {
      const next = { ...s.studyNotes };
      delete next[slug];
      return { studyNotes: next };
    });
  }

  function entryFile(slug: string, entry: StudyNotesEntry) {
    return { name: noteFileName({ slug, ...entry }), text: buildNoteFile(slug, entry) };
  }

  return (
    <div className="notes">
      {waiting && (
        <div className="card">
          1 conversation is waiting to be distilled into notes.
          <button className="ghost small" disabled={busy} onClick={onGenerateNow}>
            Generate now
          </button>
        </div>
      )}

      {entries.length === 0 && !waiting && (
        <p className="muted">
          No study notes yet. Chat with the AI tutor about a problem — notes are generated
          automatically when the conversation ends.
        </p>
      )}

      {entries.map(([slug, entry]) => (
        <div className="card" key={slug}>
          <div className="btn-row">
            <button className="ghost" onClick={() => setExpanded(expanded === slug ? null : slug)}>
              {entry.frontendId ? `${entry.frontendId}. ` : ''}{entry.title}
              <span className="muted"> · {entry.sessions.length} session{entry.sessions.length > 1 ? 's' : ''}
                {entry.sessions.some((s) => !s.synced) ? ' · unsynced' : ''}</span>
            </button>
            <button className="ghost small" onClick={() => { const f = entryFile(slug, entry); download(f.name, f.text); }}>
              Download .md
            </button>
            <button className="ghost small" onClick={() => remove(slug)}>Delete</button>
          </div>
          {expanded === slug && <Markdown text={buildNoteFile(slug, entry)} />}
        </div>
      ))}

      {entries.length > 0 && (
        <button
          className="ghost small"
          onClick={() =>
            download(
              `litcode-notes-${new Date().toISOString().slice(0, 10)}.md`,
              entries.map(([slug, e]) => buildNoteFile(slug, e)).join('\n---\n\n'),
            )
          }
        >
          Download all notes
        </button>
      )}

      <details className="settings">
        <summary>📁 Obsidian vault folder {vault === 'granted' ? '· connected' : ''}</summary>
        <p className="muted">
          Pick a folder inside your vault (e.g. <code>Vault/LeetCode/</code>). New notes are
          written there automatically as <code>&lt;id&gt;-&lt;slug&gt;.md</code>.
          {vault === 'needs-permission' && ' Chrome needs a click to re-grant access after a restart.'}
        </p>
        <div className="btn-row">
          {vault === 'disconnected' && <button className="primary small" onClick={onConnect}>Connect folder</button>}
          {vault === 'needs-permission' && <button className="primary small" disabled={busy} onClick={onSync}>Re-grant access</button>}
          {vault !== 'disconnected' && <button className="ghost small" onClick={onDisconnect}>Disconnect</button>}
          {unsynced > 0 && vault !== 'disconnected' && (
            <button className="ghost small" disabled={busy} onClick={onSync}>
              Sync {unsynced} note{unsynced > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab and the mount-time leftover check into App**

In `entrypoints/sidepanel/App.tsx`:

Add imports:

```ts
import NotesTab from './tabs/NotesTab';
import { finalizePending } from '@/lib/notes';
import { writeNote } from '@/lib/vault';
```

Extend `TABS`:

```ts
const TABS = [
  { id: 'videos', label: '📺 Videos' },
  { id: 'review', label: '📕 Review' },
  { id: 'solutions', label: '💾 My Solutions' },
  { id: 'ai', label: '🤖 AI' },
  { id: 'notes', label: '📝 Notes' },
] as const;
```

Add a mount effect (below the existing `pendingAiAction` effect):

```ts
  // A conversation left over from a previous sidepanel session → distill it now
  useEffect(() => {
    finalizePending({ writeNoteFn: writeNote }).catch(() => {});
  }, []);
```

Add the tab render in `<main>`:

```tsx
        {tab === 'notes' && <NotesTab />}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean; full suite passes (33 pre-existing + the 15 notes tests from Tasks 2-3 = 48).

- [ ] **Step 4: Commit**

```bash
git add entrypoints/sidepanel/tabs/NotesTab.tsx entrypoints/sidepanel/App.tsx
git commit -m "feat(notes): Notes tab with vault connect/sync and markdown downloads"
```

---

### Task 7: Full verification + extension rebuild + manual smoke test

**Files:**
- Modify: `extension/` (via `npm run pack`)
- Possibly modify: `README.md`, `README.zh-CN.md`

- [ ] **Step 1: Full suite**

```bash
npm test && npm run lint && npx tsc --noEmit && npm run build
```
Expected: all pass.

- [ ] **Step 2: Rebuild committed extension**

```bash
npm run pack
git status --short extension/ | head
```
Expected: sidepanel chunk changes (new tab + notes/vault modules).

- [ ] **Step 3: README check**

Run: `grep -n -i 'tutor\|tabs\|features' README.md README.zh-CN.md | head`
If the READMEs list the extension's features/tabs, add a bullet for automatic study notes (AI-distilled per-problem markdown, Obsidian folder sync, Notes tab). Mirror in Chinese. Skip if no feature list exists.

- [ ] **Step 4: Manual smoke test (report what you can verify without a browser)**

Verify the bundle embeds the feature:

```bash
grep -c 'Study notes\|studyNotes' extension/chunks/*.js extension/sidepanel.html 2>/dev/null | grep -v ':0' | head
```
Expected: at least one chunk contains the strings.

Real browser verification (for the human): load `extension/` unpacked → open a LeetCode problem → ask the tutor 2+ questions → click Clear chat → Notes tab shows the problem with 1 session; connect a folder and confirm `<id>-<slug>.md` appears; restart Chrome and confirm the re-grant + Sync flow.

- [ ] **Step 5: Commit**

```bash
git add extension README.md README.zh-CN.md
git commit -m "chore: rebuild extension with study-notes feature; docs"
```
(Only add READMEs if changed.)
