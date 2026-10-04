import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { BeurreAgent } from './agent.ts';
import { relay, getModelDisplayName } from './relay.ts';
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
  formatUserMessageCard,
  formatAgentHeader,
  renderErrorCard,
  renderToast,
} from './theme.ts';
import { SLASH_COMMANDS, getPredictiveMatches, formatPredictiveHints } from './predictive.ts';

export function copyToClipboard(text: string): boolean {
  try {
    const base64 = Buffer.from(text, 'utf-8').toString('base64');
    process.stdout.write(`\x1b]52;c;${base64}\x07`);
  } catch {
    // ignore
  }

  try {
    if (process.platform === 'linux') {
      if (process.env.WAYLAND_DISPLAY) {
        spawnSync('wl-copy', [], { input: text });
        return true;
      }
      spawnSync('xclip', ['-selection', 'clipboard'], { input: text });
      return true;
    } else if (process.platform === 'darwin') {
      spawnSync('pbcopy', [], { input: text });
      return true;
    } else if (process.platform === 'win32') {
      spawnSync('clip', [], { input: text });
      return true;
    }
  } catch {
    // ignore
  }
  return true;
}

export async function startRepl(initialModel?: string): Promise<void> {
  const agent = new BeurreAgent({ model: initialModel });
  const editor = new BeurreEditor(['/menu', '/models', '/effort', '/copy', '/diff', '/subagents', '/loop', '/help']);

  // Initial banner
  console.clear();
  console.log(banner('1.0.0', agent.getModel(), agent.getCwd(), agent.getEffort()));

  let totalTokensEstimate = 0;
  let activeAbortController: AbortController | null = null;
  let thinkingMode: 'expanded' | 'collapsed' | 'hidden' = 'expanded';
  let lastReasoning = '';
  let lastAssistantResponse = '';

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

        case '/effort': {
          if (!rest) {
            console.log(`\n${b.bold('Active Reasoning Effort:')} ${b.badge(agent.getEffort().toUpperCase())}`);
            console.log(`  ${colors.dim}Available efforts: max, xhigh, high, medium, low${colors.reset}`);
            console.log(`  ${colors.dim}Usage: /effort <max|high|medium|low>${colors.reset}\n`);
          } else {
            const valid = ['max', 'xhigh', 'high', 'medium', 'low'];
            const chosen = rest.toLowerCase();
            if (!valid.includes(chosen)) {
              console.log(`\n${b.red('Invalid effort:')} "${rest}". Choose from: ${valid.join(', ')}\n`);
            } else {
              agent.setEffort(chosen);
              console.log(`\n${renderToast(`Reasoning effort set to: ${chosen.toUpperCase()}`, true)}\n`);
            }
          }
          break;
        }

        case '/copy': {
          if (!lastAssistantResponse) {
            console.log(`\n${renderToast('No assistant response to copy yet in this session.', false)}\n`);
          } else {
            copyToClipboard(lastAssistantResponse);
            console.log(`\n${renderToast('Last assistant response copied to clipboard!', true)}\n`);
          }
          break;
        }

        case '/diff': {
          try {
            const diffOutput = execSync('git diff HEAD 2>/dev/null', {
              cwd: agent.getCwd(),
              encoding: 'utf-8',
              timeout: 5000,
            }).trim();
            if (!diffOutput) {
              console.log(`\n${renderToast('No git changes in working tree (clean repository)', true)}\n`);
            } else {
              console.log(`\n${colors.bold}${colors.butterGold}🧈 Git Working Tree Diff:${colors.reset}\n`);
              const highlighted = diffOutput.split('\n').map((line) => {
                if (line.startsWith('+++') || line.startsWith('---')) return `${colors.dim}${line}${colors.reset}`;
                if (line.startsWith('+')) return `${colors.green}${line}${colors.reset}`;
                if (line.startsWith('-')) return `${colors.red}${line}${colors.reset}`;
                if (line.startsWith('@@')) return `${colors.cyan}${line}${colors.reset}`;
                return `${colors.gray}${line}${colors.reset}`;
              }).join('\n');
              console.log(highlighted + '\n');
            }
          } catch (err: any) {
            console.log(renderErrorCard('Git Diff Error', err.message));
          }
          break;
        }

        case '/export': {
          const defaultPath = path.join(agent.getCwd(), `beurre-session-${new Date().toISOString().slice(0, 10)}.md`);
          const exportPath = rest ? path.resolve(agent.getCwd(), rest) : defaultPath;
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
              mdLines.push(`> **Tool Result (${m.name || 'tool'})**:\n\`\`\`\n${m.content.slice(0, 500)}\n\`\`\`\n`);
            }
          }
          try {
            fs.writeFileSync(exportPath, mdLines.join('\n'), 'utf-8');
            console.log(`\n${renderToast(`Session exported successfully to: ${exportPath}`, true)}\n`);
          } catch (err: any) {
            console.log(renderErrorCard('Export Error', err.message));
          }
          break;
        }

        case '/usage': {
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
          const modelName = getModelDisplayName(agent.getModel());
          console.log(`\n${colors.butterGold}╭── 🧈 Session Usage & Context Breakdown ────────────────────────╮${colors.reset}`);
          console.log(`  ${b.bold('Active Model:')}     ${b.cream(modelName)} ${b.dim(`(${agent.getModel()})`)}`);
          console.log(`  ${b.bold('Reasoning Effort:')} ${b.gold(agent.getEffort().toUpperCase())}`);
          console.log(`  ${b.bold('Session Messages:')} ${b.cream(msgs.length)} turns`);
          console.log(`  ${b.bold('Estimated Tokens:')} ${b.gold(`~${totalEstTokens.toLocaleString()} tokens`)}`);
          console.log(`  ${b.bold('Message Ratio:')}    ${b.dim(`User: ~${Math.round(userChars/4)} tok • Assistant: ~${Math.round(assistantChars/4)} tok • Tools: ~${Math.round(toolChars/4)} tok`)}`);
          console.log(`  ${b.bold('Relay Status:')}     ${b.green('● LIVE (relay-gw.pages.dev)')}`);
          console.log(`${colors.butterGold}╰────────────────────────────────────────────────────────────────╯${colors.reset}\n`);
          break;
        }

        case '/undo': {
          const msgs = agent.getMessages();
          let lastUserIdx = -1;
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'user') {
              lastUserIdx = i;
              break;
            }
          }
          if (lastUserIdx === -1) {
            console.log(`\n${renderToast('No user interaction turns to undo.', false)}\n`);
          } else {
            const removedCount = msgs.length - lastUserIdx;
            agent.setMessages(msgs.slice(0, lastUserIdx));
            console.log(`\n${renderToast(`Reverted last turn (${removedCount} messages removed)`, true)}\n`);
          }
          break;
        }

        case '/history': {
          const msgs = agent.getMessages();
          const modelName = getModelDisplayName(agent.getModel());
          console.log(`\n${b.bold('Session ID:')}     ${b.gold(agent.getSessionId())}`);
          console.log(`  ${b.bold('Active Model:')}   ${b.gold(modelName)} ${b.dim(`(${agent.getModel()})`)}`);
          console.log(`  ${b.bold('Effort Level:')}   ${b.gold(agent.getEffort().toUpperCase())}`);
          console.log(`  ${b.bold('Total Messages:')} ${b.gold(msgs.length)}`);
          console.log(`  ${b.bold('Est. Tokens:')}    ${b.gold(totalTokensEstimate)}\n`);
          break;
        }

        case '/clear': {
          console.clear();
          console.log(banner('1.0.0', agent.getModel(), agent.getCwd(), agent.getEffort()));
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
    console.log(formatUserMessageCard(trimmed));

    activeAbortController = new AbortController();
    const spinner = new ButterSpinner();
    spinner.start('Whipping up solution...');

    let accumulatedResponse = '';
    let accumulatedReasoning = '';
    let thinkingBlockRendered = false;
    let hasStartedTokenStream = false;
    let thinkingStartTime = Date.now();
    let firstTokenTime = 0;
    let streamedTokenCount = 0;
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
            if (!firstTokenTime) {
              firstTokenTime = Date.now();
            }
            streamedTokenCount++;
            if (!hasStartedTokenStream) {
              spinner.stop();
              renderThinkingIfNeeded();
              hasStartedTokenStream = true;
              process.stdout.write(formatAgentHeader(agent.getModel(), agent.getEffort()));
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

      // Estimate tokens & save response for /copy
      totalTokensEstimate += Math.round((trimmed.length + accumulatedResponse.length + accumulatedReasoning.length) / 4);
      lastAssistantResponse = accumulatedResponse;

      if (hasStartedTokenStream) {
        streamHighlighter.flush();
        const durationSec = firstTokenTime > 0 ? (Date.now() - firstTokenTime) / 1000 : 0;
        const tokPerSec = durationSec > 0 ? (streamedTokenCount / durationSec) : 0;
        const speedBadge = durationSec > 0
          ? ` ${colors.dim}[${tokPerSec.toFixed(1)} tok/s • ~${streamedTokenCount} tokens • ${durationSec.toFixed(1)}s]${colors.reset}`
          : '';
        console.log(`\n${speedBadge}\n`);
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
