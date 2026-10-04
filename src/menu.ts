import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BeurreAgent } from './agent.ts';
import { relay, getModelDisplayName } from './relay.ts';
import { listSubagents, runNamedSubagent } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { openModelPicker } from './model-picker.ts';
import { b, colors, ButterSpinner, renderToast, getGitStatus } from './theme.ts';

export interface MenuItem {
  id: string;
  category: 'model' | 'agents' | 'workspace';
  icon: string;
  title: string;
  actionHint: string;
  description: string;
  details: string[];
  getValue?: (agent: BeurreAgent, thinkingMode: string) => string;
}

export interface MenuOptions {
  thinkingMode?: 'expanded' | 'collapsed' | 'hidden';
  onToggleThinking?: (mode: 'expanded' | 'collapsed' | 'hidden') => void;
}

export const MENU_ITEMS: MenuItem[] = [
  // Category 1: MODEL & REASONING
  {
    id: '1',
    category: 'model',
    icon: '🤖',
    title: 'Active Model',
    actionHint: '[Enter ↵] Browse',
    description: 'Switch active model from Relay Gateway or change upstream provider.',
    details: [
      'Access 100+ frontier models via Relay Gateway (https://relay-gw.pages.dev).',
      'Supports Claude Opus 5.5, Sonnet 3.5, GLM 5.3, Kimi K3, DeepSeek V3, and GPT-4o.',
      'Action: Press [Enter] to open the interactive visual model navigator with live search.',
    ],
    getValue: (agent) => {
      const disp = getModelDisplayName(agent.getModel());
      return disp !== agent.getModel() ? `${disp} (${agent.getModel()})` : agent.getModel();
    },
  },
  {
    id: '2',
    category: 'model',
    icon: '⚡',
    title: 'Reasoning Effort',
    actionHint: '[Space ␣] Cycle',
    description: 'Controls how deeply the model thinks before answering or generating code.',
    details: [
      'Adjusts reasoning tokens and thinking budget passed to the upstream model.',
      'Available levels: LOW (fast) → MEDIUM → HIGH (default) → XHIGH → MAX (deep logic).',
      'Action: Press [Space] or [Enter] to immediately cycle to the next effort level.',
    ],
    getValue: (agent) => agent.getEffort().toUpperCase(),
  },
  {
    id: '3',
    category: 'model',
    icon: '🧠',
    title: 'Thinking Blocks',
    actionHint: '[Space ␣] Toggle',
    description: 'Configure how internal model reasoning traces are displayed in chat.',
    details: [
      'EXPANDED:  Full formatted thought card with timing and token count.',
      'COLLAPSED: One-line summary badge with thinking duration (clean view).',
      'HIDDEN:    Suppresses reasoning stream entirely, showing only the final answer.',
      'Action: Press [Space] or [Enter] to toggle between Expanded, Collapsed, and Hidden.',
    ],
    getValue: (_, thinkingMode) => thinkingMode.toUpperCase(),
  },

  // Category 2: AUTONOMOUS WORKFLOWS
  {
    id: '4',
    category: 'agents',
    icon: '👥',
    title: 'Native Subagents',
    actionHint: '[Enter ↵] Squad',
    description: 'Delegate tasks to specialized autonomous personas with designated models.',
    details: [
      '• Architect (Claude 3.5 Sonnet)  - Architecture & multi-step plans',
      '• CodeCraft (GLM 5.3)            - Clean implementation & surgical edits',
      '• Reviewer (Claude Opus 5.5)     - Security, code quality & edge-case checks',
      '• BugHunter (DeepSeek V3)        - Deep diagnostic & runtime debugging',
      '• Scout (GLM 5.3 Flash)          - Lightning-fast codebase & dependency search',
      '• Visionary (GPT-4o)             - UI/UX layout, SVG assets & image generation',
      'Action: Press [Enter] to inspect the squad and dispatch a task directly.',
    ],
    getValue: () => `${listSubagents().length} specialists ready`,
  },
  {
    id: '5',
    category: 'agents',
    icon: '🔁',
    title: 'Autonomous Loop',
    actionHint: '[Enter ↵] Launch',
    description: 'Start a continuous prompt execution loop with automatic context compaction.',
    details: [
      'Repeats a designated prompt each time the agent completes an execution turn.',
      'Context history is automatically melted and compacted between iterations to conserve tokens.',
      'Ideal for test-driven refactoring, continuous linting, or overnight tasks.',
      'Action: Press [Enter] to enter recurring prompt and start autonomous execution.',
    ],
    getValue: () => 'Ready to run',
  },

  // Category 3: WORKSPACE & REPOSITORY
  {
    id: '6',
    category: 'workspace',
    icon: '🔍',
    title: 'Git Working Tree Diff',
    actionHint: '[Enter ↵] Inspect',
    description: 'Review unstaged and staged code modifications in the repository.',
    details: [
      'Inspect uncommitted changes side-by-side with color-highlighted diffs.',
      'Displays modified files, additions (+), and deletions (-) before instructing the agent.',
      'Action: Press [Enter] to view colorized git diff in interactive viewer.',
    ],
    getValue: (agent) => {
      try {
        const out = execSync('git status --porcelain 2>/dev/null', { cwd: agent.getCwd(), encoding: 'utf-8', timeout: 500 }).trim();
        return out.length > 0 ? `${out.split('\n').length} modified files` : 'Clean working tree';
      } catch {
        return 'Not a git repo';
      }
    },
  },
  {
    id: '7',
    category: 'workspace',
    icon: '🧹',
    title: 'Compact Context',
    actionHint: '[Enter ↵] Compact',
    description: 'Melt conversation history into a structured summary to free token budget.',
    details: [
      'Rolls up previous multi-turn conversation into a structured executive brief.',
      'Preserves core requirements, decisions, and file edits while shedding old token bloat.',
      'Action: Press [Enter] to melt and compact current session turns immediately.',
    ],
    getValue: (agent) => `${agent.getMessages().length} turns in buffer`,
  },
  {
    id: '8',
    category: 'workspace',
    icon: '💾',
    title: 'Export Session',
    actionHint: '[Enter ↵] Export',
    description: 'Export active conversation history into a formatted Markdown document.',
    details: [
      'Generates a comprehensive Markdown transcript (.md) with timestamps and tool calls.',
      'Saves to the current working directory for documentation, archiving, or sharing.',
      'Action: Press [Enter] to export session to disk.',
    ],
    getValue: () => 'Markdown (.md)',
  },
  {
    id: '9',
    category: 'workspace',
    icon: '📊',
    title: 'Session Usage & Metrics',
    actionHint: '[Enter ↵] View',
    description: 'View estimated token consumption, turn counts, and relay gateway health.',
    details: [
      'Breaks down tokens across User prompts, Assistant responses, and Tool executions.',
      'Displays active session ID, upstream provider status, and authentication mode.',
      'Action: Press [Enter] to open the session analytics dashboard.',
    ],
    getValue: (agent) => `${agent.getMessages().length} turns`,
  },
  {
    id: 'h',
    category: 'workspace',
    icon: '❓',
    title: 'Help & Shortcuts',
    actionHint: '[Enter ↵] Cheatsheet',
    description: 'Quick reference for keyboard navigation, keybindings, and slash commands.',
    details: [
      'Keyboard navigation: Enter send, Shift+Enter newline, Tab complete, Esc dismiss.',
      'Core slash commands: /menu, /models, /effort, /think, /loop, /diff, /copy, /subagent.',
      'Action: Press [Enter] to view the complete keyboard & command reference.',
    ],
    getValue: () => 'Cheatsheet',
  },
  {
    id: '0',
    category: 'workspace',
    icon: '↩️',
    title: 'Back to Active Chat',
    actionHint: '[Esc / Enter]',
    description: 'Exit settings center and return to active conversation prompt.',
    details: [
      'Restores the terminal screen cleanly without losing any chat history or scrollback.',
      'Action: Press [Esc] or [Enter] to return.',
    ],
    getValue: () => 'Esc / Enter',
  },
];

export async function showMenu(
  agent: BeurreAgent,
  legacyRl?: readline.Interface,
  options: MenuOptions = {}
): Promise<void> {
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (!isTTY) {
    return showMenuFallback(agent, legacyRl);
  }

  let selectedIdx = 0;
  let running = true;
  let currentThinkingMode = options.thinkingMode ?? 'expanded';
  let bannerToast = '';

  const stdin = process.stdin;
  const stdout = process.stdout;

  let lastRenderedLinesCount = 0;

  const clearInline = () => {
    if (lastRenderedLinesCount > 0) {
      stdout.write(`\x1b[${lastRenderedLinesCount}A\r`);
      for (let i = 0; i < lastRenderedLinesCount; i++) {
        stdout.write('\x1b[2K\x1b[1B');
      }
      stdout.write(`\x1b[${lastRenderedLinesCount}A\r`);
      lastRenderedLinesCount = 0;
    }
  };

  const askInCookedMode = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      stdout.write('\x1b[?25h'); // show cursor while asking
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (ans) => {
        rl.close();
        stdout.write('\x1b[?25l'); // hide cursor again
        resolve(ans.trim());
      });
    });
  };

  const renderInlinePalette = () => {
    clearInline();

    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
    const modelName = getModelDisplayName(agent.getModel());

    const lines: string[] = [];
    lines.push(`  ${colors.butterMelt}╭── 🧈 Beurre Command Palette (OMP Mode) ──────────────────────────────╮${colors.reset}`);
    lines.push(`  ${colors.butterMelt}│${colors.reset}  ${colors.dim}Model:${colors.reset} ${colors.bold}${colors.butterCream}${modelName}${colors.reset}  ${colors.dim}• Effort:${colors.reset} ${b.gold(agent.getEffort().toUpperCase())}  ${colors.dim}• Thinking:${colors.reset} ${b.cream(currentThinkingMode.toUpperCase())}`);
    lines.push(`  ${colors.butterMelt}├────────────────────────────────────────────────────────────────────────┤${colors.reset}`);

    if (bannerToast) {
      lines.push(`  ${bannerToast}`);
      bannerToast = '';
    }

    MENU_ITEMS.forEach((item, idx) => {
      const isSelected = idx === selectedIdx;
      const pointer = isSelected ? `${colors.butterGold}❯${colors.reset} ` : '  ';
      const numTag = `[${item.id}]`;
      const value = item.getValue ? item.getValue(agent, currentThinkingMode) : '';

      const leftLabel = `${numTag} ${item.icon} ${item.title}`;
      const leftFormatted = isSelected
        ? `${colors.bold}${colors.butterGold}${leftLabel}${colors.reset}`
        : `${colors.white}${leftLabel}${colors.reset}`;

      const visibleLeftLen = stripAnsi(leftLabel).length;
      const padLen = Math.max(2, 28 - visibleLeftLen);

      const rightFormatted = isSelected
        ? `${colors.bold}${colors.butterCream}${value}${colors.reset}  ${colors.dim}${item.actionHint}${colors.reset}`
        : `${colors.gray}${value}${colors.reset}`;

      lines.push(`  ${pointer}${leftFormatted}${' '.repeat(padLen)}${rightFormatted}`);
    });

    const activeItem = MENU_ITEMS[selectedIdx];
    lines.push(`  ${colors.butterMelt}├────────────────────────────────────────────────────────────────────────┤${colors.reset}`);
    lines.push(`  ${colors.butterMelt}│${colors.reset}  ${colors.butterCream}${activeItem.description}${colors.reset}`);
    lines.push(`  ${colors.butterMelt}╰────────────────────────────────────────────────────────────────────────╯${colors.reset}`);
    lines.push(`  ${colors.dim}[↑/↓] Move   [Space] Cycle   [Enter] Select   [Esc] Close${colors.reset}`);

    stdout.write(lines.join('\n') + '\n');
    lastRenderedLinesCount = lines.length;
  };

  // Hide cursor during navigation
  stdout.write('\x1b[?25l');

  try {
    while (running) {
      renderInlinePalette();

      // Read single keypress in raw mode
      const key = await new Promise<string>((resolve) => {
        stdin.setRawMode(true);
        stdin.resume();
        const onData = (chunk: Buffer) => {
          stdin.removeListener('data', onData);
          resolve(chunk.toString('utf-8'));
        };
        stdin.on('data', onData);
      });

      // Handle Up arrow / 'k'
      if (key === '\x1b[A' || key === 'k') {
        selectedIdx = selectedIdx <= 0 ? MENU_ITEMS.length - 1 : selectedIdx - 1;
        continue;
      }

      // Handle Down arrow / 'j'
      if (key === '\x1b[B' || key === 'j') {
        selectedIdx = (selectedIdx + 1) % MENU_ITEMS.length;
        continue;
      }

      // Handle Esc or 'q'
      if (key === '\x1b' || key === 'q' || key === 'Q') {
        break;
      }

      // Space key: cycle toggleable settings
      if (key === ' ') {
        const active = MENU_ITEMS[selectedIdx];
        if (active.id === '2') {
          const efforts = ['max', 'xhigh', 'high', 'medium', 'low'];
          const cur = agent.getEffort().toLowerCase();
          const nextIdx = (efforts.indexOf(cur) + 1) % efforts.length;
          const nextEffort = efforts[nextIdx];
          agent.setEffort(nextEffort);
          continue;
        }
        if (active.id === '3') {
          if (currentThinkingMode === 'expanded') currentThinkingMode = 'collapsed';
          else if (currentThinkingMode === 'collapsed') currentThinkingMode = 'hidden';
          else currentThinkingMode = 'expanded';
          options.onToggleThinking?.(currentThinkingMode);
          continue;
        }
      }

      // Handle Enter or number selection
      let chosenItem = MENU_ITEMS[selectedIdx];
      if (key >= '1' && key <= '9') {
        const found = MENU_ITEMS.find((m) => m.id === key);
        if (found) chosenItem = found;
      } else if (key === '0') {
        break;
      } else if (key.toLowerCase() === 'h') {
        const found = MENU_ITEMS.find((m) => m.id === 'h');
        if (found) chosenItem = found;
      } else if (key !== '\r' && key !== '\n') {
        continue;
      }

      if (chosenItem.id === '0') {
        break;
      }

      // Clear palette before executing chosen action so terminal stays clean
      clearInline();
      stdout.write('\x1b[?25h'); // restore cursor for action

      switch (chosenItem.id) {
        case '1': {
          await openModelPicker(agent.getModel(), (newModel) => {
            agent.setModel(newModel);
          });
          console.log(`\n${renderToast(`Active model switched to: ${getModelDisplayName(agent.getModel())}`, true)}\n`);
          return;
        }

        case '2': {
          const efforts = ['max', 'xhigh', 'high', 'medium', 'low'];
          const cur = agent.getEffort().toLowerCase();
          const nextIdx = (efforts.indexOf(cur) + 1) % efforts.length;
          const nextEffort = efforts[nextIdx];
          agent.setEffort(nextEffort);
          console.log(`\n${renderToast(`Reasoning effort set to: ${nextEffort.toUpperCase()}`, true)}\n`);
          return;
        }

        case '3': {
          if (currentThinkingMode === 'expanded') currentThinkingMode = 'collapsed';
          else if (currentThinkingMode === 'collapsed') currentThinkingMode = 'hidden';
          else currentThinkingMode = 'expanded';
          options.onToggleThinking?.(currentThinkingMode);
          console.log(`\n${renderToast(`Thinking block display set to: ${currentThinkingMode.toUpperCase()}`, true)}\n`);
          return;
        }

        case '4': {
          console.log(`\n${colors.bold}${colors.butterGold}👥 Native Named Subagents Squad${colors.reset} ${colors.dim}(Designated personas & models)${colors.reset}:\n`);
          const subs = listSubagents();
          subs.forEach((s, idx) => {
            console.log(`  ${b.gold(`[${idx + 1}]`)} ${b.subagentBadge(s.name)} ${colors.dim}Model:${colors.reset} ${b.cream(s.modelId)}`);
            console.log(`      Role: ${colors.white}${s.role}${colors.reset}`);
            console.log(`      ${colors.gray}${s.description}${colors.reset}\n`);
          });
          return;
        }

        case '5': {
          const loopPrompt = await askInCookedMode(`  ${b.gold('Enter recurring prompt for loop (or Enter to cancel):')} `);
          if (loopPrompt) {
            const maxStr = await askInCookedMode(`  ${b.gold('Max iterations (press Enter for continuous):')} `);
            const maxIterations = maxStr ? parseInt(maxStr, 10) : undefined;
            const runner = new BeurreLoopRunner();
            await runner.start(agent, loopPrompt, { maxIterations });
          }
          return;
        }

        case '6': {
          try {
            const diffOutput = execSync('git diff HEAD 2>/dev/null', {
              cwd: agent.getCwd(),
              encoding: 'utf-8',
              timeout: 5000,
            }).trim();

            if (!diffOutput) {
              console.log(`\n${b.green('✔ Clean repository working tree. No uncommitted modifications.')}\n`);
            } else {
              console.log(`\n${colors.bold}${colors.butterGold}🧈 Git Working Tree Diff:${colors.reset}\n`);
              const lines = diffOutput.split('\n');
              const displayLines = lines.slice(0, 40);
              const highlighted = displayLines.map((line) => {
                if (line.startsWith('+++') || line.startsWith('---')) return `  ${colors.dim}${line}${colors.reset}`;
                if (line.startsWith('+')) return `  ${colors.green}${line}${colors.reset}`;
                if (line.startsWith('-')) return `  ${colors.red}${line}${colors.reset}`;
                if (line.startsWith('@@')) return `  ${colors.cyan}${line}${colors.reset}`;
                return `  ${colors.gray}${line}${colors.reset}`;
              }).join('\n');
              console.log(highlighted);
              if (lines.length > 40) {
                console.log(`\n  ${colors.dim}... and ${lines.length - 40} more diff lines${colors.reset}`);
              }
              console.log();
            }
          } catch (err: any) {
            console.log(`\n${b.red('Error running git diff:')} ${err.message}\n`);
          }
          return;
        }

        case '7': {
          const msgs = agent.getMessages();
          if (msgs.length <= 2) {
            console.log(`\n${renderToast('Context is already minimal. No compaction needed.', true)}\n`);
          } else {
            const before = msgs.length;
            const compacted = compactMessages(msgs, { iteration: 1, isLoop: false });
            agent.setMessages(compacted);
            const after = compacted.length;
            console.log(`\n${renderToast(`Context compacted: ${before} turns → ${after} turns`, true)}\n`);
          }
          return;
        }

        case '8': {
          const defaultPath = path.join(agent.getCwd(), `beurre-session-${new Date().toISOString().slice(0, 10)}.md`);
          const msgs = agent.getMessages();
          const mdLines = [
            `# 🧈 Beurre Session Export`,
            `_Session ID: ${agent.getSessionId()} | Model: ${getModelDisplayName(agent.getModel())} (${agent.getModel()}) | Effort: ${agent.getEffort()} | Exported: ${new Date().toLocaleString()}_`,
            '',
          ];
          for (const m of msgs) {
            if (m.role === 'system') continue;
            if (m.role === 'user') {
              mdLines.push(`## 👤 User\n\n${m.content}\n`);
            } else if (m.role === 'assistant') {
              mdLines.push(`## 🧈 Beurre (${getModelDisplayName(agent.getModel())})\n\n${m.content}\n`);
            } else if (m.role === 'tool') {
              mdLines.push(`> **Tool Result (${m.name || 'tool'})**:\n\`\`\`\n${m.content?.slice(0, 500) || ''}\n\`\`\`\n`);
            }
          }
          try {
            fs.writeFileSync(defaultPath, mdLines.join('\n'), 'utf-8');
            console.log(`\n${renderToast(`Session exported successfully to: ${defaultPath}`, true)}\n`);
          } catch (err: any) {
            console.log(`\n${renderToast(`Export failed: ${err.message}`, false)}\n`);
          }
          return;
        }

        case '9': {
          const msgs = agent.getMessages();
          let userChars = 0;
          let assistantChars = 0;
          let toolChars = 0;
          for (const m of msgs) {
            if (m.role === 'user') userChars += m.content?.length || 0;
            else if (m.role === 'assistant') userChars += m.content?.length || 0;
            else if (m.role === 'tool') toolChars += m.content?.length || 0;
          }
          const totalEstTokens = Math.round((userChars + assistantChars + toolChars) / 4);

          console.log(`\n${colors.butterGold}╭── 📊 Session Usage & Metrics ──────────────────────────────────╮${colors.reset}`);
          console.log(`  ${b.bold('Session ID:')}       ${colors.dim}${agent.getSessionId()}${colors.reset}`);
          console.log(`  ${b.bold('Active Model:')}     ${b.gold(getModelDisplayName(agent.getModel()))} ${colors.dim}(${agent.getModel()})${colors.reset}`);
          console.log(`  ${b.bold('Reasoning Effort:')} ${b.gold(agent.getEffort().toUpperCase())}`);
          console.log(`  ${b.bold('Thinking Mode:')}    ${b.cream(currentThinkingMode.toUpperCase())}`);
          console.log(`  ${b.bold('Total Turns:')}      ${b.cream(msgs.length)} messages`);
          console.log(`  ${b.bold('Estimated Tokens:')} ${b.gold(`~${totalEstTokens.toLocaleString()} tokens`)}`);
          console.log(`  ${b.bold('Token Breakdown:')}  ${colors.dim}User: ~${Math.round(userChars/4)} tok • Assistant: ~${Math.round(assistantChars/4)} tok • Tools: ~${Math.round(toolChars/4)} tok${colors.reset}`);
          console.log(`  ${b.bold('Relay Status:')}     ${b.green('● LIVE (relay-gw.pages.dev)')}`);
          console.log(`${colors.butterGold}╰────────────────────────────────────────────────────────────────╯${colors.reset}\n`);
          return;
        }

        case 'h': {
          console.log(`\n${colors.bold}${colors.butterGold}❓ Help & Shortcuts Reference${colors.reset}\n`);
          console.log(`  ${b.bold('Keyboard Shortcuts:')}`);
          console.log(`    ${b.gold('Enter')}            Send prompt / execute selection`);
          console.log(`    ${b.gold('Shift+Enter')}      Insert newline in multi-line prompt editor`);
          console.log(`    ${b.gold('Shift+Tab')}        Cycle reasoning effort slider (Low → Medium → High → XHigh → Max)`);
          console.log(`    ${b.gold('Tab')}              Autocomplete command or complete path`);
          console.log(`    ${b.gold('Ctrl+C')}           Interrupt active turn / abort inference`);
          console.log(`    ${b.gold('Esc')}              Dismiss autocomplete popup or clear prompt\n`);
          console.log(`  ${b.bold('Core Slash Commands:')}`);
          console.log(`    ${b.gold('/new [model]')}     Start fresh session bound to model & Supabase`);
          console.log(`    ${b.gold('/sessions')}        List cloud sessions from Supabase across devices`);
          console.log(`    ${b.gold('/resume <id>')}     Resume a session from Supabase cloud store`);
          console.log(`    ${b.gold('/whoami')}          Show active user, role & daily token quota`);
          console.log(`    ${b.gold('/quota')}           Inspect 50M daily token usage & progress`);
          console.log(`    ${b.gold('/login')}           Sign in to Relay / Supabase account`);
          console.log(`    ${b.gold('/logout')}          Sign out and clear local credentials`);
          console.log(`    ${b.gold('/models')}          Open visual model navigator`);
          console.log(`    ${b.gold('/menu')}            Open OMP-style command palette`);
          console.log(`    ${b.gold('/clear')}           Clear terminal screen buffer (preserves session)`);
          console.log(`    ${b.gold('/exit')}            Save session state and quit\n`);
          return;
        }
      }
    }
  } finally {
    clearInline();
    stdout.write('\x1b[?25h');
  }
}

// Non-interactive fallback for pipes / CI / tests
async function showMenuFallback(agent: BeurreAgent, legacyRl?: readline.Interface): Promise<void> {
  const ask = (query: string): Promise<string> => {
    if (legacyRl) {
      return new Promise((resolve) => legacyRl.question(query, (ans) => resolve(ans.trim())));
    }
    const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      tempRl.question(query, (ans) => {
        tempRl.close();
        resolve(ans.trim());
      });
    });
  };

  MENU_ITEMS.forEach((m) => {
    console.log(`[${m.id}] ${m.icon} ${m.title}`);
  });
  const choice = await ask(`${b.gold('Select option [0-9]:')} `);
  if (choice === '0' || choice.toLowerCase() === 'q') return;
  console.log(`Selected ${choice}`);
}
