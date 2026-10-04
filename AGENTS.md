# 🧈 AGENTS.md — Beurre Architecture & Knowledge Base for AI Models

> **Notice for all AI models, LLM agents, and subagents:**
> This file is the primary repository knowledge base and living changelog for **Beurre** (`🧈`).
> **Mandatory Rule:** Whenever you make code modifications, bug fixes, feature implementations, or architectural refactorings in this project, you **MUST** append an entry to the [Changelog & Code Modifications](#-changelog--code-modifications) section below. Future models and subagents rely on this log to understand codebase state and evolution.

---

## 📌 1. Project Overview & Aesthetic Philosophy

**Beurre** (*butter* in French, `🧈`) is an ultra-fast, buttery-smooth, minimalist agentic AI coding harness running natively on Bun / TypeScript. It is inspired by the minimalist philosophy of `pi` and the interactive developer ergonomics of Claude Code.

### Core Tenets:
1. **Butter Yellow Palette (TrueColor / ANSI):**
   - Vibrant Gold (`#FACC15` / `\x1b[38;2;250;204;21m`)
   - Soft Cream (`#FEF9C3` / `\x1b[38;2;254;249;195m`)
   - Melted Amber (`#F59E0B` / `\x1b[38;2;245;158;11m`)
   - Toasted Crust (`#D97706` / `\x1b[38;2;217;119;6m`)
   - Muted border tones (`#57534E`)
2. **Interactive Steering & Pinned Bottom Prompt Bar:**
   - The Claude Code / OMP-style prompt bar is anchored at the bottom of the viewport at all times:
     - **During User Input (`BeurreEditor.readPrompt`):** Shows prompt prefix (`> `), placeholder/typed text, divider rule, and footer status (`esc to cancel • tab complete • shift+tab effort   user · Model · effort · quota`).
     - **During Agent Working / Turn Execution (`BeurreWorkingBar`):**
       Status/tool/thinking lines appear **above** the chat bar:
       ```text
       ● Read(~/Projects/beurre/src/relay.ts) (ctrl+o to expand)
       ⣟ Thinking (~140 tokens • 2.1s): Initial hypothesis...
       ────────────────────────────────────────────────────────────────────────────────────────
       > [Interactive input prompt where the user can type steering messages while model works]
       ────────────────────────────────────────────────────────────────────────────────────────
       esc to cancel • enter to steer • shift+tab effort          admin · GLM 5.3 Flash · high · ∞
       ```
       - The chat bar remains fully interactive with `> ` input line while the model is thinking, generating, or running tools.
       - When prompt is empty: shows placeholder `Type a message to steer agent (Esc to cancel)...`.
       - Pressing `Enter` steers the agent (interrupts current generation or injects steering prompt into the turn loop).
       - `Shift+Tab` cycles reasoning effort in real-time.
       - `Esc` cancels / interrupts the turn immediately.
     - Content (user card, thinking process, agent responses, high-contrast tool calls, tool results) streams **above** the pinned bottom prompt bar with zero jumping or clobbering.
3. **Model Aggregator & Cloudflare Relay Gateway Integration:**
   - Live upstream endpoint: `https://relay-gw.pages.dev`
   - Real-time streaming inference with reasoning token parsing (`thinkMs`, `delta.reasoning`, `delta.content`).
   - Live model catalogue (`GET /v1/models`) cached with a 5-minute TTL.
   - Live provider health probing (`GET /v1/providers`).
   - Web search tool directly hooked into `POST /v1/web_search`.
4. **Supabase Cloud Session Store (`relay_chats`):**
   - Sessions are automatically synced and persisted across machines (`/sessions`, `/resume <id>`, `/sync`).
5. **Continuous Indefinite Prompt Repeating Loop (`--loop`, `/loop`):**
   - Repeats prompts indefinitely until interrupted (`Ctrl+C`).
   - **Butter Melt Context Compactor** automatically summarizes multi-turn history into compact structured context between loop iterations.
6. **Native Named Subagents:**
   - Personas with designated models: `Architect` (`kimi-k3:max`), `CodeCraft` (`glm-5-3-flash`), `Reviewer` (`gpt-6-astra:high`), `BugHunter` (`o3-mini`), `Scout` (`glm-5-3-flash`), `Visionary` (`gpt-4o`).

---

## 🏗️ 2. Architectural & Module Breakdown

The codebase is organized under `src/`:

| Module | Purpose & Key Components |
|---|---|
| [`src/index.ts`](file:///home/alex/Projects/beurre/src/index.ts) | CLI entrypoint. Parses flags (`--model`, `-m`, `--effort`, `-e`, `--prompt`, `-p`, `--loop`, `--models`, `--providers`, `--subagents`, `--whoami`, `--quota`), starts interactive REPL or runs headless tasks. |
| [`src/repl.ts`](file:///home/alex/Projects/beurre/src/repl.ts) | Interactive REPL session loop. Manages `editor.readPrompt`, slash command dispatcher (`/models`, `/subagents`, `/loop`, `/think`, `/compact`, `/sessions`, `/resume`, `/whoami`, `/quota`, `/login`, `/logout`, `/diff`, `/copy`, `/export`, etc.), turn execution, and orchestrates `BeurreWorkingBar`. |
| [`src/editor.ts`](file:///home/alex/Projects/beurre/src/editor.ts) | Terminal editor engine (`BeurreEditor`). Implements Claude Code / OMP prompt bar, 2D cursor coordinate math (`getBuffer2DCoords`), word navigation (`Alt+Left`/`Alt+Right`, `Ctrl+W`), predictive command autocompletion with scrollable floating popover, bracketed paste mode, and Shift+Tab effort cycling. |
| [`src/theme.ts`](file:///home/alex/Projects/beurre/src/theme.ts) | Butter aesthetic UI primitives: `colors`, `b` styled helpers, `statusBar`, `formatWorkingPromptBar`, `BeurreWorkingBar` (bottom-anchored execution prompt bar), `ButterSpinner`, `formatClaudeToolCall`, `formatClaudeToolResult`, `formatUserMessageCard`, `formatAgentHeader`, `renderErrorCard`, `renderToast`. |
| [`src/agent.ts`](file:///home/alex/Projects/beurre/src/agent.ts) | `BeurreAgent` core turn loop. Enforces autonomous direct action (mandatory filesystem writes via tools), image model / vision delegation, multi-turn tool loops (up to 25 turns), XML / Anthropic `<invoke>` / Markdown tool-call parsing, and change-tracking protocol. |
| [`src/relay.ts`](file:///home/alex/Projects/beurre/src/relay.ts) | `RelayClient`. Handles HTTP SSE streaming with Cloudflare Relay Gateway, credential extraction from `cookies.txt` or `models.yml`, model display name mapping (`getModelDisplayName`), and tool call extraction from proxies. |
| [`src/tools.ts`](file:///home/alex/Projects/beurre/src/tools.ts) | Butter Tool Suite: `read` (line numbers & offsets), `write` (file creation & overwrite), `edit` (surgical find/replace), `bash` (command execution with timeout), `web_search` (Relay search), `generate_image` (AI image generation), `subagent_run` (delegation to named subagents). |
| [`src/subagents.ts`](file:///home/alex/Projects/beurre/src/subagents.ts) | Named subagent definitions and isolated execution runner (`runNamedSubagent`). |
| [`src/loop.ts`](file:///home/alex/Projects/beurre/src/loop.ts) | `BeurreLoopRunner`. Orchestrates indefinite prompt loops, auto-compacts preceding turns with Butter Melt, and drives turns with `BeurreWorkingBar`. |
| [`src/compact.ts`](file:///home/alex/Projects/beurre/src/compact.ts) | `compactMessages` Butter Melt compactor. Summarizes history while retaining crucial file modification records and test results. |
| [`src/auth.ts`](file:///home/alex/Projects/beurre/src/auth.ts) | Authentication state, daily token quota tracking (50,000,000 tokens default, unlimited for admins), local credentials storage (`~/.omp/agent/auth.json`), Supabase session sync. |
| [`src/model-picker.ts`](file:///home/alex/Projects/beurre/src/model-picker.ts) | Interactive full-screen / in-terminal model browser with fuzzy filtering by model ID, provider, and display name. |
| [`src/menu.ts`](file:///home/alex/Projects/beurre/src/menu.ts) | Interactive command center dashboard (`/menu`) categorized into Session & Engine, Models & Subagents, and Account & Persistence. |
| [`src/predictive.ts`](file:///home/alex/Projects/beurre/src/predictive.ts) | Slash command index (`SLASH_COMMANDS`), predictive match engine (`getPredictiveMatches`), and cheatsheet hints formatter. |
| [`src/markdown.ts`](file:///home/alex/Projects/beurre/src/markdown.ts) | Markdown renderer, `highlightCodeBlock` with warm butter tones, `StreamingMarkdownHighlighter` for live token streaming, and `formatThinkingBlock` (expanded card vs collapsed one-liner). |
| [`src/diff.ts`](file:///home/alex/Projects/beurre/src/diff.ts) | Unified diff generator for `edit` and `write` tool calls. |
| [`src/config.ts`](file:///home/alex/Projects/beurre/src/config.ts) | Configuration loader (`~/.omp/agent/config.json`). |

---

## ☁️ 3. Relay Gateway & Supabase Cloud Sessions

### Relay Gateway Architecture (`src/relay.ts`)
- **Upstream Gateway:** `https://relay-gw.pages.dev`
- **Streaming Protocol:** Server-Sent Events (`POST /v1/chat/completions` with `stream: true`). Parses delta tokens, reasoning chunks (`delta.reasoning`, `thinkMs`), and Anthropic-style function call invocations.
- **Model Catalogue Probing:** `GET /v1/models` cached with a 5-minute TTL. Supports fuzzy search over 33+ upstream models across providers (OpenAI, Anthropic, DeepSeek, Google, Zhipu GLM, Moonshot Kimi, Qwen).
- **Web Search Engine:** Direct JSON API integration with `POST /v1/web_search` returning ranked citations.

### Supabase Cloud Session Store (`src/auth.ts`, `relay_chats`)
- **Cloud Chat Table:** Sessions are persisted to Supabase (`table: relay_chats`) under `user_id`.
- **Cross-Device Sync:**
  - Automatic background sync after turn execution via `saveCloudSession(...)`.
  - Slash commands `/sessions` (list sessions), `/resume <id>` (resume session history), and `/sync` (force-push current session).
- **Daily Token Quota:**
  - Default: `50,000,000` tokens per day (`DAILY_TOKEN_LIMIT`).
  - Admin accounts receive unlimited quotas with distinctive golden progress badges.

---

## ⌨️ 4. Keybindings & Interactive Editor Conventions

The custom terminal editor (`src/editor.ts`) provides high-fidelity Claude Code / OMP developer ergonomics:

| Keybinding | Scope | Functionality |
|---|---|---|
| `Enter` | Active Working Turn | Steers running agent with typed message, immediately interrupting current generation or injecting into turn loop. |
| `Enter` | Autocomplete open | Accepts selected slash command. |
| `Shift+Enter` / `Alt+Enter` / `Ctrl+J` | Editor | Inserts a newline, dynamically transitioning editor to multi-line box mode. |
| `Shift+Tab` | Editor / Working Turn | Cycles reasoning effort levels in real-time (`low` → `medium` → `high` → `xhigh` → `max`). |
| `Tab` | Command input | Autocompletes top matching predictive slash command. |
| `↑` / `↓` Arrows | Editor / History | Navigates command history (or lines in multi-line mode; scrolls autocomplete list if open). |
| `←` / `→` Arrows | Editor | Character-by-character navigation. (Right Arrow accepts ghost command autocomplete hint at line end). |
| `Alt+←` / `Alt+→` | Editor | Word-by-word cursor jump (`findWordBoundaryLeft`, `findWordBoundaryRight`). |
| `Ctrl+W` | Editor | Deletes preceding word. |
| `Esc` | Editor / Working Turn | Cancels active input or interrupts running turn execution (`AbortController.abort()`). |
| `Ctrl+C` | Global | Gracefully interrupts turn or terminates REPL / loop after state persistence. |
| Bracketed Paste | Editor | Handles multi-line clipboard pastes cleanly without premature submission. |

---

## 🧭 5. Slash Commands Directory

| Command | Arguments | Description |
|---|---|---|
| `/models` | `[filter]` | Opens interactive full-screen model picker (`src/model-picker.ts`) or filters models by provider/ID. |
| `/think` | `[expand\|collapse\|hide]` | Toggles thinking block display mode for reasoning models (e.g. Kimi k3, o3-mini, DeepSeek R1). |
| `/loop` | `[prompt]` | Enters indefinite autonomous loop mode, repeating prompt until interrupted with context compaction. |
| `/subagents` | `[name]` | Lists all 6 native named subagents (`Architect`, `CodeCraft`, `Reviewer`, `BugHunter`, `Scout`, `Visionary`) or views details. |
| `/menu` | — | Launches interactive Command Center dashboard categorized into 3 functional domains. |
| `/compact` | — | Manually triggers Butter Melt context compactor on the current session history. |
| `/sessions` | — | Lists recent cloud sessions stored in Supabase `relay_chats`. |
| `/resume` | `<session_id>` | Resumes a prior cloud session and restores conversational context. |
| `/sync` | — | Force-synchronizes active session to cloud store. |
| `/diff` | — | Displays unified git diff of unstaged changes in the repository. |
| `/copy` | — | Copies the last assistant response to system clipboard via OSC 52 / pbcopy / xclip. |
| `/export` | `[filename]` | Exports session conversation history to Markdown. |
| `/whoami` | — | Displays current authenticated user, provider credentials, and admin status. |
| `/quota` | — | Displays daily token quota meter (usage vs 50,000,000 tokens limit). |
| `/login` / `/logout` | — | Manages cloud authentication session. |
| `/clear` | — | Clears terminal screen and repaints butter header. |
| `/help` | — | Displays command cheat sheet and documentation. |
| `/exit` | — | Exits Beurre session. |

---

## ⚙️ 6. Execution & Workflow Protocols

### Direct Action Requirement
When interacting with Beurre or running tasks:
- **Never instruct the user to copy/paste code manually.**
- Use `write` to create or overwrite files.
- Use `edit` for surgical replacements (always inspect with `read` first to verify exact line contents).
- Use `bash` to run commands, linters, and tests.

### Bottom Prompt Bar Mechanics
- During prompt input, `BeurreEditor.readPrompt` renders the prompt box at the bottom.
- When submitted, `BeurreWorkingBar` takes over the bottom lines with a fully interactive steering chat bar:
  - **Line 0 (Status Line above Chat Bar):** `[Icon] [Spinner] [Phase / Action Message]` (e.g. `🧈 ⠋ Whipping up solution...`, `🧠 ⠹ Thinking (~140 tokens • 1.6s)...`, `⚡ ⠴ Executing bash: bun test (2.1s)...`, `● ⠸ Generating (~90 tokens • 42 tok/s • 2.1s)...`)
  - **Line 1 (Top Divider Rule):** `────────────────────────────────────────────────────────────────────────`
  - **Line 2 (Interactive Steering Prompt Line):** `> [user typed steering message]` or placeholder `Type a message to steer agent (Esc to cancel)...` with real-time blinking cursor.
  - **Line 3 (Bottom Divider Rule):** `────────────────────────────────────────────────────────────────────────`
  - **Line 4 (Footer Status Line):** `esc to cancel • enter to steer • shift+tab effort          user · model · effort · quota`
- Content (thinking blocks, agent response tokens, high-contrast tool calls, tool results) streams **above** the prompt bar via `workingBar.writeAbove(chunk)`.
- Users can type steering instructions at any time while the model works; pressing `Enter` injects the steering prompt and immediately interrupts/redirects agent generation.
- When the turn finishes, `workingBar.stop()` smoothly clears the lines and restores cursor visibility without screen clobbering.

### AGENTS.md Change-Tracking Protocol (CRITICAL)
- Whenever any model modifies project code, it **MUST** record the changes under Section 8 of this file.
- `src/agent.ts` automatically injects reminders upon executing `write` or `edit` operations on codebase files.

---

## 🧪 7. Testing & Verification

Automated tests are written with `bun:test` under `tests/`.

```bash
# Run all tests
bun test

# Run a specific test suite
bun test tests/theme.test.ts
bun test tests/editor.test.ts
bun test tests/tools.test.ts
```

All tests must pass with **100% green status** (0 failures).

---

## 📝 8. Changelog & Code Modifications

> **AI AGENT INSTRUCTION:** Append all future changes to this section in reverse chronological order.

### [2026-10-04] — Steering Bar Robustness, Sliding Window Cursor Positioning, Bracketed Paste & Strict Role Alternation
- **Author/Agent:** Antigravity / Beurre Engineering Review & Fix Agent
- **Issues Identified in Prior Attempt & Fixed:**
  1. **Strict Message Role Alternation on Early Steering (`src/agent.ts`):**
     - When steering interrupted before assistant tokens streamed, the previous code skipped recording an assistant message and pushed a user message, resulting in consecutive `user` messages that violated Anthropic Claude and strict API schemas (causing HTTP 400).
     - Fixed by inserting an interrupted assistant turn marker `[Turn interrupted by user steering before response generation]` when previous message is `user`, and combining multiple rapid steering messages with `\n\n`.
  2. **Cursor Column Overflow & Horizontal Sliding Window (`src/theme.ts`):**
     - When typing steering messages longer than terminal width, the prompt truncated from character 0, hiding the user's active typing position. Unbounded cursor movement `\x1b[${3 + this.cursor}G` sent the cursor past screen edge into next row, breaking row math.
     - Implemented horizontal cursor-aware sliding window in `formatWorkingPromptBar` and `getCursorCol()` helper in `BeurreWorkingBar`, keeping the view centered around active typing and cursor bounded within `[3, cols]`.
  3. **Terminal Bracketed Paste Support (`src/theme.ts`):**
     - Terminals sending `\x1b[200~` bracketed paste sequences had their pastes dropped by `!keyStr.startsWith('\x1b')`.
     - Implemented bracketed paste parsing with newline normalization to spaces in `BeurreWorkingBar.handleInput`.
  4. **Reasoning State Leak on Steering (`src/repl.ts`, `src/loop.ts`):**
     - Steering mid-generation reset tokens but left `accumulatedReasoning` and `thinkingBlockRendered` intact, preventing thinking blocks from rendering on subsequent steered steps.
     - Reset reasoning state, thinking start time, and flags on steer in REPL and loop runner.
  5. **Thinking Snippet Support Matching Claude Code Template:**
     - Enhanced `setThinking` to accept optional reasoning snippet (`Thinking (~140 tokens • 2.1s): Initial hypothesis...`), matching the exact Claude Code specification.
  6. **Clean Cancellation Feedback on Esc (`src/repl.ts`):**
     - Added explicit `🧈 Turn cancelled by user.` feedback upon `Esc` abort.
- **Files Modified:**
  - `src/theme.ts`: Horizontal sliding window, `getCursorCol()`, bracketed paste handling, thinking snippet support.
  - `src/agent.ts`: Strict role alternation and multi-message steering combination.
  - `src/repl.ts`: Reasoning state reset on steer, thinking snippet passing, cancellation feedback.
  - `src/loop.ts`: Reasoning state reset on steer, thinking snippet passing.
  - `tests/theme.test.ts`: Added tests for `getCursorCol` bounding, bracketed paste, thinking snippets, and steering queues.
  - `AGENTS.md`: Appended entry to Changelog.
- **Verification:**
  - `bun test` passes across all 14 test suites with 81 passed tests and 0 failures.

### [2026-10-04] — Interactive Steering Prompt Bar, Mid-Turn Generation Interruption & Stdin Integration
- **Author/Agent:** Antigravity / Beurre Interactive Steering Agent
- **Issues Identified in Prior Attempt & Fixed:**
  1. **Status Text Inadvertently Placed Inside Chat Bar:**
     - Previously, `🧈 ⠸ Whipping up solution...` was placed inside the chat bar between the two horizontal divider rules, overwriting the prompt input line `> ` and preventing user interaction during turns.
     - Redesigned `BeurreWorkingBar` and `formatWorkingPromptBar` to place the status / tool / thinking lines strictly **above** the chat bar, while maintaining an active interactive prompt input line (`> `) with real-time cursor blinking between the divider lines.
  2. **Active Mid-Turn Steering Support:**
     - Implemented interactive keyboard listening on `process.stdin` (raw mode) inside `BeurreWorkingBar`. Users can type steering instructions at any time while the agent thinks, streams tokens, or executes tools.
     - When prompt is empty, shows placeholder: `Type a message to steer agent (Esc to cancel)...`.
     - When user hits `Enter`, `onSteer` triggers:
       - Displays user card above the prompt bar (`formatUserMessageCard(message)`).
       - Injects steering instruction into `BeurreAgent.steer(message)`.
       - If generation was in progress, immediately aborts the sub-step via `currentStepAbortController.abort('steer')` and loops with the steering prompt appended to history.
       - If tool was in progress, drains the steering queue and injects steering prompt before the next inference step.
  3. **Real-Time Effort Cycling with Shift+Tab:**
     - In the active steering prompt bar, pressing `Shift+Tab` cycles reasoning effort (`low` → `medium` → `high` → `xhigh` → `max`) in real-time and calls `agent.setEffort(newEffort)`, dynamically repainting the footer status bar without screen flicker.
  4. **Instant Cancellation via Esc / Ctrl+C:**
     - Pressing `Esc` or `Ctrl+C` in the active working bar immediately aborts the active `AbortController`, cleanly stopping the turn.
- **Files Modified:**
  - `src/theme.ts`: Added interactive steering mode to `formatWorkingPromptBar`, exported `formatSteeringPromptBar`, added `inputBuffer`, `cursor`, `handleInput`, `updateInputLine`, `updateStatusLineInPlace`, and `updateFooterLine` to `BeurreWorkingBar`.
  - `src/agent.ts`: Added `steer()`, `getSteeringQueue()`, `isTurnRunning()`, and updated `runTurn()` loop with chained sub-step abort controllers and mid-generation steering injection.
  - `src/repl.ts`: Wired `onSteer`, `onCycleEffort`, and `onCancel` to `BeurreWorkingBar` during turn execution.
  - `src/loop.ts`: Wired `onSteer`, `onCycleEffort`, and `onCancel` to `BeurreWorkingBar` in `BeurreLoopRunner`.
  - `tests/theme.test.ts`: Added tests for `formatSteeringPromptBar`, typed input rendering, narrow terminal compliance, `BeurreWorkingBar` keyboard input handling, and `BeurreAgent` steering queue.
  - `AGENTS.md`: Updated Core Tenets, Keybindings, Prompt Bar Mechanics, and Changelog.
- **Verification:**
  - `bun test` passes across all 14 test suites with 78 passed tests and 0 failures.

### [2026-10-04] — Robust Working Bar, Adaptive Compaction, Border Math & Protocol Enforcement

- **Author/Agent:** Antigravity / Beurre Engineering Review Agent
- **Issues Identified in Prior Attempt & Fixed:**
  1. **Line 3 Terminal Width Overflow & Screen Drift:**
     - Prior `formatWorkingPromptBar` computed `padStatus = Math.max(2, cols - leftLen - rightLen)`. When terminal was narrower than 76 columns, line 3 was 75+ characters wide and wrapped onto row 5. `clearBar()` (`\x1b[3A`) only went up 3 rows, permanently leaking prompt bar fragments every 80ms and corrupting the viewport.
     - Implemented multi-stage adaptive compaction in `formatWorkingPromptBar` and `BeurreEditor` footer (shortening `esc to interrupt` to `esc interrupt`, dropping tags progressively, and strictly capping visual width at `cols`).
  2. **`writeAbove` Trailing Newline Invariant:**
     - Calling `writeAbove` with strings not ending in newline left cursor at column > 0, causing the top border `─────` to render on the same line as output. Added automatic newline normalization to `writeAbove`.
  3. **Static Frozen Duration During Tool Execution & Phases:**
     - Prior `BeurreWorkingBar` did not track active phase start times, leaving `Executing bash: bun test...` with no elapsed duration.
     - Added `currentPhase`, `phaseStartTime`, `phaseDetail`, and `phaseTokens` tracking in `BeurreWorkingBar`. The 80ms timer now dynamically updates elapsed seconds `(2.1s)` for tools, thinking, and token generation live.
  4. **Off-by-One Border Length Calculation (81 chars on 80-col terminals):**
     - Fixed `borderLen` formula in `formatThinkingBlock`, `renderMarkdownBlock`, `StreamingMarkdownHighlighter`, and `renderErrorCard` from `- 3` to `- 4` to account for the 4 border characters (`╭──` + `╮`), guaranteeing exact 80-character fit.
  5. **Agent Change-Tracking Protocol Workflow Enforcement:**
     - Enforced protocol reminders in `src/agent.ts` tool execution loop: when `write` or `edit` modifies codebase files, Beurre appends an explicit protocol reminder in the tool execution message.
  6. **Comprehensive AGENTS.md Expansion:**
     - Added dedicated sections for Relay Gateway / Cloud Sessions, Keybindings & Editor Conventions, and complete Slash Commands table.
- **Files Modified:**
  - `src/theme.ts`: Adaptive responsive compaction in `formatWorkingPromptBar`, dynamic phase duration tracking in `BeurreWorkingBar`, safe `writeAbove` newline normalization, off-by-one fix in `renderErrorCard`.
  - `src/markdown.ts`: Off-by-one border width fix in `formatThinkingBlock`, `renderMarkdownBlock`, and `StreamingMarkdownHighlighter`.
  - `src/editor.ts`: Responsive compaction in prompt bar status footer to eliminate line-wrap in narrow terminals.
  - `src/agent.ts`: Protocol reminder enforcement in tool execution workflow.
  - `AGENTS.md`: Expanded architectural guide, keybindings, commands directory, and updated changelog.
- **Verification:**
  - Passed `bun test` across all 14 test suites with 100% green status.

### [2026-10-04] — Pinned Working Prompt Bar & AGENTS.md Protocol
- **Author/Agent:** Antigravity / Beurre Engineering Agent
- **Files Modified:**
  - `src/theme.ts`: Implemented `formatWorkingPromptBar(options)` and initial `BeurreWorkingBar`.
  - `src/repl.ts`: Integrated `BeurreWorkingBar` into REPL interactive turn execution.
  - `src/loop.ts`: Integrated `BeurreWorkingBar` into `BeurreLoopRunner`.
  - `src/agent.ts`: Added change-tracking protocol to system prompt.
  - `AGENTS.md`: Initial creation.
  - `CLAUDE.md`, `PROJECT.md`: Symlinks to `AGENTS.md`.
