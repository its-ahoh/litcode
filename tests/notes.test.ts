import { beforeEach, expect, test } from 'vitest';
import {
  MIN_TURNS,
  buildHeaderBlock,
  buildSessionBlock,
  noteFileName,
  buildNotesRequest,
  buildNoteFile,
  finalizePending,
  syncNotes,
} from '../lib/notes';
import { getStore, patchStore } from '../lib/storage';
import { installFakeChrome } from './fake-chrome';
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
  const block = buildSessionBlock('### What I asked\n- hint', new Date(2026, 6, 8, 12));
  expect(block).toBe('## Session 2026-07-08\n\n### What I asked\n- hint\n');
});

test('buildSessionBlock trims trailing whitespace from the body', () => {
  const block = buildSessionBlock('body\n\n', new Date(2026, 6, 8));
  expect(block.endsWith('body\n')).toBe(true);
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
      { markdown: '### Key insights\n- a', createdAt: new Date(2026, 6, 1).getTime(), turnCount: 2, synced: true },
      { markdown: '### Key insights\n- b', createdAt: new Date(2026, 6, 8).getTime(), turnCount: 4, synced: false },
    ],
  };
  const file = buildNoteFile('sliding-window-maximum', entry);
  expect(file).toContain('# 239. Sliding Window Maximum (Hard)');
  expect(file).toContain('## Session 2026-07-01');
  expect(file).toContain('## Session 2026-07-08');
  expect(file.indexOf('- a')).toBeLessThan(file.indexOf('- b'));
});

beforeEach(() => {
  installFakeChrome();
});

const aiSettings = { provider: 'anthropic' as const, apiKey: 'sk-test', baseUrl: '', model: '' };

async function seedPending(turns = pending.turns) {
  await patchStore({
    settings: { ai: aiSettings, theme: 'system', responseLanguage: 'auto', videoLanguage: 'all' },
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

test('finalizePending: concurrent calls run the LLM once', async () => {
  await seedPending();
  let calls = 0;
  const deps = { chatFn: async () => { calls++; return 'notes'; }, writeNoteFn: async () => true };
  const [r1, r2] = await Promise.all([finalizePending(deps), finalizePending(deps)]);
  expect(calls).toBe(1);
  expect([r1, r2].sort()).toEqual(['finalized', 'none']);
  const s = await getStore();
  expect(s.studyNotes['sliding-window-maximum'].sessions).toHaveLength(1);
});

test('finalizePending: writeNoteFn throwing stores the note unsynced, still finalized', async () => {
  await seedPending();
  const result = await finalizePending({
    chatFn: async () => 'notes',
    writeNoteFn: async () => { throw new Error('vault offline'); },
  });
  expect(result).toBe('finalized');
  const s = await getStore();
  expect(s.pendingConversation).toBeNull();
  expect(s.studyNotes['sliding-window-maximum'].sessions[0].synced).toBe(false);
});

test('finalizePending: does not clear a pending replaced mid-flight', async () => {
  await seedPending();
  const replacement: PendingConversation = {
    slug: 'two-sum',
    title: 'Two Sum',
    frontendId: '1',
    difficulty: 'Easy',
    turns: [
      { role: 'user', text: 'hint' },
      { role: 'assistant', text: 'hash map' },
    ],
    updatedAt: 999,
  };
  const result = await finalizePending({
    chatFn: async () => {
      // A new conversation gets mirrored while the LLM call is in flight
      await patchStore({ pendingConversation: replacement });
      return 'notes for A';
    },
    writeNoteFn: async () => true,
  });
  expect(result).toBe('finalized');
  const s = await getStore();
  expect(s.pendingConversation).toEqual(replacement);
  expect(s.studyNotes['sliding-window-maximum'].sessions[0].markdown).toBe('notes for A');
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
