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

### [2026-10-05] — Version Single Source, Framed Model Picker, Did-You-Mean & Readable Pids
- **Author/Agent:** Beurre Production Readiness Pass, round five (playtest matrix: 125 + 84 + 55 + 35 checks, plus manual pty captures at 46/62/92 cols)
- **`BEURRE_VERSION` is now the single source of truth.** `readPackageVersion()` in `src/config.ts` reads `package.json` and falls back to `0.0.0` so a missing or malformed manifest cannot stop the CLI from starting. It replaces 5 hardcoded `'1.0.0'` literals: three `banner(BEURRE_VERSION, …)` call sites in `src/repl.ts`, the `banner(version = BEURRE_VERSION, …)` default in `src/theme.ts`, and the `-v` flag in `src/index.ts`. The version test is proven red by pinning the constant to a literal.
- **The model picker was the only surface in the app not drawn in a `box()`.** Opening `/models` showed a borderless floating list, so it read as a different program taking over the screen. `renderModelList` now returns `box({ title: 'select a model', width: cols, lines, footer: '<n> of <m> models · ↑↓ move · enter select · esc close' })`, matching every other overlay. Three new tests assert the frame — the title border, the footer hint, and that **every row shares one width** so the overlay erases by the right line count. All three were confirmed red against the unboxed renderer (3 failures plus 2 width failures).
- **Unknown commands now answer with the command you meant.** `suggestCommand()` in `src/predictive.ts` scores every registered command by **Damerau** edit distance and replies `Unknown command: /modles. Did you mean /models?`. Damerau rather than plain Levenshtein is load-bearing: `/modles` scores 2 under Levenshtein, which fell outside the match budget, so the app rejected a typo of its own headline feature. Proved red by deleting the transposition term. Nonsense input still gets the `/menu` pointer rather than a confident wrong guess, and the suggestion can only ever be a command that actually exists.
- **That message was then boxed, because playtesting found it was not.** At 46 columns the bare-sentence version wrapped mid-phrase and orphaned the `?` onto its own line. Every other user-triggerable message is a `box()`, so this is one too, which also fixes it at every width.
- **`/ports` truncated the pid — the one number you run `kill` with.** Live capture showed `pid 366…`. The proc column was sized to the full `width` and the `pid` suffix appended afterwards, so the row overflowed and `box()` clipped it. `box()` renders each line at `width - 4` and the row already carries a 2-space indent; both columns now share that budget. Confirmed red on the old math at 3 of 4 widths.
- **Spacing/colour coherence was measured, not eyeballed.** All ten `features2` surfaces plus the picker render at exactly the terminal width at 46/62/80/120 — one frame signature, no ragged rows. That invariant is now a permanent test rather than a one-off script, because the defect it catches is *between* surfaces: a renderer two columns short makes the overlay erase by the wrong line count and the whole screen drifts.
- **BANNER CORRECTION — there was no banner bug.** Round four's notes described a fix for a header rendering as `beurre v1.0.0model`. That was a **capture artifact**: `tmux capture-pane | sed -n '3p'` read a line mid-redraw. Measured directly, the old and new implementations produce **byte-identical output** (`len=83` at 84 cols, `gap=33`). The `line()` → shared `columns()` deduplication is kept because it removes a duplicate of an existing helper, and the changelog is corrected to say exactly that rather than claim a fix that did not happen. The "keeps the wordmark separated" test was **deleted** — it passed on both broken and correct code, and a test that cannot fail proves nothing.
- **Dynamic imports removed from the test suite.** Five literal-path `await import('../src/relay.ts')` / `'../src/predictive.ts'` calls (and one self-import of `features2.ts` used to build the dispatcher's symbol list) are now top-level static imports, per `ts-no-dynamic-import`. The self-import now uses the statically imported namespace.
- **Two more width bugs, both found by playtesting at 30 columns — not by any test.** 728 tests were green while every row of `/ports` wrapped mid-frame in a 30-column pty.
  | Defect | Root cause | Fix |
  |---|---|---|
  | Every box wider than a narrow terminal | `contentWidth()` was `Math.max(40, columns - 2)`, so any terminal under 42 columns rendered 40-wide frames. Verified live at 30 cols. | Floor moved to 20, matching what `box()` already does internally. Proven red at 26 and 30 cols. |
  | Picker overflowed at 20–23 columns | `renderModelList` clamped itself to `Math.max(24, …)` while `box()` floors at 20, so the picker was 4 columns wider than the terminal. | Clamp matched to 20. Proven red at 20 and 22 cols. |
  | Rows grew a second indent below 34 columns | In `box()`'s borderless path (width < 34) every line got a `"  "` prefix, but callers like the picker already supply their own indent — pushing each row to `width + 2`. | Indent only lines that do not already start with a space, and `fit()` rather than `truncate()` so the frame stays uniform. |

  The last one was in the **shared** `box()` helper, not the picker, so every borderless surface was affected. All eight `features2` surfaces plus the picker are now verified overflow-free at 20/26/30/33/34/40/46/62/80/120. Below 34 the picker degrades to the borderless form by design (one row, no wrap) rather than pretending it can draw a frame.
- **Hooks, ported from Claude Code.** Claude Code's most-imited feature and the largest genuine gap here: 32 lifecycle events, all absent. `~/.beurre/hooks.json` holds `{ event: [{ matcher, command }] }`; a handler receives the event as JSON on **stdin** and a `pre-tool` handler blocks the call by printing `{"permissionDecision":"deny","reason":"…"}`. Five events ship — `session-start`, `prompt-submit`, `pre-tool`, `post-tool`, `turn-end` — because those are the ones reachable from a command line, and an event you cannot fire is a specification, not a feature. All five are wired to real call sites (`src/agent.ts:310` for the tool pair, `src/repl.ts` for the three turn-level ones), so a guard script can actually veto a tool call. 10 tests: the deny path proven red by removing the decision branch, plus matcher filtering, failing-handler reporting, and render.
  Two real bugs surfaced the moment a hook was installed for real, not in a test:
  | Defect | Root cause | Fix |
  |---|---|---|
  | **The CLI died on startup** | `runHook` was used in `src/repl.ts` but a scripted import patch had silently failed to add the import, so the very first hook call threw. Found by bisecting against a stashed tree, not by reading. | Import added with `edit`; startup verified in a pty. |
  | Every plain-text hook was reported as a crash | `JSON.parse('repo: butter')` threw *into the same `catch`* that handled command failure, so an ordinary `echo` hook was reported as a JSON parse error. The comment claimed it "degrades to plain output" — it did not. | Parse in its own `try`; only stdout that parses as a decision object is a decision, everything else is a message. Proven red by restoring the single-`catch` version. |

  Handlers run with `shell: true` so `$(…)`, pipes and `&&` work — without it a hook is a single argv split, which no user would guess.
- **A logo for Beurre.** The banner now carries a three-row mark — a slab of butter, sliced, with the corner melting away — drawn in the gutter beside the wordmark and cwd rows. Block glyphs rather than emoji, so it inherits the terminal's font and can never render as a colour emoji. It is **measured, not hand-counted**: `LOGO_GUTTER` is derived from the widest mark row, and reserving the gutter *before* `columns()` lays the row out is the whole fix — prepending the mark after padding pushed every row a column past the margin. Two intermediate versions were genuinely broken (98 overflowing widths, then a one-column overrun) and are why the constant is now computed. Proven: no banner row exceeds the terminal at **any** width from 20 to 160, and the mark disappears below 50 columns rather than squeezing the model name.
- **Verification:** 741 tests / 0 fail across 18 files (the single failure observed was the known flaky live-network `fetch live models` test, green on rerun). Every test added this round was proven red against the code it replaces; the two earlier width bugs were found only by driving the real CLI in a 30-column pty. Contract audits: 71 commands registered, 0 missing a dispatch `case`, 0 undocumented in the README, 0 `: any`, 0 dynamic imports, 0 secrets in `src/`, `tests/`, `README.md`, `AGENTS.md`.

### [2026-10-05] — Ten Project-Insight Features, Inverted Bar Chart & Dead Cron/Version Logic
- **Author/Agent:** Beurre Production Readiness Pass, round four (playtest matrix: 10 commands x 30/46/62/80/120 cols)
- **The environment defect that hid everything visual:** this box exports `NO_COLOR=1` and `TERM=dumb`, so **every `colors.*` token was an empty string** — the app had been visually validated in monochrome for three rounds. All screens are now captured with `env -u NO_COLOR TERM=xterm-256color`. The very first re-capture found the next bug.
- **Bugs found by looking at the rendered screen, not the source:**
  | Defect | Root cause | Fix |
  |---|---|---|
  | `/wordcount` drew an **inverted bar chart** — the largest number got the **shortest** bar | The filled glyph was `''`, and `''.repeat(n)` is `''`, so only the empty track rendered | `'█'` fill / `'░'` track, scaled against `max`. **Every width assertion still passed**, because the line was the right length — width tests cannot catch semantic inversion, so the regression test now asserts the *encoding* (a bigger number yields more fill characters) and was **proved red** by reintroducing the bug |
  | `/ports` reported "nothing listening" on a box with 65 sockets | `parseListeningPorts` skipped `.slice(1)` (`ss -H` prints no header) and demanded a netstat-style `tcp:0100007F:1F90` address that `ss` never emits | Regex now reads the real shape and takes the owner from `users:(("name",pid=N,…))`. **39 ports with real process names** verified |
  | `/when add "*/5 * * * * npm test"` could **never** validate | Crontab is schedule-first, but the parser was command-first — the reverse of every other command in the repo | Split `slice(0,5)` / `slice(5)`. Both halves now assert separately |
  | Cron accepted `99` as a minute | The field regex only checked *shape*, never *range* | Per-field limits checked with ranges, lists and steps expanded, so the error names the field and the legal span |
  | `/deps` called every malformed version "behind" | `Number.parseInt('not') || 0` — `NaN || 0` is `0`, which made the `isNaN` guard **dead code** | Validate the string shape instead. `^1.2.0` with `1.2.3` installed also wrongly read "ahead" although a caret range permits it; caret/tilde now pin the digits they actually pin |
  | `/permissions` overflowed the frame at every width | It ignored its `width` argument, computed its own, and passed `lines: [lines.join('\n')]` — one array element, which `box()` can never truncate | Signature is now `(mode, width)`; one element per row. **A joined string is untruncatable — that is the shape to never write** |
  | 4 of 10 new commands crashed with `X is not defined` | Dispatched and exported but never imported into `repl.ts` | Added the imports. **Now permanent contract test:** it reads `repl.ts`'s import block and resolves every name against the real module |
- **Ten new features (`src/features2.ts`), all dispatched, registered, documented and tested:**
  `/deps` · `/changelog` · `/open` · `/permissions` · `/ports` · `/theme` · `/tables` · `/envkeys` · `/when` · `/churn`
  State persists as JSON under `~/.beurre/` (`permissions.json`, `theme.json`, `crons.json`).
- **Safety:** `/envkeys` lists variable **names and lengths only** — a value whose name matches `KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|SESSION|COOKIE` is never printed, and a test asserts the rendered table cannot contain it. `/when` validates before it schedules rather than writing an expression `cron` will reject at 3am.
- **Tests:** 690 pass / 0 fail across 18 files (from 525). Two of my own new tests asserted the wrong thing and were corrected against real behaviour rather than made to pass: `LOWERCASE` **is** a conventional name, and `0 9 * * run` has four fields so the missing-command check fires first.
- **Files:** `src/repl.ts` `src/features2.ts` `tests/features2.test.ts` `README.md` `AGENTS.md`

### [2026-10-05] — Live Model Picker, Enter Key Regression, Two-Column Alignment & 11 Git/Terminal Features
- **Author/Agent:** Beurre Production Readiness Pass, round three (playtest matrix: 11 commands x 30/46/62/80/120 cols, 55 checks)
- **Bugs found by playing the CLI, not by reading it:**
  | Defect | Root cause | Fix |
  |---|---|---|
  | `/models` drew **nothing at all** | The picker called `relay.listModels()` / `relay.listProviders()`, which **do not exist**; the `TypeError` was swallowed by a `catch` that returned to the prompt | Pointed at the real `relay.fetchLiveModels()` / `relay.fetchProviders()`. Verified: 30 live models across 30 providers now render |
  | Enter **destroyed command arguments** | A round-two rewrite of the Enter handler dropped the `hasArgs` guard, so `/outline src/features.ts` dispatched only `/outline` | Submit verbatim once the buffer differs from the selected completion; *offer* (not submit) a completion for a bare prefix. 4 regression tests added and **proved red** with the guard forced false |
  | `/bisect` threw `renderBisect is not defined` | The renderer was exported and dispatched but never imported into `repl.ts` | Added the import. This is exactly what `alive.sh` exists to catch — a command that renders nothing has silently failed |
  | `/alias rm ll` **deleted an alias literally named `rm`** and kept `ll` | `/alias` is name-first (`<name> [rm] <expansion>`), so the verb-first reading silently did the opposite thing | Refuse the ambiguous form with an error card that names both readings and the correct one |
  | Error cards **overflowed the frame** | `renderErrorCard` truncated neither the title nor the message, so a long string wrapped — and every overlay erases by logical line count, so the screen drifts permanently | Truncate both at the shared root. Verified against 30/46/62/80/120/200 columns |
  | Model name and id read as one token (`GLM 5.3 Flash glm-5-3-flash`) | The column measured `name + id` together, so there was no gutter between them | Measure the name and the id as independent columns; drop the id below the width where both stop being legible |
  | `/export [path]` was registered **twice** | A stale duplicate in `predictive.ts` shadowed the round-two `md\|json\|txt` upgrade | Removed the duplicate; 60 commands, zero duplicates |
  | `/todoscan` matched its own source | Not a defect, but the scan now includes the marker table it reads from, which is honest |
- **Eleven new features (`src/features2.ts`), all dispatched, registered, documented and tested:**
  `/log` · `/branch` · `/stash` · `/blame` · `/lastcommit` · `/bisect` · `/ignore` · `/ignorecheck` · `/wordcount` · `/todoscan` · `/time`
- **Visual slop removed:** the `💻` emoji from every code-fence title in both render paths of `markdown.ts`; the banner's right-drifting model column (`columns()` right-aligns its second argument, which raggeded the margin); the mid-word truncation of a model id at `width - 34`; the missing short-width hint tier. Welcome steps are now **dropped whole** rather than cut mid-sentence (`/init surveys this repo and explai…` read as a rendering bug).
- **Verification added:** every new renderer is asserted to satisfy `stringWidth(line) <= width` at 20/26/30/46/62/80/120 columns, in both populated and empty states. Four contract tests now guard the failure modes that cost the most: every registered command has a dispatcher case, none is registered twice, all are documented in the README, and **the relay methods the picker calls actually exist**.
- **Tests:** 525 pass / 0 fail across 18 files (from 354). Deleted two incidental assertions that pinned prefix-match counts and re-pinned wording — a count of commands sharing a prefix changes with every command added.
- **Files:** `src/repl.ts` `src/model-picker.ts` `src/editor.ts` `src/theme.ts` `src/markdown.ts` `src/features.ts` `src/features2.ts` `src/predictive.ts` `tests/features2.test.ts` `tests/editor.test.ts` `tests/predictive.test.ts` `tests/theme.test.ts` `README.md`

### [2026-10-05] — Ten New Features, Box Title Deduplication & Unambiguous Completion
- **Author/Agent:** Beurre Production Readiness Pass, round two (playtest matrix: 21 commands x 30/46/80/120 cols)
- **Ten New Features (`src/features2.ts`, all dispatched in `src/repl.ts`):**
  | Command | What it does |
  |---|---|
  | `/notes` | Scratch notes persisted to `~/.beurre/notes.json`; `add`/`rm`/list-by-tag |
  | `/todo` | A checklist persisted to `todos.json`; `add`/`done`/`clear` |
  | `/alias` | Names any command (`/alias ll ls -la`), expanded in the input path before slash dispatch |
  | `/tokens` | Splits a prompt into prose vs fenced code by character share, measured honestly rather than pretending a chars-per-token constant is a tokenizer |
  | `/changes` | `git diff --numstat` as per-file line counts |
  | `/watch` | Reports what a path actually is (file/dir/link/missing) and its size |
  | `/cache` | Directory sizes for `node_modules`, `build`, `dist`, `.git` |
  | `/keys` | Every editor shortcut on one screen, stacked below ~24 columns |
  | `/preflight` | Credential, URL, git and relay-reachability diagnosis when a model will not answer |
  | `/export` | **Upgraded**, not duplicated: now writes `md`, `json` or `txt` via a format list |
- **Critical Bugs Fixed at the Root Cause:**
  1. **Every titled box printed its header twice (`src/layout.ts`)** — `box()` built one `rule()` helper and called it for *both* the top and bottom border, so `╭─ notes (1) ─╮ … ╰─ notes (1) ─╯` framed every titled box in the app. Split into `topRule()` plus a plain bottom rule.
  2. **`/usage` counted replies as prompts (`src/repl.ts`)** — the assistant branch added to `userChars`, so the prompt total was inflated by everything the model said. Split into `promptChars` / `completionChars` / `toolChars` and relabelled the ratio line.
  3. **`/notes add <tag> <text>` saved under the tag `add` (`src/repl.ts`)** — parsing was tag-then-verb (the `/snippet` shape), so the verb became the tag and the real tag became the note body. Now verb-first, matching `/todo`.
  4. **Enter silently picked the first of several autocomplete matches (`src/editor.ts`)** — typing `/t` and pressing Enter ran `/think`. A shell must never guess between candidates; completion on Enter is now accepted only when exactly one match exists. Space and Tab still complete from the *selected* match, because there the user has navigated deliberately.
  5. **`loadConfig` was used in `repl.ts` but never imported** — a latent `ReferenceError` that would have thrown the moment the new `/preflight` case ran.
  6. **Footer lines bypassed `box()`'s truncation (`src/features2.ts`)** — summaries joined in *after* `box(...)` are never truncated, so `/todo`'s hint ran 52 columns wide at a 30-column frame and made the next redraw erase the wrong number of rows. Every such line, plus every empty-state message, now goes through `truncate(…, width)`.
  7. **`git diff` sprayed its full usage text on a non-repo (`src/features2.ts`)** — `execSync` inherited stderr; now `stdio: ['ignore','pipe','ignore']`.
- **Tests:** 354 pass / 0 fail across 18 files. New `tests/features2.test.ts` asserts the width invariant over **19 renderers x 7 widths = 133 cases**, which is what pinned the footer overflow. Unused `os` and `columns` imports removed.
- **Verified by playtest:** every new command driven in a real pty at 30/46/80/120 columns, including the `/todo` add/toggle lifecycle and `/alias` expansion actually running `/todo`.

### [2026-10-05] — Relay Authentication, Markdown Rendering & Total Type Safety
- **Author/Agent:** Beurre Production Readiness Pass (playtest matrix: 25 commands x 5 widths x 30/40/46/62/80/120 cols)
- **Critical Bugs Fixed at the Root Cause:**
  1. **Every relay call returned HTTP 401 (`src/relay.ts`)** — `getAuthHeaders` sent the session cookie *or* the API key, never both, so a stale `cookies.txt` silently overrode a valid key and the request arrived with no credential at all. Both are now sent together.
  2. **The resolved key belonged to a different gateway (`src/config.ts`)** — key lookup took the *first* `apiKey:` in `~/.omp/agent/models.yml` regardless of provider, which on this machine is `yjs`, a 51-char key for an unrelated relay. `relayKeyFromOmp` now splits the file into provider blocks and returns the key from the block serving the configured `relayUrl`.
  3. **`stripAnsi` was silently wrong (`src/layout.ts`)** — the shared `ANSI_SEQ` regex was **sticky** (`/y`), so `replace` anchored to `lastIndex` and consumed only the leading *run* of escapes. Escapes interleaved with plain text (`const\e[39m \e[38;2;...mx`) survived, corrupting every width calculation in the codebase. Now `/g`; two regression tests cover escapes separated by text.
  4. **Markdown markers rendered literally in every reply (`src/markdown.ts`)** — `StreamingMarkdownHighlighter` wrote non-code lines raw, so `**bold**`, `# Head` and `- bullet` kept their markers although `renderMarkdownBlock` handles them correctly. Non-code lines now route through `renderMarkdownBlock` in both `feed()` and `flush()`.
  5. **`/price` did not exist (`src/repl.ts`)** — `estimateCost`/`renderCost` were implemented and exported but never dispatched, so `/price` answered "Unknown command". Wired into the switch and registered in `SLASH_COMMANDS` and the README.
- **Type Safety:** `src/` is now **entirely free of `any`** (was 30+). `repl.ts`'s nine `catch (err: any)` sites share one `errorMessage(err: unknown)` narrowing helper; `/resume` dropped two redundant casts (`CloudSession.history` is structurally `ChatMessage[]`); `agent.ts` types `result` as `ChatCompletionResult | null`; `auth.ts` and `relay.ts` assert named wire shapes (`RawSession`, `RelayModel`, `ToolSchema`) once per fetch rather than guarding every field. A local `isRecord` guard was deliberately rejected — it proves an object, not the fields actually read. `ToolSchema` mirrors `ToolDefinition` because `tools.ts` already imports `relay.ts`, so a back-import would close a cycle.
- **UX Fixes:** `/help` below ~42 columns squeezed descriptions into a two-character gutter; it now **stacks the description under its command** instead. Verified clean at 20/26/30/40/46/62/80/120 columns.
- **Tests:** 187 pass / 0 fail across 17 files. Added 2 `stripAnsi` regressions and made the streaming-markdown test ANSI-aware (asserting against coloured output measures nothing).
- **Playtest:** `matrix.sh` drives the real CLI in a sized pty and fails on any pane line exceeding the frame or any stderr.

### [2026-10-05] — Palette Alignment, Coherent Tool Colours & Command Syntax Fixes
- **Author/Agent:** Beurre Production Readiness Pass (playtest matrix: 21 commands x 5 widths)
- **Bugs Fixed at the Root Cause:**
  1. **`/help` rendered a corrupted box (`src/predictive.ts`)** — `formatPredictiveHints` hand-built its frame and sized the top border with `'─'.repeat(inner - 26)`, a magic constant that only lined up for a 26-character title. Every content row overflowed and wrapped, so `/help` — a beginner's first view of the tool — rendered as ragged double rows with broken borders. Rewritten onto `box()` with a fixed label column.
  2. **`/menu` values floated to arbitrary positions (`src/menu.ts`)** — rows used `columns()`, which right-aligns its second argument; "Model" sat flush against its own value with no separating space. Now a fixed label column sized to the longest title, so values hug their labels at every width instead of justifying to the right margin.
  3. **`/snippet add` dropped the name (`src/repl.ts`)** — the parser destructured `[name, ...body]` and then treated `body[0]` as the verb, so `/snippet review add hello world` saved a snippet named `hello` with text `world`, silently losing `review`. Corrected to `[name, verb, ...body]`.
  4. **`/checkpoint` could never list anything (`src/repl.ts`)** — `saveCheckpoint` was implemented and exported but called from nowhere, while the empty state promised checkpoints were saved automatically. Wired `/checkpoint save <label>` and corrected the empty state to name the real command.
  5. **Tool colour palette had collapsed (`src/theme.ts`)** — `toolSubagent` duplicated `butterMelt` exactly, `toolRead` duplicated `cyan` exactly, and `toolEdit`/`toolWrite` sat 37 units apart (indistinguishable). Re-spread all seven tools on the colour wheel, clear of the four fixed butter tones. Exported `PALETTE_RGB` with regression tests asserting pairwise separation so the palette cannot silently collapse again.
  6. **`formatPredictiveHints` returned an empty string on no matches**, showing the user nothing at all; now returns a visible "no commands match".
- **Playtest Method:** Added `/tmp/beurre-play/matrix.sh`, which drives the real CLI in a sized pty for every command at 40/46/62/80/120 columns and fails on any pane line exceeding the frame width or any stderr output. Result: **0 failures across 105 command/width combinations.**
- **Tests:** 185 pass / 0 fail across 17 files. The `/help` test now asserts the width invariant rather than pinning the old title wording.

### [2026-10-05] — Layout System, Command Palette, Argument-Preservation Fix & 10 New Features
- **Author/Agent:** Beurre Production Readiness Pass
- **New Modules:**
  1. `src/layout.ts` — single source of truth for terminal geometry: `stripAnsi`, `stringWidth`, `termWidth`, `truncate`, `padTo`, `fit`, `columns`, `box`, `rule`, `listWindow`, `colorEnabled`. Every rendered line is now guaranteed `<= termWidth()`; no surface slices a string containing ANSI escapes any more (that split escape sequences and corrupted the terminal).
  2. `src/overlay.ts` — `Overlay` (paint/erase), `parseKey`, `readKey` for safe interactive surfaces.
  3. `src/features.ts` — 26 exports backing 10 new slash commands.
- **Bugs Fixed at the Root Cause:**
  1. **Argument-discarding in the editor (`src/editor.ts`)** — the Enter, Space and Tab handlers all overwrote `s.buffer` with the selected autocomplete match. Typing `/outline src/features.ts` and pressing Enter silently submitted just `/outline` and dropped the argument. All three handlers are now guarded on "no args typed yet"; typed arguments always win over completion.
  2. **`/init` never ran (`src/repl.ts`)** — it printed the generated survey and hit `continue`, which skips turn execution, stranding the user with an empty editor. Added a `runTurn` channel so a slash command can synthesise a prompt that the turn runner executes.
  3. **Resume overstated token usage (`src/repl.ts`)** — cloud session resume summed the *entire* history including the system prompt (re-sent every turn) and overwrote the running total. Now seeded from the transcript only, keeping usage monotonic.
  4. **`/test` ran the wrong command (`src/features.ts`)** — detection hardcoded `npm test` regardless of the package script. It now reads `scripts.test` and picks `bun`/`yarn`/`pnpm`/`npm` accordingly, and detects `pytest.ini` too.
  5. **`/snippet rm` left a blank entry** instead of deleting; added `removeSnippet` returning whether anything was removed.
  6. **`renderDoctor`/`renderOutline` fed `box()` a single joined string**, which the box collapsed to one truncated line. Both now return `string[]`.
  7. **Hardcoded live API key removed (`src/config.ts`)** — `apiKey: 'sk-…'` was committed. Now empty by default, resolved from `RELAY_API_KEY` → `~/.beurre/config.json` → `~/.omp/agent/models.yml`.
  8. **Piped stdin was ignored (`src/index.ts`)** — `echo "task" | beurre` dumped the banner and exited 0. It now reads stdin and re-enters the REPL with `-p`, erroring loudly on empty input.
  9. **`/menu` forked `git status` on every keypress** and exited after an action; rewritten as a searchable palette that resolves only the highlighted row and returns to the prompt.
  10. **Model picker and autocomplete raggeded their descriptions** — `columns()` right-aligns its second argument, so it is wrong for two aligned text columns. Both now use a fixed label column plus `padTo`.
  11. **`NO_COLOR` was ignored by `theme.ts`**; colour is now gated through `colorEnabled()` (verified: 0 escape sequences under `NO_COLOR=1`).
- **UI/UX Rework:**
  - Deleted the block-glyph ASCII logo and the emoji iconography set. Replaced with typographic design: weight, alignment and rules. `✔`/`✖`/`❯` are retained as status marks.
  - Banner reduced from ~11 rows to 9, width-fitted at every terminal size.
  - Added a one-time `Welcome` panel for first-run onboarding (`~/.beurre/seen-onboarding`); repeat chrome is what makes a tool feel broken.
- **10 New Features:** `/doctor`, `/stats`, `/price`, `/env`, `/tools`, `/test`, `/outline`, `/grep`, `/init`, `/checkpoint`, `/snippet`.
- **Commands:** 27 → 39 registered, every one both dispatched and documented in `README.md` (verified by cross-check).
- **Deleted Dead Code:** `statusBar`/`StatusBarOptions`, `butterBox`, `getBeurreLogo`, `claudePromptHeader`, four unreferenced butter-stripping regexes.
- **Tests:** 178 pass / 0 fail across 17 files (`tests/features.test.ts`, `tests/layout.test.ts`, `tests/overlay.test.ts` added). Two obsolete butter-stripping tests were rewritten to assert real behaviour; two stale assertions were corrected.
- **Note:** The previously committed key `sk-0g9MKSh-…` remains in git history at `41c22fc` and must be rotated.

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
