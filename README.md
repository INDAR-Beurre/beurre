# 🧈 Beurre

**Beurre** (*butter* in French) is a buttery-smooth, minimalist agentic CLI coding harness inspired by the minimalist philosophy of `pi`. It features tight real-time integration with the Model Aggregator and its Cloudflare Relay Gateway, an indefinite prompt-repeating loop with automatic Butter Melt context compaction, and native named subagent support with model persona routing.

```
🧈 ╭──────────────────────────────────────────────────────────╮
   │  B E U R R E  v1.0.0 — L'Agent Fondant & Autonome        │
   │  Model Aggregator • Relay Gateway • Auto-Looping         │
   ╰──────────────────────────────────────────────────────────╯
```

---

## ✨ Features

- **🧈 Butter Yellow Aesthetic**: TrueColor / ANSI golden banners, buttery smooth spinners, and crisp yellow highlights.
- **⚡ Minimalist Architecture**: Blazing fast cold-start (<15ms) running natively on Bun or Node.
- **🌐 Model Aggregator & Relay Super-Integration**:
  - Live model discovery (`GET /v1/models`) with automatic 5-minute cache TTL.
  - Live provider status probing (`GET /v1/providers`).
  - Seamless streaming inference with reasoning token support (`thinkMs`, `delta.reasoning`, `delta.content`).
  - Web search tool directly connected to `POST /v1/web_search`.
  - Automatic session synchronization to the Model Aggregator web app (`/api/sessions`).
  - Auto-reads credentials from `~/model-aggregator/cookies.txt` or `~/.omp/agent/models.yml`.
- **🔁 Continuous Indefinite Prompt Repeating Loop (`--loop`, `/loop`)**:
  - Automatically re-injects a prompt each time the model finishes a turn.
  - **Butter Melt Compactor**: Automatically condenses and summarizes preceding conversation turns between loop iterations so memory of file operations and test outcomes is retained without blowing past token limits.
  - Runs indefinitely until explicit `Ctrl+C` or `/stop`.
- **👥 Native Named Subagents**:
  - Dedicated subagent personas with assigned model IDs (e.g. `Architect` -> `kimi-k3:max`, `CodeCraft` -> `glm-5-3-flash`, `Reviewer` -> `gpt-6-astra:high`, `BugHunter` -> `o3-mini`, `Scout` -> `glm-5-3-flash`).
  - Injects named persona and model ID directly into subagent system instructions.
  - Invokable via the `subagent_run` tool or `/subagent` slash command.
- **🛠️ Butter Tool Suite**:
  - `read`: Read file with line numbering and slice views.
  - `write`: Create or overwrite files safely.
  - `edit`: Surgical find-and-replace text editing.
  - `bash`: Shell execution with timeout and real-time streaming.
  - `web_search`: Search the live web via Relay.
  - `subagent_run`: Delegate tasks to named subagents.

---

## 🚀 Quick Start

### Installation

Beurre is already linked globally to `~/.bun/bin/beurre` and `~/.local/bin/beurre`:

```bash
# Launch interactive Butter REPL
beurre

# Or run headless tasks
beurre "Check git status and summarize recent commits"

# Run a continuous prompt loop (indefinite)
beurre -p "Run tests and refactor failing code" --loop

# Inspect live relay models
beurre --models

# Inspect upstream provider health
beurre --providers

# List native named subagents
beurre --subagents
```

---

## ⌨️ Interactive REPL Slash Commands

Within the interactive REPL (`beurre`):

| Command | Description |
|---|---|
| **General** | |
| `/thinking [mode]` | Show the last reasoning block, or set how thinking is displayed |
| `/think [expand\|collapse\|hide\|show]` | Toggle collapsible thinking blocks, or inspect the full reasoning trace |
| `/quit` | Exit Beurre |
| `/help` | Display the full command cheat sheet |
| `/menu` | Searchable command palette |
| `/clear` | Clear the screen, keeping the session |
| `/new [model]` | Start a fresh session |
| `/exit` | Exit Beurre |
| `/copy` | Copy the last assistant response |
| `/diff` | Show diffs from the last turn |
| `/undo` | Drop the last exchange |
| **Model & effort** | |
| `/models` | Browse live models from the Relay Gateway |
| `/providers` | View live upstream provider statuses |
| `/model <id>` | Switch the active model on the fly |
| `/effort` | Cycle the reasoning effort level |
| **Diagnostics** | |
| `/doctor` | Check cwd, git, config, write access, width and colour |
| `/history` | Alias for `/stats` |
| `/stats` | Session stats: turns, tool calls, thinking, tokens, spend |
| `/price` | Estimated spend for the current session |
| `/env` | Show the environment the model is told about |
| `/tools` | List the tools the model can call |
| `/test` | Detect and run the project's test command |
| `/outline [path]` | Structural outline of a file or directory |
| `/grep <text>` | Literal search across the workspace |
| **Workflow** | |
| `/init` | Survey the repo and produce a grounded onboarding brief |
| `/checkpoint [save <label> \| <id>]` | List checkpoints, save one, or restore by id |
| `/snippet <name> [rm] <text>` | Save and reuse prompts |
| **Sessions & cloud** | |
| `/sessions` | List your cloud sessions |
| `/resume <id>` | Resume a session from the cloud |
| `/sync` | Force sync the active session to the cloud |
| `/whoami` | Show the active account, role and daily quota |
| `/quota` | Inspect daily token usage and account tier |
| `/usage` | Show token breakdown |
| `/login [user] [pass]` | Sign in to your Relay account |
| `/logout` | Sign out |
| **Agents** | |
| `/subagents` | List native named subagents and model personas |
| `/subagent <name> <task>` | Dispatch a task to a named subagent |
| `/loop <prompt>` | Start a continuous prompt repeating loop |
| `/compact` | Melt & compact conversation history |
| `/export <path>` | Export the transcript |

---

## 🧪 Testing

Run the full automated test suite:

```bash
cd /home/alex/Projects/beurre
bun test
```
