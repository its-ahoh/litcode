# Design Change Addendum: Remove Interview Mode, Add AI Code Explanation

Date: 2026-07-04
Status: Confirmed (user decision, supersedes the "Interview Mode" section and the "no AI" constraint from the original spec)

## Changes

**Removed (entirely)**: Interview mode as a whole — the timer UI, the distraction-hiding CSS (`applyInterviewCss`/`INTERVIEW_CSS`), the target-time settings (`targetMinutes`), and the "auto-add to mistake book on severe AC timeout" rule. `session` tracking and `attempts.durationMs` are retained (as historical statistics). The mistake book's auto-add rule is now limited to the single "WA/TLE ≥ 2 times" rule.

**Added**: AI code explanation (side panel's fourth tab, 🤖 AI, replacing ⏱ Interview):

- Select code in the LeetCode editor → "Explain selection" explains the selected snippet in the context of the full code; "Explain whole code" explains the entire code. Response language: English
- Dual-backend BYOK: `provider: 'anthropic' | 'openai'`, with `apiKey`, `baseUrl` (overridable, supports compatible proxies), and `model` (overridable) all stored in `settings.ai` (chrome.storage.local)
- Anthropic goes through the official `@anthropic-ai/sdk` (`dangerouslyAllowBrowser`, default model `claude-opus-4-8`, adaptive thinking); OpenAI-compatible endpoints go through `fetch` to `{baseUrl}/chat/completions` (default `gpt-5` as a placeholder, user-configurable)
- Calls are made from the side panel page; the manifest declares `host_permissions` (api.anthropic.com / api.openai.com) to bypass CORS; a custom baseUrl relies on the counterpart's CORS support
- Selection capture: the MAIN world bridge's `CODE_VALUE` message gains a new `selection` field (active editor's `getSelection` → `getValueInRange`; an empty selection yields an empty string)
- The original "data export/import" section is moved from the interview mode tab to the bottom of the AI tab

## Data Model Changes

```ts
Settings = { ai: { provider, apiKey, baseUrl, model } }  // interviewMode/targetMinutes removed
```

No migration needed for existing stored data: `getStore`'s default-value merge automatically fills in the `ai` field, and leftover old keys are harmless.
