import readline from 'node:readline';
import { BeurreAgent } from './agent.ts';
import { relay, type RelayModel, type RelayProvider } from './relay.ts';
import { listSubagents, runNamedSubagent } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { openModelPicker } from './model-picker.ts';
import { b, colors, ButterSpinner, butterBox } from './theme.ts';

export async function showMenu(agent: BeurreAgent, rl: readline.Interface): Promise<void> {
  const askQuestion = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, (ans) => resolve(ans.trim()));
    });
  };

  const clearAndTitle = () => {
    console.log(`\n${colors.butterGold}╭── 🧈 BEURRE DASHBOARD & MENU ──────────────────────────────╮${colors.reset}`);
    console.log(`${colors.butterGold}│${colors.reset}  ${b.bold('Model:')} ${b.gold(agent.getModel())}  ${colors.dim}•${colors.reset}  ${b.bold('Cwd:')} ${b.cream(agent.getCwd())}`);
    console.log(`${colors.butterGold}╰────────────────────────────────────────────────────────────╯${colors.reset}`);
  };

  while (true) {
    clearAndTitle();
    console.log(`
  ${b.gold('[1]')} 🤖 ${b.bold('Models & Providers')}
      Browse live models from Relay Gateway, test upstreams & switch

  ${b.gold('[2]')} 🔁 ${b.bold('Autonomous Prompt Repeating Loop')}
      Launch indefinite prompt repeat loop with Butter Melt auto-compaction

  ${b.gold('[3]')} 👥 ${b.bold('Native Named Subagents')}
      Inspect personas (Architect, CodeCraft, Reviewer...) & dispatch tasks

  ${b.gold('[4]')} 🧈 ${b.bold('Butter Melt Context Compactor')}
      Inspect memory, files touched, and melt/compact conversation context

  ${b.gold('[5]')} 🌐 ${b.bold('Model Aggregator Web Sync')}
      Sync current chat session to https://relay-gw.pages.dev

  ${b.gold('[6]')} 📊 ${b.bold('Session Status & Tokens')}
      View session ID, message counts, active relay endpoint & credentials

  ${b.gold('[7]')} 🛠️  ${b.bold('Tool Suite & Capabilities')}
      List active tools (bash, read, write, edit, web_search, subagents)

  ${b.gold('[8]')} ❓ ${b.bold('Help & Claude Code / OMP Shortcuts')}
      Quick reference for keyboard navigation and slash commands

  ${b.gold('[0]')} ↩️  ${b.dim('Back to Chat Prompt')}
`);

    const choice = await askQuestion(`${b.gold('🧈 Select an option [0-8]:')} `);

    if (choice === '0' || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
      console.log(`${b.dim('Returning to chat...')}\n`);
      break;
    }

    switch (choice) {
      case '1': {
        // Redesigned Visual Model Navigator
        rl.pause();
        await openModelPicker(agent.getModel(), (newModel) => {
          agent.setModel(newModel);
        });
        rl.resume();
        break;
      }

      case '2': {
        // Loop Mode Submenu
        console.log(`\n${b.gold('─── 🔁 Autonomous Prompt Repeating Loop ────────────────────')}`);
        console.log(`${b.cream('This mode continuously repeats a prompt each time the model finishes a turn.')}`);
        console.log(`${b.cream('Context is automatically compacted between iterations with the Butter Melt Compactor.')}`);
        console.log(`${b.dim('Press Ctrl+C at any time during the loop to stop and return to the REPL.')}\n`);

        const loopPrompt = await askQuestion(`${b.gold('Enter recurring prompt (or empty to cancel):')} `);
        if (loopPrompt) {
          const maxStr = await askQuestion(`${b.gold('Max iterations (press Enter for indefinite continuous loop):')} `);
          const maxIterations = maxStr ? parseInt(maxStr, 10) : undefined;
          
          const runner = new BeurreLoopRunner();
          await runner.start(agent, loopPrompt, { maxIterations });
        }
        break;
      }

      case '3': {
        // Subagents Submenu
        console.log(`\n${b.gold('─── 👥 Native Named Subagents ──────────────────────────────')}`);
        const subs = listSubagents();
        subs.forEach((s, idx) => {
          console.log(`  ${b.gold(`[${idx + 1}]`)} ${b.subagentBadge(s.name)} ${b.dim(`(Model: ${s.modelId})`)}`);
          console.log(`      Role: ${b.cream(s.role)}`);
          console.log(`      ${b.dim(s.description)}\n`);
        });

        console.log(`  ${b.dim('Type 1-' + subs.length + ' to dispatch a task to that subagent, or press Enter to cancel:')}`);
        const subChoice = await askQuestion(`${b.gold('Select subagent to dispatch:')} `);
        const subIdx = parseInt(subChoice, 10);
        if (!isNaN(subIdx) && subIdx >= 1 && subIdx <= subs.length) {
          const target = subs[subIdx - 1];
          const task = await askQuestion(`${b.gold(`Enter task for ${target.name}:`)} `);
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
          }
        }
        await askQuestion(`${b.dim('Press Enter to return to menu...')}`);
        break;
      }

      case '4': {
        // Butter Melt Context Compactor
        console.log(`\n${b.gold('─── 🧈 Butter Melt Context Compactor ────────────────────────')}`);
        const msgs = agent.getMessages();
        console.log(`${b.cream('Current conversation turns:')} ${b.gold(msgs.length)}`);
        
        if (msgs.length <= 2) {
          console.log(`${b.dim('Context is already at minimal initial state. No compaction needed.')}`);
        } else {
          const confirm = await askQuestion(`${b.gold('Melt and compact context now? [y/N]:')} `);
          if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            const before = msgs.length;
            const compacted = compactMessages(msgs, {
              iteration: 1,
              prompt: 'Continue working from compacted state.',
            });
            agent.setMessages(compacted);
            const after = compacted.length;
            console.log(`\n${b.green('🧈 Compaction complete!')} Turns reduced from ${b.gold(before)} -> ${b.gold(after)}`);
            console.log(`${b.dim('Compacted summary injected into active agent context.')}`);
          }
        }
        await askQuestion(`${b.dim('Press Enter to return to menu...')}`);
        break;
      }

      case '5': {
        // Web Sync Submenu
        console.log(`\n${b.gold('─── 🌐 Model Aggregator Web Sync ───────────────────────────')}`);
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
          console.log(`${b.green('🧈 Successfully synced!')} Session is live and accessible on the web UI.`);
        } else {
          console.log(`${b.dim('Session recorded locally. (Web sync server responded silently).')}`);
        }
        await askQuestion(`${b.dim('Press Enter to return to menu...')}`);
        break;
      }

      case '6': {
        // Session Status & Tokens
        console.log(`\n${b.gold('─── 📊 Session Status & Tokens ─────────────────────────────')}`);
        const msgs = agent.getMessages();
        console.log(`  ${b.bold('Session ID:')}     ${b.gold(agent.getSessionId())}`);
        console.log(`  ${b.bold('Active Model:')}   ${b.gold(agent.getModel())}`);
        console.log(`  ${b.bold('Working Dir:')}    ${b.cream(agent.getCwd())}`);
        console.log(`  ${b.bold('Message Turns:')}  ${b.gold(msgs.length)}`);
        console.log(`  ${b.bold('Relay Gateway:')}  ${b.cyan('https://relay-gw.pages.dev/v1')}`);
        console.log(`  ${b.bold('Auth Mode:')}      ${b.green('Session Cookie (Unlimited Admin)')}`);
        await askQuestion(`\n${b.dim('Press Enter to return to menu...')}`);
        break;
      }

      case '7': {
        // Tool Suite
        console.log(`\n${b.gold('─── 🛠️  Butter Tool Suite ──────────────────────────────────')}`);
        console.log(`  ● ${b.bold('read')}           Read files with line numbering, offset, and line slicing`);
        console.log(`  ● ${b.bold('write')}          Create or completely overwrite files (creates directories)`);
        console.log(`  ● ${b.bold('edit')}           Precise find-and-replace text editing with diff validation`);
        console.log(`  ● ${b.bold('bash')}           Execute shell commands with streaming output and timeouts`);
        console.log(`  ● ${b.bold('web_search')}     Live web search via Model Aggregator Relay gateway`);
        console.log(`  ● ${b.bold('subagent_run')}   Delegate tasks to named subagent personas`);
        await askQuestion(`\n${b.dim('Press Enter to return to menu...')}`);
        break;
      }

      case '8': {
        // Help & Shortcuts
        console.log(`\n${b.gold('─── ❓ Help & Claude Code / OMP Shortcuts ──────────────────')}`);
        console.log(`  ${b.bold('/menu')}              Open this interactive dashboard`);
        console.log(`  ${b.bold('/models')}            Browse live models from Relay Gateway`);
        console.log(`  ${b.bold('/model <id>')}        Quickly switch active model`);
        console.log(`  ${b.bold('/loop <prompt>')}     Start autonomous prompt repeating loop`);
        console.log(`  ${b.bold('/subagents')}         List native named subagents & model personas`);
        console.log(`  ${b.bold('/subagent <n> <t>')}  Dispatch task to named subagent`);
        console.log(`  ${b.bold('/compact')}           Force context compaction`);
        console.log(`  ${b.bold('/sync')}              Sync session to web playground`);
        console.log(`  ${b.bold('/clear')}             Clear terminal screen`);
        console.log(`  ${b.bold('/exit')}, ${b.bold('/quit')}        Exit Beurre`);
        await askQuestion(`\n${b.dim('Press Enter to return to menu...')}`);
        break;
      }
    }
  }
}
