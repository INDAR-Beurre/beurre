import readline from 'node:readline';
import { BeurreAgent } from './agent.ts';
import { relay } from './relay.ts';
import { listSubagents, runNamedSubagent } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { showMenu } from './menu.ts';
import {
  b,
  colors,
  banner,
  ButterSpinner,
  formatClaudeToolCall,
  formatClaudeToolResult,
  formatShortCwd,
  getGitBranch,
} from './theme.ts';

import { openModelPicker } from './model-picker.ts';
import { SLASH_COMMANDS, getPredictiveMatches, formatPredictiveHints } from './predictive.ts';

export async function startRepl(initialModel?: string): Promise<void> {
  const agent = new BeurreAgent({ model: initialModel });
  
  // Render Claude Code / OMP Style Welcome Banner
  console.log(banner('1.0.0', agent.getModel(), agent.getCwd()));

  const completer = (line: string): [string[], string] => {
    const trimmed = line.trim();
    if (trimmed.startsWith('/')) {
      const matches = getPredictiveMatches(trimmed);
      if (matches.length > 0) {
        if (matches.length > 1) {
          process.stdout.write('\n' + formatPredictiveHints(matches) + '\n');
        }
        return [matches.map((m) => m.command), line];
      }
    }
    return [SLASH_COMMANDS.map((m) => m.command), line];
  };

  const getPromptString = () => {
    const shortCwd = formatShortCwd(agent.getCwd());
    const branch = getGitBranch(agent.getCwd());
    const gitTag = branch ? `${colors.dim}(${branch})${colors.reset}` : '';
    return `${colors.butterGold}🧈 beurre${colors.reset} ${colors.dim}[${agent.getModel()}]${colors.reset} ${colors.butterCream}${shortCwd}${gitTag}${colors.reset}\n${colors.butterMelt}>${colors.reset} `;
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer,
    prompt: getPromptString(),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.split(' ');
      const rest = args.join(' ').trim();

      // If user typed only '/' or incomplete prefix, show predictive hints
      if (cmd === '/') {
        console.log('\n' + formatPredictiveHints(SLASH_COMMANDS) + '\n');
        rl.prompt();
        return;
      }

      switch (cmd.toLowerCase()) {
        case '/menu': {
          rl.pause();
          await showMenu(agent, rl);
          rl.setPrompt(getPromptString());
          rl.resume();
          break;
        }

        case '/models':
        case '/model': {
          if (!rest) {
            rl.pause();
            await openModelPicker(agent.getModel(), (newModel) => {
              agent.setModel(newModel);
            });
            rl.setPrompt(getPromptString());
            rl.resume();
          } else {
            agent.setModel(rest);
            console.log(`${b.green('🧈 Model switched to:')} ${b.gold(rest)}`);
            rl.setPrompt(getPromptString());
          }
          break;
        }

        case '/help': {
          console.log('\n' + formatPredictiveHints(SLASH_COMMANDS) + '\n');
          break;
        }

        case '/providers': {
          const spinner = new ButterSpinner();
          spinner.start('Probing relay providers...');
          try {
            const provs = await relay.fetchProviders();
            spinner.stop();
            console.log(`\n${b.gold('🧈 UPSTREAM PROVIDERS')} (${provs.length} configured):\n`);
            for (const p of provs) {
              const status = p.live ? b.green('● LIVE') : b.red('○ DOWN');
              console.log(`  ${status} ${b.bold(p.name.padEnd(20))} ${b.dim(`${p.models || 0} models`)}`);
            }
          } catch (err: any) {
            spinner.stop();
            console.error(`${b.red('Error:')} ${err.message}`);
          }
          break;
        }

        case '/subagents': {
          const subs = listSubagents();
          console.log(`\n${b.gold('🧈 NATIVE NAMED SUBAGENTS')} (Each with designated persona & model ID):\n`);
          for (const s of subs) {
            console.log(`  ${b.subagentBadge(s.name)} ${b.dim(`[Model: ${s.modelId}]`)}`);
            console.log(`    Role: ${b.cream(s.role)}`);
            console.log(`    ${b.dim(s.description)}\n`);
          }
          break;
        }

        case '/subagent': {
          const [subName, ...taskParts] = rest.split(' ');
          const task = taskParts.join(' ').trim();
          if (!subName || !task) {
            console.log(`${b.red('Usage:')} /subagent <name> <task>`);
          } else {
            const spinner = new ButterSpinner();
            spinner.start(`Dispatching to subagent ${subName}...`);
            try {
              const result = await runNamedSubagent(subName, task, agent.getCwd());
              spinner.stop();
              console.log(`\n${b.subagentBadge(result.subagentName)} ${b.dim(`(Model: ${result.modelId}, Turns: ${result.turns})`)}`);
              console.log(result.summary);
            } catch (err: any) {
              spinner.stop();
              console.error(`${b.red('Subagent error:')} ${err.message}`);
            }
          }
          break;
        }

        case '/loop': {
          if (!rest) {
            console.log(`${b.red('Usage:')} /loop <prompt to repeat>`);
          } else {
            rl.pause();
            const runner = new BeurreLoopRunner();
            await runner.start(agent, rest);
            rl.resume();
          }
          break;
        }

        case '/compact': {
          const before = agent.getMessages().length;
          const compacted = compactMessages(agent.getMessages(), {
            iteration: 1,
            prompt: 'Continue working.',
          });
          agent.setMessages(compacted);
          const after = agent.getMessages().length;
          console.log(`${b.melt('🧈 Butter Melt Compactor:')} Condensed ${before} messages -> ${after} messages.`);
          break;
        }

        case '/sync': {
          const spinner = new ButterSpinner();
          spinner.start('Syncing session with Model Aggregator web app...');
          const ok = await relay.syncSessionToWeb({
            id: agent.getSessionId(),
            title: 'Beurre REPL Session',
            history: agent.getMessages(),
          });
          spinner.stop();
          if (ok) {
            console.log(`${b.green('🧈 Synced!')} Session available at ${b.cyan('https://relay-gw.pages.dev')}`);
          } else {
            console.log(`${b.dim('Session saved locally (web sync response was quiet).')}`);
          }
          break;
        }

        case '/history': {
          const msgs = agent.getMessages();
          console.log(`${b.cream('Current session messages:')} ${b.gold(msgs.length)}`);
          break;
        }

        case '/clear':
          console.clear();
          console.log(banner('1.0.0', agent.getModel(), agent.getCwd()));
          break;

        case '/exit':
        case '/quit':
          console.log(`\n${b.melt('🧈 Au revoir!')}\n`);
          process.exit(0);
          break;

        default:
          console.log(`${b.red('Unknown command:')} ${cmd}. Type ${b.gold('/menu')} or ${b.gold('/help')} for options.`);
      }

      console.log();
      rl.prompt();
      return;
    }

    // Claude Code / OMP Style Execution Turn
    const spinner = new ButterSpinner();
    spinner.start('Thinking...');
    let hasOutput = false;
    let lastReasonUpdate = 0;

    try {
      await agent.runTurn(trimmed, {
        onStatus: (st) => spinner.update(st),
        onToken: (tok) => {
          if (!hasOutput) {
            spinner.stop();
            hasOutput = true;
            process.stdout.write(`\n`);
          }
          process.stdout.write(tok);
        },
        onReasoning: (reasoning) => {
          const now = Date.now();
          if (!hasOutput && now - lastReasonUpdate > 300) {
            lastReasonUpdate = now;
            spinner.update(`Thinking (${reasoning.slice(-30).trim()})...`);
          }
        },
        onToolStart: (name, args) => {
          if (hasOutput) {
            console.log();
            hasOutput = false;
          }
          spinner.stop();
          console.log(`\n${formatClaudeToolCall(name, args)}`);
          spinner.start(`Executing ${name}...`);
        },
        onToolEnd: (name, output, isError) => {
          spinner.stop();
          console.log(formatClaudeToolResult(output, isError));
        },
      });
    } catch (err: any) {
      spinner.stop();
      console.error(`\n${b.red('Error:')} ${err.message}`);
    }

    if (hasOutput) {
      console.log();
    } else {
      spinner.stop();
    }

    console.log();
    rl.setPrompt(getPromptString());
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${b.melt('🧈 Au revoir!')}\n`);
    process.exit(0);
  });
}
