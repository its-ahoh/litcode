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
