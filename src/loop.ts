import { BeurreAgent } from './agent.ts';
import { compactMessages } from './compact.ts';
import { formatThinkingBlock, StreamingMarkdownHighlighter } from './markdown.ts';
import { b, colors, ButterSpinner, BeurreWorkingBar, formatClaudeToolCall, formatClaudeToolResult, formatUserMessageCard } from './theme.ts';

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

    let activeWorkingBar: BeurreWorkingBar | null = null;

    const onSigInt = () => {
      activeWorkingBar?.stop();
      console.log(`\n${b.gold('Loop interrupted by user (Ctrl+C). Saving butter state and stopping...')}`);
      this.stop();
    };

    process.on('SIGINT', onSigInt);

    console.log(`\n${colors.bgButterMelt}${colors.bold} BEURRE PROMPT LOOP STARTED ${colors.reset}`);
    console.log(`${b.cream('Repeating prompt:')} ${b.gold(prompt)}`);
    console.log(`${b.dim('Loop will repeat indefinitely until Ctrl+C. Context auto-compacts each turn.')}\n`);

    try {
      while (this.isRunning && this.currentIteration < max) {
        this.currentIteration++;

        const iterHeader = `[Loop Iteration #${this.currentIteration}]`;
        console.log(`\n${b.gold(iterHeader)}`);

        let hasTokens = false;
        let accumulatedReasoning = '';
        let thinkingRendered = false;
        let workingBar: BeurreWorkingBar;

        const streamHighlighter = new StreamingMarkdownHighlighter({
          onWrite: (chunk) => workingBar.writeAbove(chunk),
        });

        // Run turn with anchored working prompt bar
        workingBar = new BeurreWorkingBar({
          model: agent.getModel(),
          effort: agent.getEffort(),
          cwd: agent.getCwd(),
          turns: this.currentIteration,
          onSteer: (message: string) => {
            if (hasTokens) {
              streamHighlighter.flush();
              workingBar.writeAbove('\n');
              hasTokens = false;
            }
            workingBar.writeAbove(formatUserMessageCard(message));
            accumulatedReasoning = '';
            thinkingRendered = false;
            agent.steer(message);
          },
          onCycleEffort: (newEffort: string) => {
            agent.setEffort(newEffort);
          },
          onCancel: () => {
            this.abortController?.abort();
          },
        });
        activeWorkingBar = workingBar;
        workingBar.start(`Iteration #${this.currentIteration} executing...`);

        const renderThinkingIfNeeded = () => {
          if (accumulatedReasoning && !thinkingRendered) {
            const block = formatThinkingBlock(accumulatedReasoning);
            workingBar.writeAbove('\n' + block + '\n');
            thinkingRendered = true;
          }
        };

        try {
          await agent.runTurn(
            prompt,
            {
              onStatus: (st) => workingBar.update(st),
              onReasoning: (reasoning) => {
                accumulatedReasoning += reasoning;
                if (!hasTokens) {
                  const tokenEst = Math.round(accumulatedReasoning.length / 4);
                  const snippet = accumulatedReasoning.trim().replace(/\s+/g, ' ').slice(0, 35);
                  workingBar.setThinking(tokenEst, 0, snippet);
                }
              },
              onToken: (tok) => {
                if (!hasTokens) {
                  renderThinkingIfNeeded();
                  hasTokens = true;
                  workingBar.writeAbove('\n');
                }
                streamHighlighter.feed(tok);
              },
              onToolStart: (name, args) => {
                if (hasTokens) {
                  streamHighlighter.flush();
                  workingBar.writeAbove('\n');
                  hasTokens = false;
                }
                renderThinkingIfNeeded();
                workingBar.writeAbove(`\n${formatClaudeToolCall(name, args)}\n`);
                workingBar.setTool(name, args);
              },
              onToolEnd: (name, output, isError, diff) => {
                if (diff) {
                  workingBar.writeAbove('\n' + diff + '\n');
                } else {
                  workingBar.writeAbove(formatClaudeToolResult(output, isError) + '\n');
                }
                workingBar.update(`Iteration #${this.currentIteration} executing...`);
              },
            },
            this.abortController.signal
          );
        } catch (err: any) {
          workingBar.stop();
          if (this.abortController.signal.aborted) break;
          console.error(`\n${b.red('Error in loop turn:')} ${err.message}`);
        }

        renderThinkingIfNeeded();
        if (hasTokens) {
          streamHighlighter.flush();
          workingBar.stop();
          console.log();
        } else {
          workingBar.stop();
        }
        activeWorkingBar = null;

        console.log(`\n${b.green('Iteration #' + this.currentIteration + ' finished.')}`);

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
          `${b.melt('Butter Melt Compactor:')} Message turns condensed from ${b.gold(beforeCount)} -> ${b.gold(afterCount)} (Memory preserved).`
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
