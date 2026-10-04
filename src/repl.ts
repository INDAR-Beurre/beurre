import { BeurreAgent } from './agent.ts';
import { relay } from './relay.ts';
import { listSubagents, runNamedSubagent } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { showMenu } from './menu.ts';
import { openModelPicker } from './model-picker.ts';
import { BeurreEditor } from './editor.ts';
import { renderMarkdownBlock, formatThinkingBlock, StreamingMarkdownHighlighter } from './markdown.ts';
import {
  b,
  colors,
  banner,
  statusBar,
  ButterSpinner,
  formatClaudeToolCall,
  formatClaudeToolResult,
  renderErrorCard,
  renderToast,
} from './theme.ts';
import { SLASH_COMMANDS, getPredictiveMatches, formatPredictiveHints } from './predictive.ts';

export async function startRepl(initialModel?: string): Promise<void> {
  const agent = new BeurreAgent({ model: initialModel });
  const editor = new BeurreEditor(['/menu', '/models', '/subagents', '/loop', '/help']);

  // Initial banner
  console.clear();
  console.log(banner('1.0.0', agent.getModel(), agent.getCwd()));

  let totalTokensEstimate = 0;
  let activeAbortController: AbortController | null = null;
  let thinkingMode: 'expanded' | 'collapsed' | 'hidden' = 'expanded';
  let lastReasoning = '';

  // Graceful interrupt handling for active turns
  const onSigInt = () => {
    if (activeAbortController) {
      activeAbortController.abort();
      console.log(`\n${colors.butterMelt}🧈 Turn interrupted by user.${colors.reset}\n`);
    }
  };
  process.on('SIGINT', onSigInt);

  while (true) {
    const messages = agent.getMessages();
    const turnsCount = messages.filter((m) => m.role === 'user' || m.role === 'assistant').length;

    let rawInput = '';
    try {
      rawInput = await editor.readPrompt({
        model: agent.getModel(),
        cwd: agent.getCwd(),
        turns: turnsCount,
        tokens: totalTokensEstimate,
      });
    } catch {
      break;
    }

    const trimmed = rawInput.trim();
    if (!trimmed) {
      continue;
    }

    // Handle Slash Commands
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.split(' ');
      const rest = args.join(' ').trim();

      if (cmd === '/') {
        console.log('\n' + formatPredictiveHints(SLASH_COMMANDS) + '\n');
        continue;
      }

      switch (cmd.toLowerCase()) {
        case '/menu': {
          await showMenu(agent, undefined, {
            thinkingMode,
            onToggleThinking: (mode) => {
              thinkingMode = mode;
            },
          });
          break;
        }

        case '/models':
        case '/model': {
          if (!rest) {
            await openModelPicker(agent.getModel(), (newModel) => {
              agent.setModel(newModel);
            });
          } else {
            agent.setModel(rest);
            console.log(`\n${renderToast(`Model switched to: ${rest}`, true)}\n`);
          }
          break;
        }

        case '/think':
        case '/thinking': {
          if (!rest) {
            if (lastReasoning) {
              console.log('\n' + formatThinkingBlock(lastReasoning, false) + '\n');
            } else {
              thinkingMode = thinkingMode === 'expanded' ? 'collapsed' : 'expanded';
              console.log(`\n${renderToast(`Thinking block display set to: ${thinkingMode}`, true)}\n`);
            }
          } else {
            const mode = rest.toLowerCase();
            if (mode.startsWith('exp')) {
              thinkingMode = 'expanded';
              console.log(`\n${renderToast('Thinking block mode set to: expanded (full card)', true)}\n`);
            } else if (mode.startsWith('col')) {
              thinkingMode = 'collapsed';
              console.log(`\n${renderToast('Thinking block mode set to: collapsed (one-line summary)', true)}\n`);
            } else if (mode.startsWith('hid') || mode === 'off') {
              thinkingMode = 'hidden';
              console.log(`\n${renderToast('Thinking block mode set to: hidden', true)}\n`);
            } else if (mode === 'show' || mode === 'last') {
              if (lastReasoning) {
                console.log('\n' + formatThinkingBlock(lastReasoning, false) + '\n');
              } else {
                console.log(`\n${b.dim('No prior reasoning trace recorded in this session.')}\n`);
              }
            } else {
              console.log(`\n${b.red('Usage:')} /think [expand|collapse|hide|show]\n`);
            }
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
            console.log();
          } catch (err: any) {
            spinner.stop();
            console.log(renderErrorCard('Relay Providers Error', err.message));
          }
          break;
        }

        case '/subagents': {
          console.log(`\n${b.gold('🧈 NATIVE NAMED SUBAGENTS')} (Each with designated persona & model ID):\n`);
          const subs = listSubagents();
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
            console.log(`\n${b.red('Usage:')} /subagent <name> <task>\n`);
          } else {
            const spinner = new ButterSpinner();
            spinner.start(`Dispatching to subagent ${subName}...`);
            try {
              const result = await runNamedSubagent(subName, task, agent.getCwd());
              spinner.stop();
              console.log(`\n${b.subagentBadge(result.subagentName)} ${b.dim(`[Model: ${result.modelId} | Turns: ${result.turns}]`)}`);
              console.log(renderMarkdownBlock(result.summary));
              console.log();
            } catch (err: any) {
              spinner.stop();
              console.log(renderErrorCard('Subagent Execution Error', err.message));
            }
          }
          break;
        }

        case '/loop': {
          if (!rest) {
            console.log(`\n${b.red('Usage:')} /loop <prompt to repeat>\n`);
          } else {
            const runner = new BeurreLoopRunner();
            await runner.start(agent, rest);
          }
          break;
        }

        case '/compact': {
          const before = agent.getMessages().length;
          const compacted = compactMessages(agent.getMessages(), {
            iteration: 1,
            isLoop: false,
          });
          agent.setMessages(compacted);
          const after = agent.getMessages().length;
          console.log(`\n${renderToast(`Context compacted: ${before} turns → ${after} turns`, true)}\n`);
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
            console.log(`\n${renderToast('Synced session to https://relay-gw.pages.dev', true)}\n`);
          } else {
            console.log(`\n${b.dim('Session recorded locally (web sync response was quiet).')}\n`);
          }
          break;
        }

        case '/history': {
          const msgs = agent.getMessages();
          console.log(`\n${b.bold('Session ID:')}     ${b.gold(agent.getSessionId())}`);
          console.log(`  ${b.bold('Active Model:')}   ${b.gold(agent.getModel())}`);
          console.log(`  ${b.bold('Total Messages:')} ${b.gold(msgs.length)}`);
          console.log(`  ${b.bold('Est. Tokens:')}    ${b.gold(totalTokensEstimate)}\n`);
          break;
        }

        case '/clear': {
          console.clear();
          console.log(banner('1.0.0', agent.getModel(), agent.getCwd()));
          break;
        }

        case '/help': {
          console.log('\n' + formatPredictiveHints(SLASH_COMMANDS) + '\n');
          break;
        }

        case '/exit':
        case '/quit': {
          console.log(`\n${b.melt('🧈 Au revoir!')}\n`);
          process.off('SIGINT', onSigInt);
          process.exit(0);
          break;
        }

        default: {
          console.log(`\n${b.red('Unknown command:')} ${cmd}. Type ${b.gold('/menu')} or ${b.gold('/help')} for options.\n`);
        }
      }
      continue;
    }

    // Normal Turn Execution with Streaming, Thinking Blocks, Diffs & Clean Error Recovery
    console.log(`\n${colors.butterGold}${colors.bold}🧈 you${colors.reset} ${colors.dim}❯${colors.reset} ${colors.butterCream}${trimmed}${colors.reset}\n`);

    activeAbortController = new AbortController();
    const spinner = new ButterSpinner();
    spinner.start('Whipping up solution...');

    let accumulatedResponse = '';
    let accumulatedReasoning = '';
    let thinkingBlockRendered = false;
    let hasStartedTokenStream = false;
    let thinkingStartTime = Date.now();
    let toolStartTime = 0;

    const streamHighlighter = new StreamingMarkdownHighlighter();

    const renderThinkingIfNeeded = () => {
      if (accumulatedReasoning && !thinkingBlockRendered && thinkingMode !== 'hidden') {
        spinner.stop();
        const isCollapsed = thinkingMode === 'collapsed';
        const elapsed = ((Date.now() - thinkingStartTime) / 1000).toFixed(1) + 's';
        console.log('\n' + formatThinkingBlock(accumulatedReasoning, isCollapsed, undefined, elapsed));
        thinkingBlockRendered = true;
        lastReasoning = accumulatedReasoning;
      }
    };

    try {
      await agent.runTurn(
        trimmed,
        {
          onStatus: (st) => spinner.update(st),
          onReasoning: (res) => {
            accumulatedReasoning += res;
            lastReasoning = accumulatedReasoning;
            if (!hasStartedTokenStream) {
              const elapsed = ((Date.now() - thinkingStartTime) / 1000).toFixed(1);
              const tokenEst = Math.round(accumulatedReasoning.length / 4);
              spinner.update(`Thinking (~${tokenEst} tokens • ${elapsed}s)...`);
            }
          },
          onToken: (tok) => {
            if (!hasStartedTokenStream) {
              spinner.stop();
              renderThinkingIfNeeded();
              hasStartedTokenStream = true;
              process.stdout.write(`${colors.butterGold}${colors.bold}🧈 beurre${colors.reset} ${colors.dim}❯${colors.reset} `);
            }
            accumulatedResponse += tok;
            streamHighlighter.feed(tok);
          },
          onToolStart: (name, args) => {
            if (hasStartedTokenStream) {
              streamHighlighter.flush();
              console.log();
              hasStartedTokenStream = false;
            }
            spinner.stop();
            renderThinkingIfNeeded();
            toolStartTime = Date.now();
            console.log(`\n${formatClaudeToolCall(name, args)}`);
            spinner.start(`Executing ${name}...`);
          },
          onToolEnd: (name, output, isError, diff) => {
            const elapsedMs = toolStartTime > 0 ? Date.now() - toolStartTime : 0;
            spinner.stop();
            if (diff) {
              console.log('\n' + diff);
            } else {
              console.log(formatClaudeToolResult(output, isError, elapsedMs));
            }
          },
        },
        activeAbortController.signal
      );

      // Finalize thinking block if it hadn't triggered yet
      renderThinkingIfNeeded();

      // Estimate tokens
      totalTokensEstimate += Math.round((trimmed.length + accumulatedResponse.length + accumulatedReasoning.length) / 4);

      if (hasStartedTokenStream) {
        streamHighlighter.flush();
        console.log('\n');
      } else {
        spinner.stop();
      }
    } catch (err: any) {
      spinner.stop();
      if (!activeAbortController.signal.aborted) {
        console.log(renderErrorCard('Relay Gateway / Inference Error', err.message));
      }
    } finally {
      activeAbortController = null;
    }
  }
}
