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
