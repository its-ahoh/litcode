export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type SubmissionResult = 'AC' | 'WA' | 'TLE' | 'OTHER';

export interface ProblemMeta {
  slug: string;
  frontendId: string; // problem number, e.g. "1"
  title: string;      // e.g. "Two Sum"
  difficulty: Difficulty | null;
}

export interface Attempt {
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  result: SubmissionResult;
  timestamp: number;
  durationMs: number | null; // time from opening the problem to submission
}

export interface ReviewItem {
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  stage: 0 | 1 | 2;   // corresponds to the 3/7/14-day tier
  dueDate: string;    // ISO date "2026-07-06"
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
  baseUrl: string; // empty string = each provider's default endpoint; can be set to a compatible proxy URL
  model: string;   // empty string = provider's default model
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

// AI actions triggered from the editor's right-click menu
export type AiAction = 'hint' | 'explain-selection' | 'explain-solution';

// ---- Message protocol ----
// window.postMessage (MAIN <-> isolated), always carries source: 'litcode'
export type PageMessage =
  | { source: 'litcode'; type: 'SUBMISSION_RESULT'; statusMsg: string; submissionId: string }
  | { source: 'litcode'; type: 'GET_CODE'; requestId: string }
  | { source: 'litcode'; type: 'CODE_VALUE'; requestId: string; code: string; language: string; selection: string }
  | { source: 'litcode'; type: 'SET_CODE'; code: string }
  | { source: 'litcode'; type: 'AI_ACTION'; action: AiAction; selection: string };

// chrome.runtime (side panel <-> content script)
export type RuntimeMessage =
  | { type: 'GET_PROBLEM' }                       // → ProblemMeta | null
  | { type: 'GET_EDITOR_CODE' }                   // → { code: string; language: string; selection: string } | null
  | { type: 'GET_PROBLEM_TEXT' }                  // → string | null (plain-text problem description, for AI prompts)
  | { type: 'RESTORE_CODE'; code: string }        // → { ok: boolean }
  | { type: 'AI_ACTION'; action: AiAction; selection: string }; // content script → background
