<p align="center">
  <br />
  <h1 align="center">🧈 B E U R R E</h1>
  <p align="center">
    <strong>Ultra-fast, buttery-smooth agentic coding CLI harness with interactive steering, live reasoning telemetry, and multi-model relay gateway integration.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/INDAR-Beurre/beurre/actions/workflows/ci.yml"><img src="https://github.com/INDAR-Beurre/beurre/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-%3E%3D1.0.0-fbf0df?style=flat-square&logo=bun&logoColor=black" alt="Bun" /></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
    <img src="https://img.shields.io/badge/Tests-878%20Passing-74DE80?style=flat-square" alt="Tests" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-FACC15?style=flat-square" alt="License" /></a>
    <a href="https://relay-gw.pages.dev"><img src="https://img.shields.io/badge/Gateway-Relay-F59E0B?style=flat-square" alt="Gateway" /></a>
  </p>
  <br />
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Terminal Ergonomics](#-terminal-ergonomics)
- [Quick Start & Installation](#-quick-start--installation)
  - [Universal 1-Line Installer (macOS, Linux, WSL)](#-universal-1-line-installer-macos-linux-wsl)
  - [Windows PowerShell](#-windows-powershell)
  - [Install with Bun](#-install-with-bun)
  - [Instant Run via bunx](#-instant-run-via-bunx)
- [Key Features](#-key-features)
- [Keyboard Shortcuts & Interactive Steering](#-keyboard-shortcuts--interactive-steering)
- [Slash Commands Reference](#-slash-commands-reference)
- [Turbo Boost Mode (`/boost`)](#-turbo-boost-mode-boost)
- [Lifecycle Hooks](#-lifecycle-hooks)
- [Subagents & Model Personas](#-subagents--model-personas)
- [Development & Testing](#-development--testing)
- [Contributing & License](#-contributing--license)

---

## 🌟 Overview

**Beurre** (*butter* in French, `🧈`) is an ultra-fast, minimalist agentic AI coding harness inspired by the philosophy of `pi` and the interactive ergonomics of Claude Code and Codex.

Running natively on Bun with sub-15ms cold start times, Beurre bridges state-of-the-art reasoning models directly into your terminal. It features continuous tool execution, real-time reasoning drawers, anchored bottom prompt bars with mid-flight user steering, and deep integration with the **Model Aggregator** and its Cloudflare Relay Gateway.

The runtime uses the lightweight OMP agent core (`@oh-my-pi/pi-agent-core`) for the turn loop, native streaming events, tool dispatch, and steering. It does **not** embed the full `omp` coding-agent/TUI application: Relay is the provider boundary, and Beurre keeps only its small local tool surface and terminal UI.

```text
🧈 ╭────────────────────────────────────────────────────────────────────────────╮
   │  B E U R R E  v1.0.0 — L'Agent Fondant & Autonome                           │
   │  Model Aggregator • Relay Gateway • Auto-Looping • Turbo Boost              │
   ╰────────────────────────────────────────────────────────────────────────────╯
```

---

## 🖥️ Terminal Ergonomics

Beurre pins an interactive steering bar at the bottom of your terminal that remains fully responsive while the model thinks, generates, or runs tools:

```text
● Read(~/src/relay.ts) [1.2KB]
⣟ Thinking (~180 tokens • 2.4s): Analyzing SSE stream buffer flush...
────────────────────────────────────────────────────────────────────────────────────────
> Type a message to steer agent (Esc to cancel)...
────────────────────────────────────────────────────────────────────────────────────────
esc to cancel • enter to steer • shift+tab effort          admin · GLM 5.3 Flash · high · ∞
```

- **Interactive Steering**: Inject corrections or redirections mid-turn without killing the process.
- **Dynamic Reasoning Snippet**: A live sliding thought drawer keeps you informed of the model's hypothesis in real time.
- **Velocity Telemetry**: Displays token generation speed (`tok/s`), token estimates, and elapsed execution timers.
- **Surgical Diffs**: Inspect unified color diffs inline for every `edit` and `write` tool operation.
- **ANSI Boundary Clamping**: 100% immune to window resize glitches and terminal line corruption.

---

## 🚀 Quick Start & Installation

### ⚡ Universal 1-Line Installer (macOS, Linux, WSL)
No manual setup required. Automatically installs Bun if missing, configures your `PATH`, and links `beurre`:

```bash
curl -fsSL https://raw.githubusercontent.com/INDAR-Beurre/beurre/main/install.sh | bash
```

### 🪟 Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/INDAR-Beurre/beurre/main/install.ps1 | iex
```

### 🍞 Install with Bun
If you already have Bun installed:

```bash
bun add -g github:INDAR-Beurre/beurre
```

### ⚡ Instant Run via `bunx`
Try Beurre immediately without installing:

```bash
bunx github:INDAR-Beurre/beurre
```

### Verify Installation
```bash
beurre --version
beurre --models
```

---

## ✨ Key Features

- **🧈 Butter Yellow TrueColor Palette**: Refined ANSI/24-bit golden borders (`#FACC15`), soft cream accents (`#FEF9C3`), and high-contrast tool badges.
- **⚡ Sub-15ms Cold-Start**: Zero bloated Electron or Python runtimes — compiles and executes natively on Bun.
- **🌐 Model Aggregator & Relay Gateway Integration**:
  - Live model discovery (`GET /v1/models`) with automatic 5-minute cache TTL across 50+ flagship models.
  - Live provider health probing (`GET /v1/providers`).
  - Seamless Server-Sent Events (SSE) streaming with reasoning token demarcation (`thinkMs`, `delta.reasoning`).
  - Direct web search via Relay (`POST /v1/web_search`).
  - Auto-reads session credentials from `~/model-aggregator/cookies.txt` or `~/.omp/agent/models.yml`.
- **🪶 Lightweight OMP Core**:
  - Uses OMP's agent loop and native tool/event contracts without loading the full OMP CLI, TUI, provider catalogue, or optional feature set.
  - Keeps Relay as the single chat, search, and image provider boundary.
  - Retains native Relay-backed image generation through the OpenAI-compatible image transport and saves provider-correct MIME extensions locally.
- **📎 Smart `@` File Context Inlining**:
  - Type `@src/...` to open an interactive file & folder search popover.
  - Referenced files (<50KB) are automatically inlined directly into prompt context, eliminating redundant exploratory tool calls.
- **⚡ Turbo Boost Mode (`/boost`, `--boost`)**:
  - Elevates effort to `MAX` with a 64k reasoning budget.
  - Switches to flagship reasoning models (`kimi-k3:max`, `claude-opus-5-5`).
  - Activates **Autonomous Test Verification**: auto-detects your test suite (`bun test`, `npm test`, `pytest`, `cargo test`) and executes up to 3 bounded self-correction turns if tests fail.
- **🔁 Continuous Indefinite Loop (`--loop`, `/loop`)**:
  - Re-executes instructions continuously for background autonomous tasks.
  - **Butter Melt Compactor**: Automatically condenses preceding turns to preserve file change logs and test results without overflowing context limits.
- **🔎 Reverse-i-Search (`Ctrl+R`)**:
  - Instant interactive command history search with match counter and arrow-key cursor positioning.

---

## ⌨️ Keyboard Shortcuts & Interactive Steering

| Shortcut | Context | Action |
|---|---|---|
| <kbd>Enter</kbd> | Working Bar | **Steer Agent**: Send a mid-turn instruction without interrupting session |
| <kbd>Shift</kbd> + <kbd>Tab</kbd> | Input & Working | **Cycle Reasoning Effort**: `low` → `medium` → `high` → `xhigh` → `max` |
| <kbd>Esc</kbd> | Working Bar | **Interrupt**: Instantly cancel active inference turn or tool execution |
| <kbd>Ctrl</kbd> + <kbd>R</kbd> | Prompt Input | **Reverse-i-Search**: Search and cycle through command history |
| <kbd>Ctrl</kbd> + <kbd>L</kbd> | Prompt Input | **Clear Screen**: Cleanly repaint terminal banner and prompt |
| <kbd>@</kbd> | Prompt Input | **File Mention**: Open fuzzy file autocomplete popover |
| <kbd>Tab</kbd> | Autocomplete | Complete command or drill down into directory path |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | Prompt Input | Insert newline for multi-line prompts |

---

## 🛠️ Slash Commands Reference

Beurre includes over 60 built-in commands accessible via `/`:

Within the interactive REPL (`beurre`):

| Command | Description |
|---|---|
| **General & Session** | |
| `/help` | Display the full command cheat sheet |
| `/menu` | Searchable command palette and options |
| `/clear` | Clear the screen, keeping the session |
| `/new [model]` | Start a fresh session |
| `/quit` | Exit Beurre |
| `/exit` | Exit Beurre |
| `/copy` | Copy the last assistant response to clipboard |
| `/diff` | Show diffs from the last turn or working tree |
| `/undo` | Drop the last exchange |
| `/thinking [mode]` | Show the last reasoning block, or set how thinking is displayed |
| `/think [expand\|collapse\|hide\|show]` | Toggle collapsible thinking blocks, or inspect the full reasoning trace |
| **Model & Reasoning** | |
| `/models` | Browse live models from the Relay Gateway |
| `/providers` | View live upstream provider statuses |
| `/model <id>` | Switch the active model on the fly |
| `/effort [level]` | Cycle or set reasoning effort level |
| `/boost [on\|off\|status\|prompt]` | Engage Turbo Boost mode (max effort, flagship model, auto-verify) |
| **Diagnostics & System** | |
| `/doctor` | Check cwd, git, config, write access, width and colour |
| `/history` | Alias for `/stats` |
| `/stats` | Session stats: turns, tool calls, thinking, tokens, spend |
| `/price` | Estimated spend for the current session |
| `/env` | Show the environment the model is told about |
| `/tools` | List the tools the model can call |
| `/test` | Detect and run the project's test command |
| `/outline [path]` | Structural outline of a file or directory |
| `/grep <text>` | Literal search across the workspace |
| **Workflow & File Management** | |
| `/init` | Survey the repo and produce a grounded onboarding brief |
| `/checkpoint [save <label> \| <id>]` | List checkpoints, save one, or restore by id |
| `/snippet <name> [rm] <text>` | Save and reuse prompts |
| `/notes [add <tag> <text> \| rm <tag>]` | Scratch notes that survive restarts |
| `/todo [add <text> \| done <text> \| clear]` | A checklist that survives restarts |
| `/alias <name> [rm] <expansion>` | Name any command and type `/name` instead |
| `/tokens <prompt>` | Break a prompt into prose and code by size |
| `/changes` | Line counts for everything you have edited |
| `/watch [path ...]` | Check what a path currently is and how big |
| `/cache` | Where the disk went: build output by size |
| `/keys` | Every editor shortcut, in one screen |
| `/preflight` | Diagnose why a model is not answering |
| `/log [n]` | Recent commits with author, date and subject |
| `/branch` | Current branch, upstream, and how far ahead or behind |
| `/stash` | List stashed work you can go back to |
| `/blame <file>` | Who last touched each line of a file |
| `/lastcommit` | The most recent commit and the files it touched |
| `/bisect` | Whether a bisect has run long enough to mean anything |
| `/ignore` | Every ignore rule in play for this repository |
| `/ignorecheck <path>` | Explain why a path is ignored, tracked or untracked |
| `/wordcount [path]` | Files, lines and words under a directory |
| `/todoscan` | Find TODO, FIXME and HACK markers across the tree |
| `/time` | How long this session has run, and per turn |
| `/deps [path]` | Which installed dependencies no longer match package.json |
| `/since [rev]` | Commits since a revision, with author and age |
| `/todo-due [task [date]]` | Tasks with a due date; overdue first |
| `/bigfiles [limit]` | Largest tracked files, by bytes and line count |
| `/scratch [text]` | Durable scratchpad that survives restarts |
| `/loc` | Lines of code grouped by language |
| `/compat` | Runtime requirements this environment meets |
| `/what-changed [rev]` | Files you changed and who else touched them |
| `/changelog [version]` | Group recent commits into a release changelog |
| `/open <path\|url>` | Open a file, folder or URL in the right application |
| `/permissions [mode]` | `ask`, `auto-read` or `yolo` — how much runs without asking |
| `/ports` | What this machine is listening on, and which process owns it |
| `/theme [name]` | Switch the colour theme |
| `/tables <db>` | Which tables in a SQLite database take the most space |
| `/envkeys [filter]` | Which environment variables are set, hiding secret values |
| `/when add\|rm\|list` | Schedule work on a cron expression, validated before saving |
| `/churn [file]` | Which lines of a file change most often |
| `/hooks [rm <event> <n>]` | Shell commands fired at lifecycle points; a `pre-tool` hook can block a call |
| **Sessions & Cloud** | |
| `/sessions` | List your cloud sessions |
| `/resume <id>` | Resume a session from the cloud |
| `/sync` | Force sync the active session to the cloud |
| `/whoami` | Show the active account, role and daily quota |
| `/quota` | Inspect daily token usage and account tier |
| `/usage` | Show token breakdown |
| `/login [user] [pass]` | Sign in to your Relay account |
| `/logout` | Sign out |
| **Git Intelligence** | |
| `/review` | Review the uncommitted working tree — every changed file with its `+`/`-` counts |
| `/blame-summary [file]` | Who owns a file, by share of its commits |
| `/hotspots` | The most-churned files in the last 6 months, where bugs live |
| **Memory & Context** | |
| `/decisions [title rationale]` | Record a decision with its reasoning, or list the log |
| `/recall <term>` | Search decisions, notes and snippets at once, ranked by relevance |
| `/prompts [name text]` | Save a reusable prompt, or list the ones you have saved |
| **Transcripts** | |
| `/transcript` | Save this session to a `.jsonl` transcript |
| `/transcripts` | List saved transcripts, newest first |
| `/replay <file>` | Replay a saved transcript in a readable frame |
| **Agents & Automation** | |
| `/subagents` | List native named subagents and model personas |
| `/subagent <name> <task>` | Dispatch a task to a named subagent |
| `/loop <prompt>` | Start a continuous prompt repeating loop |
| `/compact` | Melt & compact conversation history |
| `/export <path>` | Export the transcript |

---

## ⚡ Turbo Boost Mode (`/boost`)

Engage Turbo Boost mode for complex, multi-file refactoring or high-difficulty debugging:

```bash
# Launch CLI directly in Turbo Boost mode
beurre --boost

# Or engage within the REPL
/boost on
/boost "Refactor authentication flow and ensure all tests pass"
```

In Turbo Boost mode:
1. **Effort Level**: Locked to `MAX` (64,000 thinking token budget).
2. **Model**: Upgraded to flagship reasoning engines (e.g. `kimi-k3:max`).
3. **Reasoning Stream**: Full real-time thought trace display.
4. **Autonomous Self-Correction**: When the model modifies source code, Beurre automatically executes the project's test suite. If tests fail, failure tail diagnostics are fed back into the model for up to 3 automated fix cycles.

---

## 🪝 Lifecycle Hooks

Compatible with the Claude Code hooks specification. Configure scripts in `~/.beurre/hooks.json` to inspect, log, or block operations:

| Event | Trigger Point |
|---|---|
| `session-start` | Triggered once upon CLI launch |
| `prompt-submit` | Fires before model receives turn prompt |
| `pre-tool` | Executes before tool call — **can deny execution** |
| `post-tool` | Executes after tool call completes |
| `turn-end` | Fires when model completes turn response |

### Example Hook Configuration
```json
{
  "rules": {
    "pre-tool": [
      {
        "matcher": "bash",
        "command": "CMD=$(cat); case \"$CMD\" in *rm\\ -rf*) echo '{\"permissionDecision\":\"deny\",\"reason\":\"Destructive bash command blocked by safety hook\"}';; esac"
      }
    ],
    "turn-end": [
      {
        "matcher": "*",
        "command": "notify-send 'Beurre' 'Task completed'"
      }
    ]
  }
}
```

---

## 👥 Subagents & Model Personas

Beurre supports designated named subagent personas invokable via `/subagent <name> <task>`:

| Persona | Designated Model | Specialization |
|---|---|---|
| **`Architect`** | `kimi-k3:max` | System design, architectural patterns, boundary contracts |
| **`CodeCraft`** | `glm-5-3-flash` | Ultra-fast code generation, implementation, test writing |
| **`Reviewer`** | `gpt-6-astra:high` | Security audits, edge-case analysis, static verification |
| **`BugHunter`** | `o3-mini` | Deep root-cause isolation, crash analysis, regression testing |
| **`Scout`** | `glm-5-3-flash` | Rapid workspace surveying, file finding, dependency mapping |
| **`Visionary`** | `gpt-4o` | Multi-modal diagram analysis and UI inspection |

---

## 🧪 Development & Testing

Beurre enforces rigorous width-contract tests and edge-case guarantees:

```bash
# Clone repository
git clone https://github.com/INDAR-Beurre/beurre.git
cd beurre

# Install dependencies
bun install

# Run complete test suite (878+ tests)
bun test

# Run interactive REPL locally
bun run start
```

---

## 📄 Contributing & License

Contributions, bug reports, and pull requests are warmly welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

Licensed under the [MIT License](./LICENSE).

<p align="center">
  <sub>Crafted with 🧈 for the developer community.</sub>
</p>
