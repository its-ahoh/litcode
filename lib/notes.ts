import { chat, type ChatMsg } from './ai';
import { getStore, updateStore } from './storage';
import type { AiSettings, PendingConversation, StudyNote, StudyNotesEntry } from './types';
import type { ResponseLanguage } from './languages';

/** Minimum turns (one user + one assistant) for a conversation to be worth distilling */
export const MIN_TURNS = 2;

export const NOTES_SYSTEM_PROMPT =
  'You distill a LeetCode tutoring conversation into concise study notes the learner will review later. ' +
  'Output ONLY markdown with exactly five level-3 sections corresponding to these topics, in this order: ' +
  '"### What I asked", "### Key insights", "### Techniques & patterns", "### Pitfalls", "### Complexity". ' +
  'Use short, specific bullet points grounded in this conversation; keep code identifiers as-is. ' +
  'If a section has nothing, write "- (none)". Do not add any H1/H2 headings, preamble, or closing remarks.';

/** Apply the AI response-language preference to distilled study notes too. */
export function notesSystemPrompt(responseLanguage: ResponseLanguage): string {
  const languageInstruction =
    responseLanguage === 'auto'
      ? "Write the notes in the learner's predominant language from the conversation."
      : `Write all note content, including section headings, in ${responseLanguage}. ` +
        'Translate the five headings naturally while preserving their structure and order.';
  return `${NOTES_SYSTEM_PROMPT} ${languageInstruction}`;
}

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
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
// The guarantee is per-JS-context (two sidepanel windows = two contexts; acceptable, rare).
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
    await updateStore((s) => ({ pendingConversation: clearIfSame(s.pendingConversation, pending) }));
    return 'discarded';
  }

  let markdown: string;
  try {
    markdown = await chatFn(
      store.settings.ai,
      buildNotesRequest(pending),
      notesSystemPrompt(store.settings.responseLanguage),
    );
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
      pendingConversation: clearIfSame(s.pendingConversation, pending),
      studyNotes: { ...s.studyNotes, [pending.slug]: entry },
    };
  });
  return 'finalized';
}

// chatFn can take seconds; a NEW conversation may be mirrored into
// pendingConversation meanwhile. Only clear the one we snapshotted.
function clearIfSame(
  stored: PendingConversation | null,
  snapshot: PendingConversation,
): PendingConversation | null {
  return stored?.slug === snapshot.slug && stored.updatedAt === snapshot.updatedAt ? null : stored;
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
