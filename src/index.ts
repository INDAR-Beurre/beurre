import { startRepl } from './repl.ts';
import { BeurreAgent } from './agent.ts';
import { BeurreLoopRunner } from './loop.ts';
import { relay } from './relay.ts';
import { listSubagents } from './subagents.ts';
import { b, colors, banner, ButterSpinner } from './theme.ts';

function printHelp(): void {
  console.log(`
${b.gold('🧈 BEURRE — A minimalist, butter-themed agentic CLI harness')}
${b.dim('Integrated with Model Aggregator & Cloudflare Relay Gateway')}

${b.bold('USAGE:')}
  beurre [options] [prompt]

${b.bold('OPTIONS:')}
  -p, --prompt <string>      Run a prompt directly in headless mode
  -l, --loop [prompt]        Run in continuous repeating loop mode (indefinite)
  -m, --model <modelId>      Select model ID (e.g. glm-5-3-flash, kimi-k3:max)
  --models                   List live models available from the Relay Gateway
  --providers                Probe and list live upstream provider health
  --subagents                List native named subagents and their model personas
  -h, --help                 Show this help message
  -v, --version              Show version

${b.bold('EXAMPLES:')}
  beurre                                            # Launch interactive butter REPL
  beurre "Inspect package.json and summarize"      # Run single task headless
  beurre -p "Check tests and fix errors" --loop    # Run indefinite continuous loop
  beurre --models                                   # Show all active relay models
  beurre --subagents                                # Show named subagent personas
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let prompt: string | null = null;
  let isLoop = false;
  let selectedModel: string | undefined;
  let maxIterations: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '-v' || arg === '--version') {
      console.log(`beurre v1.0.0 (🧈 fondant & autonome)`);
      process.exit(0);
    }

    if (arg === '--max' || arg === '--max-iterations') {
      maxIterations = parseInt(args[++i], 10);
      continue;
    }

    if (arg === '--models') {
      const spinner = new ButterSpinner();
      spinner.start('Fetching live models from Relay Gateway...');
      try {
        const models = await relay.fetchLiveModels();
        spinner.stop();
        console.log(`\n${b.gold('🧈 LIVE RELAY MODELS')} (${models.length} available):\n`);
        for (const m of models) {
          const tags = [];
          if (m.reasoning) tags.push('🧠 reasoning');
          if (m.context_length) tags.push(`${Math.round(m.context_length / 1000)}k ctx`);
          if (m.owned_by) tags.push(`by: ${m.owned_by}`);
          console.log(`  • ${b.bold(m.id.padEnd(28))} ${b.dim(tags.join(' | '))}`);
        }
      } catch (err: any) {
        spinner.stop();
        console.error(`${b.red('Error:')} ${err.message}`);
      }
      process.exit(0);
    }

    if (arg === '--providers') {
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
      process.exit(0);
    }

    if (arg === '--subagents') {
      const subs = listSubagents();
      console.log(`\n${b.gold('🧈 NATIVE NAMED SUBAGENTS')} (Each with designated persona & model ID):\n`);
      for (const s of subs) {
        console.log(`  ${b.subagentBadge(s.name)} ${b.dim(`[Model: ${s.modelId}]`)}`);
        console.log(`    Role: ${b.cream(s.role)}`);
        console.log(`    ${b.dim(s.description)}\n`);
      }
      process.exit(0);
    }

    if (arg === '-m' || arg === '--model') {
      selectedModel = args[++i];
      continue;
    }

    if (arg === '-p' || arg === '--prompt') {
      prompt = args[++i];
      continue;
    }

    if (arg === '-l' || arg === '--loop') {
      isLoop = true;
      if (args[i + 1] && !args[i + 1].startsWith('-')) {
        prompt = args[++i];
      }
      continue;
    }

    if (!arg.startsWith('-') && !prompt) {
      prompt = arg;
    }
  }

  // If loop mode with a prompt
  if (isLoop) {
    if (!prompt) {
      console.error(`${b.red('Error:')} Loop mode requires a prompt. Example: beurre -p "Check tests" --loop`);
      process.exit(1);
    }
    const agent = new BeurreAgent({ model: selectedModel });
    const runner = new BeurreLoopRunner();
    await runner.start(agent, prompt, { maxIterations });
    return;
  }

  // If single headless prompt
  if (prompt) {
    const agent = new BeurreAgent({ model: selectedModel });
    console.log(`${b.gold('🧈 Beurre')} ${b.dim(`[${agent.getModel()}]`)}: Running task...`);

    const spinner = new ButterSpinner();
    spinner.start('Thinking...');
    let hasTokens = false;

    let lastReasonUpdate = 0;
    try {
      await agent.runTurn(prompt, {
        onStatus: (st) => spinner.update(st),
        onToken: (tok) => {
          if (!hasTokens) {
            spinner.stop();
            hasTokens = true;
            process.stdout.write(`${b.gold('🧈')} `);
          }
          process.stdout.write(tok);
        },
        onReasoning: (reasoning) => {
          const now = Date.now();
          if (!hasTokens && now - lastReasonUpdate > 300) {
            lastReasonUpdate = now;
            spinner.update(`Thinking (${reasoning.slice(-30).trim()})...`);
          }
        },
        onToolStart: (name, args) => {
          if (hasTokens) {
            console.log();
            hasTokens = false;
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
      process.exit(1);
    }

    if (hasTokens) {
      console.log();
    } else {
      spinner.stop();
    }

    console.log(`\n${b.green('🧈 Task finished.')}`);
    return;
  }

  // Default: start interactive Butter REPL
  await startRepl(selectedModel);
}

main().catch((err) => {
  console.error(`${b.red('Fatal error:')} ${err.message}`);
  process.exit(1);
});
