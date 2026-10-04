import { BeurreAgent } from './agent.ts';
import { compactMessages } from './compact.ts';
import { b, colors, ButterSpinner } from './theme.ts';

export interface LoopOptions {
  delayMs?: number;
  maxIterations?: number;
}

export class BeurreLoopRunner {
  private isRunning = false;
  private currentIteration = 0;
  private abortController: AbortController | null = null;

  async start(agent: BeurreAgent, prompt: string, options: LoopOptions = {}): Promise<void> {
    const delay = options.delayMs ?? 1000;
    const max = options.maxIterations ?? Infinity;

    this.isRunning = true;
    this.currentIteration = 0;
    this.abortController = new AbortController();

    const spinner = new ButterSpinner();

    const onSigInt = () => {
      console.log(`\n${b.melt('🧈')} ${b.gold('Loop interrupted by user (Ctrl+C). Saving butter state and stopping...')}`);
      this.stop();
      process.exit(0);
    };

    process.on('SIGINT', onSigInt);

    console.log(`\n${colors.bgButterMelt}${colors.bold} 🧈 BEURRE PROMPT LOOP STARTED ${colors.reset}`);
    console.log(`${b.cream('Repeating prompt:')} ${b.gold(prompt)}`);
    console.log(`${b.dim('Loop will repeat indefinitely until Ctrl+C. Context auto-compacts each turn.')}\n`);

    try {
      while (this.isRunning && this.currentIteration < max) {
        this.currentIteration++;

        const iterHeader = `🧈 ─── [Loop Iteration #${this.currentIteration}] ──────────────────────────────────────────`;
        console.log(`\n${b.gold(iterHeader)}`);

        // Run turn
        spinner.start(`Iteration #${this.currentIteration} executing...`);
        let hasTokens = false;
        let lastReasonUpdate = 0;

        try {
          await agent.runTurn(
            prompt,
            {
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
            },
            this.abortController.signal
          );
        } catch (err: any) {
          spinner.stop();
          if (this.abortController.signal.aborted) break;
          console.error(`\n${b.red('Error in loop turn:')} ${err.message}`);
        }

        if (hasTokens) {
          console.log();
        } else {
          spinner.stop();
        }

        console.log(`\n${b.green('🧈 Iteration #' + this.currentIteration + ' finished.')}`);

        if (!this.isRunning) break;

        // Perform Butter Melt Context Compaction
        const beforeCount = agent.getMessages().length;
        const compacted = compactMessages(agent.getMessages(), {
          iteration: this.currentIteration,
          prompt,
        });
        agent.setMessages(compacted);
        const afterCount = agent.getMessages().length;

        console.log(
          `${b.melt('🧈 Butter Melt Compactor:')} Message turns condensed from ${b.gold(beforeCount)} -> ${b.gold(afterCount)} (Memory preserved).`
        );

        if (this.currentIteration < max && this.isRunning) {
          console.log(`${b.dim(`Resting ${delay}ms before next iteration... (Press Ctrl+C to stop)`)}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    } finally {
      process.off('SIGINT', onSigInt);
      this.isRunning = false;
    }
  }

  stop() {
    this.isRunning = false;
    this.abortController?.abort();
  }
}
