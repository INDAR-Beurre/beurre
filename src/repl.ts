import readline from 'node:readline';
import { BeurreAgent } from './agent.ts';
import { relay } from './relay.ts';
import { listSubagents, runNamedSubagent } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { b, colors, banner, ButterSpinner } from './theme.ts';

export async function startRepl(initialModel?: string): Promise<void> {
  const agent = new BeurreAgent({ model: initialModel });
  console.log(banner('1.0.0'));
  console.log(`${b.cream('Type')} ${b.gold('/help')} ${b.cream('for commands,')} ${b.gold('/models')} ${b.cream('to browse relay models,')} ${b.gold('/loop <prompt>')} ${b.cream('for continuous loop.')}`);
  console.log(`${b.dim('Current model:')} ${b.badge(agent.getModel())}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${b.gold('🧈 beurre')} ${b.dim(`[${agent.getModel()}]`)} > `,
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

      switch (cmd.toLowerCase()) {
        case '/help':
          console.log(`
${b.gold('🧈 BEURRE COMMANDS')}
  ${b.gold('/help')}                     Show this guide
  ${b.gold('/models')}                   Browse live models from Relay Gateway
  ${b.gold('/providers')}                View live upstream provider health
  ${b.gold('/model <id>')}               Switch active model
  ${b.gold('/subagents')}                List native named subagents & model IDs
  ${b.gold('/subagent <name> <task>')}   Dispatch directly to a named subagent
  ${b.gold('/loop <prompt>')}            Start continuous prompt repeat loop (indefinite)
  ${b.gold('/compact')}                  Melt & compact conversation history
  ${b.gold('/sync')}                     Sync session to Model Aggregator web app
  ${b.gold('/history')}                  Show current session history stats
  ${b.gold('/clear')}                    Clear screen
  ${b.gold('/exit')}, ${b.gold('/quit')}               Exit Beurre
`);
          break;

        case '/models': {
          const spinner = new ButterSpinner();
          spinner.start('Fetching live models from Relay Gateway...');
          try {
            const models = await relay.fetchLiveModels();
            spinner.stop();
            console.log(`\n${b.gold('🧈 LIVE RELAY MODELS')} (${models.length} available):\n`);
            for (const m of models.slice(0, 30)) {
              const tags = [];
              if (m.reasoning) tags.push('🧠 reasoning');
              if (m.context_length) tags.push(`${Math.round(m.context_length / 1000)}k ctx`);
              if (m.owned_by) tags.push(`by: ${m.owned_by}`);
              console.log(`  • ${b.bold(m.id.padEnd(28))} ${b.dim(tags.join(' | '))}`);
            }
            if (models.length > 30) {
              console.log(`  ${b.dim(`... and ${models.length - 30} more models`)}`);
            }
          } catch (err: any) {
            spinner.stop();
            console.error(`${b.red('Error:')} ${err.message}`);
          }
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

        case '/model': {
          if (!rest) {
            console.log(`${b.cream('Current model:')} ${b.gold(agent.getModel())}`);
          } else {
            agent.setModel(rest);
            console.log(`${b.green('🧈 Model switched to:')} ${b.gold(rest)}`);
            rl.setPrompt(`${b.gold('🧈 beurre')} ${b.dim(`[${agent.getModel()}]`)} > `);
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
          console.log(banner('1.0.0'));
          break;

        case '/exit':
        case '/quit':
          console.log(`${b.melt('🧈 Au revoir!')}`);
          process.exit(0);
          break;

        default:
          console.log(`${b.red('Unknown command:')} ${cmd}. Type ${b.gold('/help')} for commands.`);
      }

      console.log();
      rl.prompt();
      return;
    }

    // Normal prompt turn
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
            process.stdout.write(`${b.gold('🧈')} `);
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
          console.log(`${b.crust(' 🛠️  Tool:')} ${b.bold(name)} ${b.dim(JSON.stringify(args).slice(0, 100))}`);
          spinner.start(`Executing ${name}...`);
        },
        onToolEnd: (name, output, isError) => {
          spinner.stop();
          const icon = isError ? '❌' : '✅';
          const preview = output.replace(/\n/g, ' ').slice(0, 120);
          console.log(`   ${icon} ${b.dim(preview)}${output.length > 120 ? '...' : ''}`);
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
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${b.melt('🧈 Au revoir!')}`);
    process.exit(0);
  });
}
