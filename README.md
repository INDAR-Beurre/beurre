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
| **Sessions & cloud** | |
| `/sessions` | List your cloud sessions |
| `/resume <id>` | Resume a session from the cloud |
| `/sync` | Force sync the active session to the cloud |
| `/whoami` | Show the active account, role and daily quota |
| `/quota` | Inspect daily token usage and account tier |
| `/usage` | Show token breakdown |
| `/login [user] [pass]` | Sign in to your Relay account |
| `/logout` | Sign out |
| **Git intelligence** | |
| `/review` | Review the uncommitted working tree — every changed file with its `+`/`-` counts |
| `/blame-summary [file]` | Who owns a file, by share of its commits |
| `/hotspots` | The most-churned files in the last 6 months, where bugs live |
| **Memory** | |
| `/decisions [title rationale]` | Record a decision with its reasoning, or list the log |
| `/recall <term>` | Search decisions, notes and snippets at once, ranked by relevance |
| `/prompts [name text]` | Save a reusable prompt, or list the ones you have saved |
| **Transcripts** | |
| `/transcript` | Save this session to a `.jsonl` transcript |
| `/transcripts` | List saved transcripts, newest first |
| `/replay <file>` | Replay a saved transcript in a readable frame |
| **Agents** | |
| `/subagents` | List native named subagents and model personas |
| `/subagent <name> <task>` | Dispatch a task to a named subagent |
| `/loop <prompt>` | Start a continuous prompt repeating loop |
| `/compact` | Melt & compact conversation history |
| `/export <path>` | Export the transcript |

---

## 🪝 Hooks

Ported from [Claude Code's hooks system](https://code.claude.com/docs/en/hooks). A hook is a shell
command that runs automatically at a lifecycle point, receives the event as JSON on stdin, and can
block the thing that triggered it.

Claude Code ships 32 events; Beurre fires the five that are reachable from a command line. An event
you cannot trigger is a specification, not a feature.

| Event | Fires |
|---|---|
| `session-start` | Once, when the REPL starts |
| `prompt-submit` | Before the model sees your turn |
| `pre-tool` | Before each tool call — **can deny it** |
| `post-tool` | After each tool call |
| `turn-end` | After the model finishes responding |

Configure them in `~/.beurre/hooks.json`, then list them with `/hooks`:

```json
{
  "rules": {
    "pre-tool": [
      { "matcher": "bash", "command": "~/.beurre/hooks/block-rm.sh" }
    ],
    "turn-end": [
      { "matcher": "*", "command": "notify-send 'beurre' 'turn finished'" }
    ]
  }
}
```

`matcher` is a tool name, or `*` for every tool. Commands run through your shell, so `$(…)`, pipes
and `&&` all work. The event JSON arrives on **stdin**, which a handler reads with `cat`:

```json
{
  "rules": {
    "pre-tool": [
      {
        "matcher": "bash",
        "command": "CMD=$(cat); case \"$CMD\" in *rm\\ -rf*) echo '{\"permissionDecision\":\"deny\",\"reason\":\"destructive command blocked by hook\"}';; esac"
      }
    ]
  }
}
```

That handler blocks `bash` calls containing `rm -rf` and lets everything else through. Nothing is
required but a POSIX shell — use `jq` if you want to parse the JSON properly.

To *annotate* rather than block, print anything else; it is appended to the turn as context:

```json
{ "matcher": "*", "command": "cat | jq -r .prompt >> ~/notes/prompts.log" }
```

Any other stdout is appended to the turn as context, so a handler can annotate rather than block.
A handler that exits non-zero is reported rather than swallowed — a guard script that crashes must
not fail open.


---

## 🧪 Testing

Run the full automated test suite:

```bash
cd /home/alex/Projects/beurre
bun test
```
