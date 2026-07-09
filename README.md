# LitCode

[![CI](https://github.com/its-ahoh/litcode/actions/workflows/ci.yml/badge.svg)](https://github.com/its-ahoh/litcode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

*[English](README.md) · [简体中文](README.zh-CN.md)*

LitCode is a local-first LeetCode enhancement Chrome extension (Manifest V3). It has no self-hosted backend — all data (including your AI API key) lives in the browser's local storage. The extension makes a minimal injection into leetcode.com pages and puts the main interactions in the Chrome Side Panel, offering local code completion, curated solution videos, a review queue with spaced repetition, multi-version solution snapshots, and AI code explanations. The only network requests are optional: opening YouTube videos, and AI explanations you trigger yourself (sent directly to the API you configure — bring your own key).

## Features

- **Local code completion** — static dictionary completion for Python / Java / JavaScript in the Monaco editor (letter-prefix trigger and `.` member trigger).
- **Curated solution videos** — detects the current problem and shows matching videos in the side panel. For problems without a curated entry it searches videos via DuckDuckGo and plays them inline; a dropdown lets you fall back to YouTube or Google Videos, with a retry button if search fails.
- **Review queue + spaced repetition (SRS)** — automatically records submission results; repeated failures enroll a problem into the review queue, which advances through 3/7/14-day stages on success. A toolbar badge shows how many items are due today or overdue.
- **Solution snapshots** — up to 3 slots per problem: save, overwrite, restore to editor, copy, and delete.
- **AI tutor (chat)** — a chat interface with three shortcuts: leveled hints (1→4, no spoilers until you ask), explain the code you've selected in the editor, and get a full solution walkthrough. Right-click inside the editor for the same shortcuts. Supports Anthropic (Claude) and OpenAI-compatible backends, bring-your-own-key, with an optional base URL override for compatible proxies. Answers are in English.
- **Study notes** — each AI-tutor conversation is automatically distilled into per-problem markdown notes, viewable in the Notes tab; optionally auto-write them into an Obsidian vault folder.
- **Data export / import** — export all local data to a JSON backup, or import a JSON file to restore (overwrites current data, with a confirmation prompt).

## Build

```bash
npm install
npm run build   # production build; output in .output/chrome-mv3
npm run test    # run Vitest unit tests
```

Other useful commands:

```bash
npm run dev      # WXT dev mode (regenerates .output for load-and-debug)
npx tsc --noEmit # type-check only, no emit
```

## Quick install (no build)

A prebuilt copy is committed under [`extension/`](extension/), so you can load it directly:

1. Download or clone this repo.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on "Developer mode" (top right).
4. Click "Load unpacked" and select the `extension/` directory.
5. Open any leetcode.com problem page and launch the LitCode side panel from the toolbar icon.

## Build from source

If you'd rather build it yourself:

1. Run `npm install` then `npm run build` (output in `.output/chrome-mv3`), or `npm run pack` to also refresh `extension/`.
2. Load the built directory via `chrome://extensions` → Developer mode → "Load unpacked".

## Known limitations

1. Review due dates (`dueDate`) are computed on the UTC calendar, so users in negative time zones (e.g. the Americas) may see a one-day discrepancy around local midnight.
2. AI explanations support api.anthropic.com and api.openai.com by default (declared in `host_permissions` to bypass CORS); a custom base URL proxy must allow cross-origin requests itself. The API key is stored in plaintext in chrome.storage.local and sent only to the API host you configure — don't use it on a shared computer.
3. The curated video map (`assets/videos.ts`) is currently a starter dataset covering 5 problems from Blind 75; problems outside it fall back to live DuckDuckGo video search.
4. Code completion is driven by a static dictionary — it does no real type inference or context analysis, only string-matched suggestions of language keywords/members.
