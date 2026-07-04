export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SubmissionResult = 'AC' | 'WA' | 'TLE' | 'OTHER';

export interface ProblemMeta {
  slug: string;
  frontendId: string; // 题号，如 "1"
  title: string;      // 如 "Two Sum"
  difficulty: Difficulty | null;
}

export interface Attempt {
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  result: SubmissionResult;
  timestamp: number;
  durationMs: number | null; // 进入题目到提交的用时
}

export interface ReviewItem {
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  stage: 0 | 1 | 2;   // 对应 3/7/14 天档
  dueDate: string;    // ISO 日期 "2026-07-06"
  addedAt: string;
}

export interface SolutionVersion {
  label: string;
  language: string;
  code: string;
  savedAt: number;
}

export interface Settings {
  interviewMode: boolean;
  targetMinutes: { easy: number; medium: number; hard: number };
}

export const DEFAULT_SETTINGS: Settings = {
  interviewMode: false,
  targetMinutes: { easy: 15, medium: 25, hard: 40 },
};

export interface StoreShape {
  settings: Settings;
  attempts: Record<string, Attempt[]>;
  reviewQueue: Record<string, ReviewItem>;
  solutions: Record<string, SolutionVersion[]>;
  session: { slug: string; enteredAt: number } | null;
}

// ---- 消息协议 ----
// window.postMessage（MAIN ⇄ isolated），一律带 source: 'litcode'
export type PageMessage =
  | { source: 'litcode'; type: 'SUBMISSION_RESULT'; statusMsg: string; submissionId: string }
  | { source: 'litcode'; type: 'GET_CODE'; requestId: string }
  | { source: 'litcode'; type: 'CODE_VALUE'; requestId: string; code: string; language: string }
  | { source: 'litcode'; type: 'SET_CODE'; code: string };

// chrome.runtime（side panel ⇄ content script）
export type RuntimeMessage =
  | { type: 'GET_PROBLEM' }                       // → ProblemMeta | null
  | { type: 'GET_EDITOR_CODE' }                   // → { code: string; language: string } | null
  | { type: 'RESTORE_CODE'; code: string };       // → { ok: boolean }
