import readline from 'node:readline';
import { BeurreAgent } from './agent.ts';
import { relay } from './relay.ts';
import { listSubagents, runNamedSubagent } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { openModelPicker } from './model-picker.ts';
import { b, colors, ButterSpinner, butterBox, statusBar } from './theme.ts';

export interface MenuItem {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface MenuOptions {
  thinkingMode?: 'expanded' | 'collapsed' | 'hidden';
  onToggleThinking?: (mode: 'expanded' | 'collapsed' | 'hidden') => void;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: '1',
    icon: '🤖',
    title: 'Models & Providers',
    description: 'Browse live models from Relay Gateway, test upstreams & switch active model',
  },
  {
    id: '2',
    icon: '🔁',
    title: 'Autonomous Prompt Repeating Loop',
    description: 'Launch indefinite prompt repeat loop with Butter Melt auto-compaction',
  },
  {
    id: '3',
    icon: '👥',
    title: 'Native Named Subagents',
    description: 'Inspect personas (Architect, CodeCraft, Reviewer...) & dispatch tasks',
  },
  {
    id: '4',
    icon: '🧈',
    title: 'Butter Melt Context Compactor',
    description: 'Inspect memory, files touched, and melt/compact conversation context',
  },
  {
    id: '5',
    icon: '🧠',
    title: 'Thinking Blocks Display Mode',
    description: 'Toggle reasoning mode: Expanded (full card), Collapsed (one-line), or Hidden',
  },
  {
    id: '6',
    icon: '🌐',
    title: 'Model Aggregator Web Sync',
    description: 'Sync current chat session to https://relay-gw.pages.dev',
  },
  {
    id: '7',
    icon: '📊',
    title: 'Session Status & Tokens',
    description: 'View session ID, message counts, active relay endpoint & credentials',
  },
  {
    id: '8',
    icon: '🛠️',
    title: 'Tool Suite & Capabilities',
    description: 'List active tools (bash, read, write, edit, web_search, subagents)',
  },
  {
    id: '9',
    icon: '❓',
    title: 'Help & Claude Code / OMP Shortcuts',
    description: 'Quick reference for keyboard navigation and slash commands',
  },
  {
    id: '0',
    icon: '↩️',
    title: 'Back to Chat Prompt',
    description: 'Exit dashboard and return to active conversation',
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

  const stdin = process.stdin;
  const stdout = process.stdout;

  const renderDashboard = () => {
    console.clear();
    const cols = Math.min(stdout.columns || 80, 80);
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

    const title = ` 🧈 BEURRE DASHBOARD & CONTROL CENTER `;
    const borderLen = Math.max(0, cols - title.length - 3);

    console.log(`${colors.butterGold}╭──${colors.bold}${title}${colors.reset}${colors.butterGold}${'─'.repeat(borderLen)}╮${colors.reset}`);
    const infoText = `  ${b.bold('Model:')} ${b.badge(agent.getModel())}  ${colors.dim}•${colors.reset}  ${b.bold('Thinking:')} ${b.gold(currentThinkingMode)}  ${colors.dim}•${colors.reset}  ${b.bold('Cwd:')} ${b.cream(agent.getCwd())}`;
    const infoLen = stripAnsi(infoText).length;
    const padHeader = Math.max(0, cols - infoLen - 2);
    console.log(`${colors.butterGold}│${colors.reset}${infoText}${' '.repeat(padHeader)}${colors.butterGold}│${colors.reset}`);
    console.log(`${colors.butterGold}╰${'─'.repeat(cols - 2)}╯${colors.reset}\n`);

    const sections = [
      { name: 'MODELS & SESSIONS', ids: ['1', '6', '7'] },
      { name: 'AUTONOMOUS & SUBAGENTS', ids: ['2', '3', '4'] },
      { name: 'DISPLAY & TOOLING', ids: ['5', '8', '9'] },
      { name: 'NAVIGATION', ids: ['0'] },
    ];

    sections.forEach((sec) => {
      const secHeader = `  ${colors.butterCrust}─── ${colors.bold}${sec.name}${colors.reset}${colors.butterCrust} ${'─'.repeat(Math.max(0, cols - sec.name.length - 12))}${colors.reset}`;
      console.log(secHeader);

      sec.ids.forEach((id) => {
        const item = MENU_ITEMS.find((m) => m.id === id);
        if (!item) return;

        const idx = MENU_ITEMS.indexOf(item);
        const isSelected = idx === selectedIdx;
        const pointer = isSelected ? `${colors.butterGold}🧈 >${colors.reset} ` : '     ';
        const keyBadge = isSelected
          ? `${colors.bgButterGold}${colors.bold} [${item.id}] ${colors.reset}`
          : `${b.gold(`[${item.id}]`)}`;

        let titleLabel = item.title;
        if (item.id === '5') {
          titleLabel = `Thinking Blocks Display (${currentThinkingMode.toUpperCase()})`;
        }

        const titleText = isSelected
          ? `${colors.bold}${colors.butterCream}${item.icon} ${titleLabel}${colors.reset}`
          : `${colors.bold}${item.icon} ${titleLabel}`;

        console.log(`${pointer}${keyBadge} ${titleText}`);
        const descColor = isSelected ? colors.butterPale : colors.gray;
        console.log(`        ${descColor}${item.description}${colors.reset}`);
      });
      console.log();
    });

    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`  ${b.bold('Navigation:')} ${b.gold('↑/↓')} move  •  ${b.gold('Enter')} select  •  ${b.gold('[0-9]')} jump  •  ${b.gold('Esc/q')} return`);
    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
  };

  const askInCookedMode = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    });
  };

  const pressKeyToReturn = async (promptMsg = 'Press Esc, Enter, or q to return to dashboard...'): Promise<void> => {
    console.log(`\n${b.dim(promptMsg)}`);
    return new Promise((resolve) => {
      stdin.setRawMode(true);
      stdin.resume();
      const onKey = (chunk: Buffer) => {
        stdin.removeListener('data', onKey);
        stdin.setRawMode(false);
        resolve();
      };
      stdin.on('data', onKey);
    });
  };

  while (running) {
    renderDashboard();

    // Read single keypress in raw mode
    const key = await new Promise<string>((resolve) => {
      stdin.setRawMode(true);
      stdin.resume();
      const onData = (chunk: Buffer) => {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        resolve(chunk.toString('utf-8'));
      };
      stdin.on('data', onData);
    });

    // Handle Up arrow
    if (key === '\x1b[A') {
      selectedIdx = selectedIdx <= 0 ? MENU_ITEMS.length - 1 : selectedIdx - 1;
      continue;
    }

    // Handle Down arrow
    if (key === '\x1b[B') {
      selectedIdx = (selectedIdx + 1) % MENU_ITEMS.length;
      continue;
    }

    // Handle Esc or 'q'
    if (key === '\x1b' || key === 'q' || key === 'Q') {
      break;
    }

    // Handle Enter or number selection
    let chosenId = MENU_ITEMS[selectedIdx].id;
    if (key >= '0' && key <= '9') {
      chosenId = key;
    } else if (key !== '\r' && key !== '\n') {
      continue;
    }

    if (chosenId === '0') {
      console.log(`\n${b.dim('Returning to chat prompt...')}\n`);
      break;
    }

    // Dispatch action for chosen menu item
    switch (chosenId) {
      case '1': {
        // Redesigned Visual Model Navigator
        await openModelPicker(agent.getModel(), (newModel) => {
          agent.setModel(newModel);
        });
        break;
      }

      case '2': {
        // Loop Mode
        console.clear();
        console.log(`\n${b.gold('─── 🔁 Autonomous Prompt Repeating Loop ────────────────────')}`);
        console.log(`${b.cream('This mode continuously repeats a prompt each time the model finishes a turn.')}`);
        console.log(`${b.cream('Context is automatically compacted between iterations with the Butter Melt Compactor.')}`);
        console.log(`${b.dim('Press Ctrl+C at any time during the loop to stop and return to the REPL.')}\n`);

        const loopPrompt = await askInCookedMode(`${b.gold('Enter recurring prompt (or empty to cancel):')} `);
        if (loopPrompt) {
          const maxStr = await askInCookedMode(`${b.gold('Max iterations (press Enter for indefinite continuous loop):')} `);
          const maxIterations = maxStr ? parseInt(maxStr, 10) : undefined;

          const runner = new BeurreLoopRunner();
          await runner.start(agent, loopPrompt, { maxIterations });
        }
        break;
      }

      case '3': {
        // Subagents Browser & Dispatcher
        console.clear();
        console.log(`\n${b.gold('─── 👥 Native Named Subagents ──────────────────────────────')}\n`);
        const subs = listSubagents();
        subs.forEach((s, idx) => {
          console.log(`  ${b.gold(`[${idx + 1}]`)} ${b.subagentBadge(s.name)} ${b.dim(`(Model: ${s.modelId})`)}`);
          console.log(`      Role: ${b.cream(s.role)}`);
          console.log(`      ${b.dim(s.description)}\n`);
        });

        console.log(`  ${b.dim('Type 1-' + subs.length + ' to dispatch a task, or press Enter to return:')}`);
        const subChoice = await askInCookedMode(`${b.gold('Select subagent to dispatch:')} `);
        const subIdx = parseInt(subChoice, 10);
        if (!isNaN(subIdx) && subIdx >= 1 && subIdx <= subs.length) {
          const target = subs[subIdx - 1];
          const task = await askInCookedMode(`${b.gold(`Enter task for ${target.name}:`)} `);
          if (task) {
            const spinner = new ButterSpinner();
            spinner.start(`Dispatching to ${target.name} (${target.modelId})...`);
            try {
              const res = await runNamedSubagent(target.name, task, agent.getCwd());
              spinner.stop();
              console.log(`\n${b.subagentBadge(res.subagentName)} ${b.dim(`[Model: ${res.modelId} | Turns: ${res.turns}]`)}`);
              console.log(res.summary);
            } catch (err: any) {
              spinner.stop();
              console.error(`${b.red('Subagent error:')} ${err.message}`);
            }
            await pressKeyToReturn();
          }
        }
        break;
      }

      case '4': {
        // Butter Melt Compactor
        console.clear();
        console.log(`\n${b.gold('─── 🧈 Butter Melt Context Compactor ────────────────────────')}\n`);
        const msgs = agent.getMessages();
        console.log(`${b.cream('Current conversation turns:')} ${b.gold(msgs.length)}`);

        if (msgs.length <= 2) {
          console.log(`${b.dim('Context is already at minimal initial state. No compaction needed.')}`);
        } else {
          const confirm = await askInCookedMode(`${b.gold('Melt and compact context now? [y/N]:')} `);
          if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            const before = msgs.length;
            const compacted = compactMessages(msgs, {
              iteration: 1,
              isLoop: false,
            });
            agent.setMessages(compacted);
            const after = compacted.length;
            console.log(`\n${b.green('🧈 Compaction complete!')} Turns reduced from ${b.gold(before)} -> ${b.gold(after)}`);
            console.log(`${b.dim('Compacted summary injected into active agent context.')}`);
          }
        }
        await pressKeyToReturn();
        break;
      }

      case '5': {
        // Thinking Blocks Display Mode Toggle
        if (currentThinkingMode === 'expanded') {
          currentThinkingMode = 'collapsed';
        } else if (currentThinkingMode === 'collapsed') {
          currentThinkingMode = 'hidden';
        } else {
          currentThinkingMode = 'expanded';
        }
        options.onToggleThinking?.(currentThinkingMode);
        console.log(`\n${renderToast(`Thinking display switched to: ${currentThinkingMode.toUpperCase()}`, true)}\n`);
        await new Promise((r) => setTimeout(r, 600));
        break;
      }

      case '6': {
        // Web Sync
        console.clear();
        console.log(`\n${b.gold('─── 🌐 Model Aggregator Web Sync ───────────────────────────')}\n`);
        console.log(`${b.cream('Target:')} ${b.cyan('https://relay-gw.pages.dev')}`);
        console.log(`${b.cream('Session ID:')} ${b.dim(agent.getSessionId())}`);
        const spinner = new ButterSpinner();
        spinner.start('Syncing session with Model Aggregator web app...');
        const ok = await relay.syncSessionToWeb({
          id: agent.getSessionId(),
          title: 'Beurre Session: ' + new Date().toLocaleString(),
          history: agent.getMessages(),
        });
        spinner.stop();
        if (ok) {
          console.log(`\n${b.green('🧈 Successfully synced!')} Session is live and accessible at https://relay-gw.pages.dev`);
        } else {
          console.log(`\n${b.dim('Session recorded locally. (Web sync server responded silently).')}`);
        }
        await pressKeyToReturn();
        break;
      }

      case '7': {
        // Session Status & Tokens
        console.clear();
        console.log(`\n${b.gold('─── 📊 Session Status & Tokens ─────────────────────────────')}\n`);
        const msgs = agent.getMessages();
        console.log(`  ${b.bold('Session ID:')}     ${b.gold(agent.getSessionId())}`);
        console.log(`  ${b.bold('Active Model:')}   ${b.gold(agent.getModel())}`);
        console.log(`  ${b.bold('Working Dir:')}    ${b.cream(agent.getCwd())}`);
        console.log(`  ${b.bold('Message Turns:')}  ${b.gold(msgs.length)}`);
        console.log(`  ${b.bold('Relay Gateway:')}  ${b.cyan('https://relay-gw.pages.dev/v1')}`);
        console.log(`  ${b.bold('Auth Mode:')}      ${b.green('Session Cookie (Unlimited Admin)')}`);
        await pressKeyToReturn();
        break;
      }

      case '8': {
        // Tool Suite
        console.clear();
        console.log(`\n${b.gold('─── 🛠️  Butter Tool Suite ──────────────────────────────────')}\n`);
        console.log(`  ● ${b.bold('read')}           Read files with line numbering, offset, and line slicing`);
        console.log(`  ● ${b.bold('write')}          Create or completely overwrite files (creates directories)`);
        console.log(`  ● ${b.bold('edit')}           Precise find-and-replace text editing with diff validation`);
        console.log(`  ● ${b.bold('bash')}           Execute shell commands with streaming output and timeouts`);
        console.log(`  ● ${b.bold('web_search')}     Live web search via Model Aggregator Relay gateway`);
        console.log(`  ● ${b.bold('subagent_run')}   Delegate tasks to named subagent personas`);
        await pressKeyToReturn();
        break;
      }

      case '9': {
        // Help & Shortcuts
        console.clear();
        console.log(`\n${b.gold('─── ❓ Help & Claude Code / OMP Shortcuts ──────────────────')}\n`);
        console.log(`  ${b.bold('/menu')}              Open this interactive dashboard`);
        console.log(`  ${b.bold('/models')}            Browse live models from Relay Gateway`);
        console.log(`  ${b.bold('/model <id>')}        Quickly switch active model`);
        console.log(`  ${b.bold('/think [mode]')}      Toggle or inspect collapsible thinking blocks`);
        console.log(`  ${b.bold('/loop <prompt>')}     Start autonomous prompt repeating loop`);
        console.log(`  ${b.bold('/subagents')}         List native named subagents & model personas`);
        console.log(`  ${b.bold('/subagent <n> <t>')}  Dispatch task to named subagent`);
        console.log(`  ${b.bold('/compact')}           Force context compaction`);
        console.log(`  ${b.bold('/sync')}              Sync session to web playground`);
        console.log(`  ${b.bold('/clear')}             Clear terminal screen`);
        console.log(`  ${b.bold('/exit')}, ${b.bold('/quit')}        Exit Beurre`);
        await pressKeyToReturn();
        break;
      }
    }
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
