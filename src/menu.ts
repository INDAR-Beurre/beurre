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

  // Enter alternate screen buffer & hide cursor so user chat scrollback is NEVER cleared or lost!
  stdout.write('\x1b[?1049h\x1b[?25l');

  const cleanupAndExit = () => {
    // Show cursor & return to primary screen buffer
    stdout.write('\x1b[?25h\x1b[?1049l');
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

  const pressKeyToReturn = async (promptMsg = 'Press any key or Esc to return to menu...'): Promise<void> => {
    stdout.write(`\n  ${colors.dim}${promptMsg}${colors.reset}\n`);
    return new Promise((resolve) => {
      stdin.setRawMode(true);
      stdin.resume();
      const onKey = () => {
        stdin.removeListener('data', onKey);
        resolve();
      };
      stdin.on('data', onKey);
    });
  };

  const renderDashboard = () => {
    // Jump to top of alternate screen
    stdout.write('\x1b[H\x1b[2J');
    const cols = Math.min(stdout.columns || 80, 80);
    const innerWidth = cols - 4;
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

    const modelName = getModelDisplayName(agent.getModel());
    const git = getGitStatus(agent.getCwd());
    const gitTag = git.branch ? ` • ${git.branch}${git.isDirty ? '*' : ''}` : '';

    // Sleek header bar
    console.log(`\n  ${colors.bold}${colors.butterGold}🧈 BEURRE${colors.reset} ${colors.dim}— Settings & Command Center${colors.reset}`);
    console.log(`  ${colors.dim}Model:${colors.reset} ${colors.bold}${colors.butterCream}${modelName}${colors.reset}  ${colors.dim}•  Effort:${colors.reset} ${b.gold(agent.getEffort().toUpperCase())}  ${colors.dim}•  Thinking:${colors.reset} ${b.cream(currentThinkingMode.toUpperCase())}${colors.dim}${gitTag}${colors.reset}`);
    console.log(`  ${colors.mutedBox}${'─'.repeat(cols - 4)}${colors.reset}`);

    if (bannerToast) {
      console.log(`  ${bannerToast}`);
      bannerToast = '';
    } else {
      console.log();
    }

    // Render categorized menu sections
    let lastCat = '';
    MENU_ITEMS.forEach((item, idx) => {
      // Print category header
      if (item.category !== lastCat) {
        lastCat = item.category;
        let catLabel = '';
        if (item.category === 'model') catLabel = '⚙️  MODEL & REASONING';
        else if (item.category === 'agents') catLabel = '🤖  AUTONOMOUS WORKFLOWS';
        else if (item.category === 'workspace') catLabel = '🛠️  WORKSPACE & REPOSITORY';
        console.log(`  ${colors.dim}${catLabel}${colors.reset}`);
      }

      const isSelected = idx === selectedIdx;
      const pointer = isSelected ? `${colors.butterGold}❯${colors.reset} ` : '  ';
      const numTag = `[${item.id}]`;
      const value = item.getValue ? item.getValue(agent, currentThinkingMode) : '';

      const leftLabel = `${numTag} ${item.icon} ${item.title}`;
      const leftFormatted = isSelected
        ? `${colors.bold}${colors.butterGold}${leftLabel}${colors.reset}`
        : `${colors.white}${leftLabel}${colors.reset}`;

      const visibleLeftLen = stripAnsi(leftLabel).length;
      const padLen = Math.max(2, 30 - visibleLeftLen);

      const rightFormatted = isSelected
        ? `${colors.bold}${colors.butterCream}${value}${colors.reset}  ${colors.dim}${item.actionHint}${colors.reset}`
        : `${colors.gray}${value}${colors.reset}`;

      console.log(`  ${pointer}${leftFormatted}${' '.repeat(padLen)}${rightFormatted}`);
    });

    // Detail card for active item
    const activeItem = MENU_ITEMS[selectedIdx];
    console.log(`\n  ${colors.mutedBox}${'─'.repeat(cols - 4)}${colors.reset}`);

    const formatDetailLine = (line: string) => {
      const vis = stripAnsi(line).length;
      const pad = Math.max(0, innerWidth - vis);
      return `  ${colors.mutedBox}│${colors.reset} ${line}${' '.repeat(pad)} ${colors.mutedBox}│${colors.reset}`;
    };

    console.log(`  ${colors.mutedBox}╭──${colors.bold}${colors.butterGold} ${activeItem.icon} ${activeItem.title.toUpperCase()} ${colors.reset}${colors.mutedBox}${'─'.repeat(Math.max(0, cols - activeItem.title.length - 12))}╮${colors.reset}`);
    activeItem.details.forEach((det) => {
      console.log(formatDetailLine(`${colors.butterCream}${det}${colors.reset}`));
    });
    console.log(`  ${colors.mutedBox}╰${'─'.repeat(cols - 2)}╯${colors.reset}`);

    // Clean keybinding hints
    console.log(`  ${colors.dim}[↑/↓] Move   [Space] Cycle Value   [Enter] Select/Open   [Esc/q] Close${colors.reset}\n`);
  };

  try {
    while (running) {
      renderDashboard();

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

      // Quick toggle on Space bar for toggleable settings
      if (key === ' ') {
        const active = MENU_ITEMS[selectedIdx];
        if (active.id === '2') {
          // Cycle reasoning effort
          const efforts = ['max', 'xhigh', 'high', 'medium', 'low'];
          const cur = agent.getEffort().toLowerCase();
          const nextIdx = (efforts.indexOf(cur) + 1) % efforts.length;
          const nextEffort = efforts[nextIdx];
          agent.setEffort(nextEffort);
          bannerToast = renderToast(`Reasoning effort set to: ${nextEffort.toUpperCase()}`, true);
          continue;
        }
        if (active.id === '3') {
          // Cycle thinking display
          if (currentThinkingMode === 'expanded') currentThinkingMode = 'collapsed';
          else if (currentThinkingMode === 'collapsed') currentThinkingMode = 'hidden';
          else currentThinkingMode = 'expanded';
          options.onToggleThinking?.(currentThinkingMode);
          bannerToast = renderToast(`Thinking display switched to: ${currentThinkingMode.toUpperCase()}`, true);
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

      // Dispatch action for chosen menu item
      switch (chosenItem.id) {
        case '1': {
          // Visual Model Navigator
          await openModelPicker(agent.getModel(), (newModel) => {
            agent.setModel(newModel);
          });
          bannerToast = renderToast(`Active model switched to: ${getModelDisplayName(agent.getModel())}`, true);
          break;
        }

        case '2': {
          // Reasoning Effort Selector
          const efforts = ['max', 'xhigh', 'high', 'medium', 'low'];
          const cur = agent.getEffort().toLowerCase();
          const nextIdx = (efforts.indexOf(cur) + 1) % efforts.length;
          const nextEffort = efforts[nextIdx];
          agent.setEffort(nextEffort);
          bannerToast = renderToast(`Reasoning effort switched to: ${nextEffort.toUpperCase()}`, true);
          break;
        }

        case '3': {
          // Thinking Blocks Display Toggle
          if (currentThinkingMode === 'expanded') currentThinkingMode = 'collapsed';
          else if (currentThinkingMode === 'collapsed') currentThinkingMode = 'hidden';
          else currentThinkingMode = 'expanded';
          options.onToggleThinking?.(currentThinkingMode);
          bannerToast = renderToast(`Thinking display set to: ${currentThinkingMode.toUpperCase()}`, true);
          break;
        }

        case '4': {
          // Subagents Squad Browser & Interactive Dispatcher
          stdout.write('\x1b[H\x1b[2J');
          console.log(`\n  ${colors.bold}${colors.butterGold}👥 Native Named Subagents Squad${colors.reset} ${colors.dim}(Designated personas & model IDs)${colors.reset}\n`);
          const subs = listSubagents();
          subs.forEach((s, idx) => {
            console.log(`  ${b.gold(`[${idx + 1}]`)} ${b.subagentBadge(s.name)} ${colors.dim}Model:${colors.reset} ${b.cream(s.modelId)}`);
            console.log(`      Role: ${colors.white}${s.role}${colors.reset}`);
            console.log(`      ${colors.gray}${s.description}${colors.reset}\n`);
          });

          console.log(`  ${colors.dim}Enter subagent number [1-${subs.length}] to dispatch a task, or press Enter to cancel:${colors.reset}`);
          const subChoice = await askInCookedMode(`  ${b.gold('Select subagent:')} `);
          const subIdx = parseInt(subChoice, 10);
          if (!isNaN(subIdx) && subIdx >= 1 && subIdx <= subs.length) {
            const target = subs[subIdx - 1];
            const task = await askInCookedMode(`  ${b.gold(`Enter task for ${target.name}:`)} `);
            if (task) {
              const spinner = new ButterSpinner();
              spinner.start(`Dispatching to ${target.name}...`);
              try {
                const res = await runNamedSubagent(target.name, task, agent.getCwd());
                spinner.stop();
                console.log(`\n  ${b.subagentBadge(res.subagentName)} ${b.dim(`[${res.modelId} • ${res.turns} turns]`)}`);
                console.log(`  ${colors.white}${res.summary.replace(/\n/g, '\n  ')}${colors.reset}\n`);
              } catch (err: any) {
                spinner.stop();
                console.error(`\n  ${b.red('Subagent error:')} ${err.message}\n`);
              }
              await pressKeyToReturn();
            }
          }
          break;
        }

        case '5': {
          // Autonomous Prompt Repeating Loop
          stdout.write('\x1b[H\x1b[2J');
          console.log(`\n  ${colors.bold}${colors.butterGold}🔁 Autonomous Prompt Repeating Loop${colors.reset}`);
          console.log(`  ${colors.gray}Repeats a prompt continuously each time the model completes a turn.${colors.reset}`);
          console.log(`  ${colors.gray}Context is automatically compacted between iterations with the Butter Melt Compactor.${colors.reset}\n`);

          const loopPrompt = await askInCookedMode(`  ${b.gold('Enter recurring prompt (or press Enter to cancel):')} `);
          if (loopPrompt) {
            const maxStr = await askInCookedMode(`  ${b.gold('Max iterations (press Enter for continuous indefinite loop):')} `);
            const maxIterations = maxStr ? parseInt(maxStr, 10) : undefined;
            // Exit alternate screen before starting loop runner so user sees streaming
            cleanupAndExit();
            const runner = new BeurreLoopRunner();
            await runner.start(agent, loopPrompt, { maxIterations });
            return;
          }
          break;
        }

        case '6': {
          // Git Working Tree Diff
          stdout.write('\x1b[H\x1b[2J');
          console.log(`\n  ${colors.bold}${colors.butterGold}🔍 Git Working Tree Diff${colors.reset}\n`);
          try {
            const diffOutput = execSync('git diff HEAD 2>/dev/null', {
              cwd: agent.getCwd(),
              encoding: 'utf-8',
              timeout: 5000,
            }).trim();

            if (!diffOutput) {
              console.log(`  ${b.green('✔ Clean repository working tree. No uncommitted modifications.')}\n`);
            } else {
              const lines = diffOutput.split('\n');
              const maxDisplay = 40;
              const displayLines = lines.slice(0, maxDisplay);
              const highlighted = displayLines.map((line) => {
                if (line.startsWith('+++') || line.startsWith('---')) return `  ${colors.dim}${line}${colors.reset}`;
                if (line.startsWith('+')) return `  ${colors.green}${line}${colors.reset}`;
                if (line.startsWith('-')) return `  ${colors.red}${line}${colors.reset}`;
                if (line.startsWith('@@')) return `  ${colors.cyan}${line}${colors.reset}`;
                return `  ${colors.gray}${line}${colors.reset}`;
              }).join('\n');
              console.log(highlighted);
              if (lines.length > maxDisplay) {
                console.log(`\n  ${colors.dim}... and ${lines.length - maxDisplay} more diff lines${colors.reset}`);
              }
              console.log();
            }
          } catch (err: any) {
            console.log(`  ${b.red('Error running git diff:')} ${err.message}\n`);
          }
          await pressKeyToReturn();
          break;
        }

        case '7': {
          // Compact Context
          const msgs = agent.getMessages();
          if (msgs.length <= 2) {
            bannerToast = renderToast('Context is already minimal. No compaction needed.', true);
          } else {
            const before = msgs.length;
            const compacted = compactMessages(msgs, { iteration: 1, isLoop: false });
            agent.setMessages(compacted);
            const after = compacted.length;
            bannerToast = renderToast(`Context compacted: ${before} turns → ${after} turns`, true);
          }
          break;
        }

        case '8': {
          // Export Session
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
            bannerToast = renderToast(`Session exported: ${defaultPath}`, true);
          } catch (err: any) {
            bannerToast = renderToast(`Export failed: ${err.message}`, false);
          }
          break;
        }

        case '9': {
          // Session Usage & Metrics
          stdout.write('\x1b[H\x1b[2J');
          console.log(`\n  ${colors.bold}${colors.butterGold}📊 Session Usage & Metrics${colors.reset}\n`);
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

          console.log(`  ${b.bold('Session ID:')}       ${colors.dim}${agent.getSessionId()}${colors.reset}`);
          console.log(`  ${b.bold('Active Model:')}     ${b.gold(getModelDisplayName(agent.getModel()))} ${colors.dim}(${agent.getModel()})${colors.reset}`);
          console.log(`  ${b.bold('Reasoning Effort:')} ${b.gold(agent.getEffort().toUpperCase())}`);
          console.log(`  ${b.bold('Thinking Mode:')}    ${b.cream(currentThinkingMode.toUpperCase())}`);
          console.log(`  ${b.bold('Total Turns:')}      ${b.cream(msgs.length)} messages`);
          console.log(`  ${b.bold('Estimated Tokens:')} ${b.gold(`~${totalEstTokens.toLocaleString()} tokens`)}`);
          console.log(`  ${b.bold('Token Breakdown:')}  ${colors.dim}User: ~${Math.round(userChars/4)} tok • Assistant: ~${Math.round(assistantChars/4)} tok • Tools: ~${Math.round(toolChars/4)} tok${colors.reset}`);
          console.log(`  ${b.bold('Relay Status:')}     ${b.green('● LIVE (relay-gw.pages.dev)')}`);
          console.log(`  ${b.bold('Auth Mode:')}        ${b.cream('Session Cookie / Key')}\n`);
          await pressKeyToReturn();
          break;
        }

        case 'h': {
          // Help & Shortcuts
          stdout.write('\x1b[H\x1b[2J');
          console.log(`\n  ${colors.bold}${colors.butterGold}❓ Help & Shortcuts Reference${colors.reset}\n`);
          console.log(`  ${b.bold('Keyboard Shortcuts:')}`);
          console.log(`    ${b.gold('Enter')}            Send prompt / execute selection`);
          console.log(`    ${b.gold('Shift+Enter')}      Insert newline in prompt editor`);
          console.log(`    ${b.gold('Tab')}              Autocomplete slash command or file path`);
          console.log(`    ${b.gold('Ctrl+C')}           Cancel current stream / interrupt turn`);
          console.log(`    ${b.gold('Esc / q')}          Dismiss autocomplete or return\n`);
          console.log(`  ${b.bold('Core Slash Commands:')}`);
          console.log(`    ${b.gold('/menu')}            Open this settings & command center`);
          console.log(`    ${b.gold('/models')}          Visual model navigator and switcher`);
          console.log(`    ${b.gold('/effort <level>')}  Set reasoning effort (max, high, med, low)`);
          console.log(`    ${b.gold('/think <mode>')}    Toggle reasoning block (expand, collapse, hide)`);
          console.log(`    ${b.gold('/copy')}            Copy last assistant response to clipboard`);
          console.log(`    ${b.gold('/diff')}            View working tree git diff`);
          console.log(`    ${b.gold('/usage')}           Inspect session token breakdown`);
          console.log(`    ${b.gold('/export [file]')}   Export session history to Markdown`);
          console.log(`    ${b.gold('/loop <prompt>')}   Run continuous prompt repeating loop`);
          console.log(`    ${b.gold('/subagent <n> <t>')} Dispatch task to named subagent`);
          console.log(`    ${b.gold('/compact')}         Melt conversation history into rollup`);
          console.log(`    ${b.gold('/clear')}           Clear terminal screen and show banner`);
          console.log(`    ${b.gold('/exit')}            Save session state and quit\n`);
          await pressKeyToReturn();
          break;
        }
      }
    }
  } finally {
    cleanupAndExit();
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
