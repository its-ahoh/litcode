# Study Notes from AI Tutor Conversations — Design

**Date:** 2026-07-08
**Status:** Approved

## Problem

Conversations with the AI tutor contain hard-won knowledge — hints understood,
patterns learned, pitfalls hit — but the chat lives in ephemeral React state in
`AITab.tsx` and vanishes on tab switch, problem switch, or panel close. There
is no way to review what was learned.

## Goal

Automatically distill each finished tutor conversation into per-problem
markdown study notes ("what I asked, key insights, techniques, pitfalls,
complexity") that the user can review later — inside the extension and as
`.md` files written into their Obsidian vault.

## Decisions (from brainstorming)

1. **Fully automatic** — no manual "save notes" step; conversations finalize
   into notes on their own.
2. **AI-distilled** — one extra LLM call summarizes the conversation into
   structured notes (not a raw transcript).
3. **Obsidian folder + fallback** — notes auto-write into a user-picked vault
   folder via the File System Access API; they are also stored per-problem in
   the extension (browsable, part of JSON backup) with manual download as
   fallback.
4. **Append sessions** — revisiting a problem appends a new dated
   `## Session` block; earlier notes are never lost.

## Architecture: persist conversation + lazy finalize

The chat state is mirrored into the store as it happens; finalization is
triggered lazily by events that prove the conversation is over. This is the
only design that never loses a conversation without background-worker
plumbing.

### Data model (`lib/types.ts`, slug-keyed like attempts/solutions)

```ts
interface PendingConversation {
  slug: string;
  title: string;
  frontendId: string;
  difficulty: string;
  turns: { role: 'user' | 'assistant'; text: string }[];
  updatedAt: number;
}

interface StudyNote {
  markdown: string;   // one session body (H3 sections, no H1/H2)
  createdAt: number;
  turnCount: number;
  synced: boolean;    // written to the vault folder?
}

// StoreShape additions
pendingConversation: PendingConversation | null;
studyNotes: Record<string, StudyNote[]>;  // slug → sessions, oldest first
```

`DEFAULTS` in `lib/storage.ts` gains both fields. Existing stores migrate
implicitly via the `{ ...DEFAULTS, ...stored }` merge.

### Lifecycle

1. **Mirroring.** After each completed turn pair, `AITab` writes the
   conversation into `pendingConversation` via `updateStore`. User turns store
   the `display` string (the friendly bubble text); assistant turns store
   `content`. The noisy injected prompt context (problem statement, editor
   code) never reaches the notes pipeline.
2. **Finalize triggers** (any of):
   - Clear-chat button pressed;
   - first turn of a conversation on a **different** slug;
   - sidepanel mount finds a leftover `pendingConversation` from a previous
     session (covers browser/panel close mid-conversation).
3. **Minimum 2 turns** (one user + one assistant); shorter pendings are
   discarded, not summarized.
4. **Finalize** = one `chat()` call with a dedicated `NOTES_SYSTEM_PROMPT` →
   session markdown → append to `studyNotes[slug]` → attempt vault write
   (sets `synced`) → clear `pendingConversation`.
5. **Failure keeps the pending conversation** (API error, missing key) so the
   next trigger retries. Vault-write failure does NOT block: the note is
   stored with `synced: false`.

### Alternatives considered

- **Best-effort hooks without persistence** — loses conversations on tab
  switch/panel close; contradicts "fully automatic". Rejected.
- **Background service-worker pipeline** — robust but adds messaging plumbing
  and moves BYOK calls to another context for marginal gain. Rejected.

## LLM call

`lib/ai.ts` `chat()` gains an optional `system` parameter (both provider
paths); default remains `TUTOR_SYSTEM_PROMPT`, so existing callers are
unchanged. `NOTES_SYSTEM_PROMPT` instructs the model to emit ONLY a session
body in markdown with exactly these H3 sections, concise and specific to the
conversation:

```
### What I asked
### Key insights
### Techniques & patterns
### Pitfalls
### Complexity
```

## Obsidian vault integration (`lib/vault.ts`)

Thin wrapper over the File System Access API:

- `connectVault()` — from a user-gesture button: `showDirectoryPicker()`,
  persist the `FileSystemDirectoryHandle` in IndexedDB (handles cannot live in
  `chrome.storage`).
- `vaultStatus()` — `disconnected | granted | needs-permission` (via
  `queryPermission`).
- `writeNote(fileName, headerBlock, sessionMarkdown)` — **append semantics**:
  if the file exists, read it and append the session block; otherwise create
  it with the header block first. Appending preserves user edits made in
  Obsidian.
- `disconnectVault()` — drop the handle.

After a browser restart Chrome demotes the permission; writes are skipped and
notes accumulate with `synced: false`. A "Sync N notes" button (user gesture →
`requestPermission()`) writes all unsynced sessions in order.

### File naming & format

`<frontendId>-<slug>.md` (e.g. `239-sliding-window-maximum.md`) in the picked
folder (user points it at e.g. `Vault/LeetCode/`).

```markdown
# 239. Sliding Window Maximum (Hard)
#leetcode #hard
https://leetcode.com/problems/sliding-window-maximum/

## Session 2026-07-08
### What I asked
...
```

Header block written once at file creation; each session appends one
`## Session <YYYY-MM-DD>` block containing the LLM's H3 body.

## Pure logic module (`lib/notes.ts`)

Testable functions, side-effect free (finalization orchestration takes an
injected `chat`-like function):

- `shouldFinalize(pending, currentSlug): boolean` — min-turns, slug-change,
  staleness rules.
- `transcriptOf(pending): ChatMsg[]` — turns → messages for the LLM call.
- `buildHeaderBlock(meta): string` — H1 + tags + URL.
- `buildSessionBlock(note, date): string` — `## Session` wrapper.
- `noteFileName(meta): string`.
- `finalizePending(store, chatFn): Promise<...>` — orchestration used by the
  UI layer.

## UI

- **New 5th sidepanel tab: 📝 Notes** (`entrypoints/sidepanel/tabs/NotesTab.tsx`):
  - list of problems with notes (title, session count, synced status);
  - click to expand, rendered with the existing `Markdown.tsx`;
  - per-problem **Download .md** (existing Blob-anchor pattern from
    `exportData()`), **Download all** (one combined markdown);
  - vault section: Connect/Disconnect, folder status, **Sync N notes** button;
  - "1 conversation waiting" indicator when a pending conversation could not
    finalize (e.g. missing API key).
- **AITab**: transient "📝 Study notes saved" status line when finalization
  happens in view; no new buttons. AITab also invokes the finalize check on
  mount and on first-turn-of-new-slug; App-level mount runs the leftover
  check.

## Error handling summary

| Failure | Behavior |
|---|---|
| LLM call fails / no API key | pending kept; retried on next trigger; Notes tab shows waiting indicator |
| Vault not connected / permission demoted | note stored `synced:false`; Sync button re-grants + writes |
| Vault write throws (disk, file lock) | same as above |
| < 2 turns | pending silently discarded |
| Store import/backup | `studyNotes` included automatically; vault handle must be reconnected (one click) |

## Testing (vitest, `tests/notes.test.ts`)

- `shouldFinalize`: turn thresholds, same-slug vs new-slug, null pending.
- `buildHeaderBlock` / `buildSessionBlock` / `noteFileName`: exact output.
- `transcriptOf`: role mapping, display-vs-content selection handled upstream
  (mirroring writes `text` already cleaned).
- `finalizePending` with a fake chat fn: success appends + clears pending;
  failure keeps pending; short conversations discard.
- `vault.ts` excluded from unit tests (browser-only FSA); manual verification.

## Out of scope

- Editing notes inside the extension (edit in Obsidian instead).
- Regenerating/merging notes with the LLM.
- Auto-download of .md files (vault write + manual download cover it).
- Syncing deletions (deleting a note in the extension does not delete the
  vault file).
- Tagging/linking schemes beyond the fixed `#leetcode #<difficulty>` tags.
