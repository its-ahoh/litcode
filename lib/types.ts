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

export type AiProvider = 'anthropic' | 'openai';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string; // 空串 = 各 provider 默认地址；可填兼容代理地址
  model: string;   // 空串 = provider 默认模型
}

export interface Settings {
  ai: AiSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  ai: { provider: 'anthropic', apiKey: '', baseUrl: '', model: '' },
};

export interface StoreShape {
  settings: Settings;
  attempts: Record<string, Attempt[]>;
  reviewQueue: Record<string, ReviewItem>;
  solutions: Record<string, SolutionVersion[]>;
  session: { slug: string; enteredAt: number } | null;
}

// 编辑器右键菜单触发的 AI 动作
export type AiAction = 'hint' | 'explain-selection' | 'explain-solution';

// ---- 消息协议 ----
// window.postMessage（MAIN ⇄ isolated），一律带 source: 'litcode'
export type PageMessage =
  | { source: 'litcode'; type: 'SUBMISSION_RESULT'; statusMsg: string; submissionId: string }
  | { source: 'litcode'; type: 'GET_CODE'; requestId: string }
  | { source: 'litcode'; type: 'CODE_VALUE'; requestId: string; code: string; language: string; selection: string }
  | { source: 'litcode'; type: 'SET_CODE'; code: string }
  | { source: 'litcode'; type: 'AI_ACTION'; action: AiAction; selection: string };

// chrome.runtime（side panel ⇄ content script）
export type RuntimeMessage =
  | { type: 'GET_PROBLEM' }                       // → ProblemMeta | null
  | { type: 'GET_EDITOR_CODE' }                   // → { code: string; language: string; selection: string } | null
  | { type: 'GET_PROBLEM_TEXT' }                  // → string | null（题目描述纯文本，供 AI 提示用）
  | { type: 'RESTORE_CODE'; code: string }        // → { ok: boolean }
  | { type: 'AI_ACTION'; action: AiAction; selection: string }; // content script → background
