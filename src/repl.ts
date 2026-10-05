import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { BeurreAgent } from './agent.ts';
import { relay, getModelDisplayName, type ChatMessage } from './relay.ts';
import { listSubagents, runNamedSubagent } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { showMenu } from './menu.ts';
import { openModelPicker } from './model-picker.ts';
import { BeurreEditor } from './editor.ts';
import { renderMarkdownBlock, formatThinkingBlock, StreamingMarkdownHighlighter } from './markdown.ts';
import { box, termWidth } from './layout.ts';
import {
  b,
  colors,
  banner,
  ButterSpinner,
  BeurreWorkingBar,
  formatClaudeToolCall,
  formatClaudeToolResult,
  formatUserMessageCard,
  formatAgentHeader,
  renderErrorCard,
  renderToast,
} from './theme.ts';
import { SLASH_COMMANDS, getPredictiveMatches, formatPredictiveHints } from './predictive.ts';
import {
  fetchWhoami,
  fetchTokenUsage,
  formatTokenProgressBar,
  saveCloudSession,
  listCloudSessions,
  resumeCloudSession,
  loginToRelay,
  logoutFromRelay,
  type AuthUser,
} from './auth.ts';
import {
  buildInitPrompt,
  computeStats,
  contentWidth,
  detectTestCommand,
  listCheckpoints,
  listSnippets,
  loadCheckpoint,
  outlineFile,
  renderCheckpoints,
  renderDoctor,
  renderEnv,
  renderGrep,
  renderTestResult,
  grepWorkspace as grepWorkspaceSafe,
  renderOutline,
  renderSnippets,
  renderStats,
  renderToolCatalog,
  runDoctor,
  runTestCommand,
  saveCheckpoint,
  saveSnippet,
  removeSnippet,
  isFirstRun,
  markOnboarded,
  renderWelcome,
} from './features.ts';

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

  // First launch only: show the welcome panel once so a newcomer knows how to
  // start, then never again — repeat chrome is what makes a tool feel broken.
  if (isFirstRun()) {
    console.log(renderWelcome(contentWidth()).join('\n') + '\n');
    markOnboarded();
  }

  let totalTokensEstimate = 0;
  let activeAbortController: AbortController | null = null;
  let thinkingMode: 'expanded' | 'collapsed' | 'hidden' = 'expanded';
  let lastReasoning = '';
  let lastAssistantResponse = '';

  // Load active authenticated user & token quota
  let currentUser: AuthUser = await fetchWhoami();
  let dailyTokensUsed = 0;
  try {
    const usage = await fetchTokenUsage();
    dailyTokensUsed = usage.dailyTokensUsed;
  } catch {}

  const formatTokens = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(0) + 'k';
    return num.toString();
  };

  let activeWorkingBar: BeurreWorkingBar | null = null;

  // Graceful interrupt handling for active turns
  const onSigInt = () => {
    if (activeAbortController) {
      activeAbortController.abort();
      if (activeWorkingBar) {
        activeWorkingBar.stop();
      }
      console.log(`\n${colors.butterMelt}Turn interrupted by user.${colors.reset}\n`);
    }
  };
  process.on('SIGINT', onSigInt);

  while (true) {
    const messages = agent.getMessages();
    const turnsCount = messages.filter((m) => m.role === 'user' || m.role === 'assistant').length;

    const quotaText = currentUser.role === 'admin'
      ? '∞'
      : `${formatTokens(dailyTokensUsed)} / 50M`;

    let rawInput = '';
    try {
      rawInput = await editor.readPrompt({
        model: agent.getModel(),
        cwd: agent.getCwd(),
        turns: turnsCount,
        tokens: totalTokensEstimate,
        effort: agent.getEffort(),
        quotaText,
        user: currentUser.name,
        onCycleEffort: (newEffort) => {
          agent.setEffort(newEffort);
        },
      });
    } catch {
      break;
    }

    let trimmed = rawInput.trim();
    if (!trimmed) {
      continue;
    }

    // A slash command can synthesise a prompt to run (e.g. /init).
    let runTurn: string | null = null;

    // Handle Slash Commands
    if (trimmed.startsWith('/')) {
      const [cmd, ...args] = trimmed.split(' ');
      const rest = args.join(' ').trim();

      if (cmd === '/') {
        console.log('\n' + formatPredictiveHints(SLASH_COMMANDS) + '\n');
        continue;
      }

      switch (cmd.toLowerCase()) {
        case '/new': {
          const newId = agent.resetSession(rest || undefined);
          totalTokensEstimate = 0;
          lastReasoning = '';
          lastAssistantResponse = '';
          console.clear();
          console.log(banner('1.0.0', agent.getModel(), agent.getCwd(), agent.getEffort()));
          console.log(`\n${renderToast(`Started new session: ${newId} (bound to ${getModelDisplayName(agent.getModel())})`, true)}\n`);
          saveCloudSession({
            id: agent.getSessionId(),
            title: 'New Session',
            model: agent.getModel(),
            history: agent.getMessages(),
          }).catch(() => {});
          break;
        }

        case '/sessions': {
          const spinner = new ButterSpinner();
          spinner.start('Fetching cloud sessions from Supabase...');
          try {
            const sessions = await listCloudSessions();
            spinner.stop();
            if (sessions.length === 0) {
              console.log(`\n${renderToast('No saved cloud sessions found in Supabase.', true)}\n`);
            } else {
              console.log(`\n${colors.bold}${colors.butterGold}SUPABASE CLOUD SESSIONS${colors.reset} (${sessions.length} sessions across devices):\n`);
              for (const s of sessions.slice(0, 15)) {
                const isActive = s.id === agent.getSessionId();
                const activeBadge = isActive ? ` ${colors.bold}${colors.green}[ACTIVE]${colors.reset}` : '';
                const dateStr = new Date(s.at).toLocaleString();
                const dispModel = getModelDisplayName(s.model);
                console.log(`  ${colors.butterGold}●${colors.reset} ${colors.bold}${s.id}${colors.reset}${activeBadge}`);
                console.log(`    ${colors.butterCream}${s.title}${colors.reset}`);
                console.log(`    ${colors.dim}Model: ${dispModel} (${s.model}) • Turns: ${s.history?.length || 0} • Last active: ${dateStr}${colors.reset}`);
                console.log(`    ${colors.dim}Resume: /resume ${s.id}${colors.reset}\n`);
              }
            }
          } catch (err: any) {
            spinner.stop();
            console.log(renderErrorCard('Cloud Sessions Error', err.message));
          }
          break;
        }

        case '/resume': {
          if (!rest) {
            console.log(`\n${b.red('Usage:')} /resume <session_id>\n${colors.dim}Tip: Run /sessions to view your available cloud sessions.${colors.reset}\n`);
          } else {
            const spinner = new ButterSpinner();
            spinner.start(`Resuming session ${rest} from Supabase...`);
            const result = await resumeCloudSession(rest);
            spinner.stop();
            if (result.error || !result.session) {
              console.log(`\n${renderErrorCard('Resume Failed', result.error || 'Session not found')}\n`);
            } else {
              const sess = result.session;
              agent.setSessionId(sess.id);
              if (sess.model) {
                agent.setModel(sess.model);
              }
              const systemMsg = agent.getMessages().find((m) => m.role === 'system');
              const restoredHistory = sess.history && sess.history.length > 0 ? sess.history : [];
              const finalMessages = systemMsg
                ? [systemMsg, ...restoredHistory.filter((m: any) => m.role !== 'system')]
                : restoredHistory;
              agent.setMessages(finalMessages as any);
              // Seed the counter from resumed history so usage stays monotonic.
              // Only the transcript counts — the system prompt is re-sent every
              // turn and is not a per-session cost.
              totalTokensEstimate = Math.round(
                restoredHistory.reduce((acc: number, m: ChatMessage) => acc + (m.content?.length || 0), 0) / 4,
              );
              console.log(`\n${renderToast(`Resumed cloud session "${sess.title}" (${sess.id}) bound to ${getModelDisplayName(agent.getModel())}`, true)}\n`);
            }
          }
          break;
        }

        case '/whoami': {
          const spinner = new ButterSpinner();
          spinner.start('Fetching active account details...');
          try {
            const user = await fetchWhoami();
            currentUser = user;
            const usage = await fetchTokenUsage();
            dailyTokensUsed = usage.dailyTokensUsed;
            spinner.stop();
            console.log('\n' + box({
              title: 'Active Account Profile',
              width: Math.min(termWidth(), 80),
              lines: [
                `${b.bold('Account:')}       ${b.cream(user.name)}`,
                `${b.bold('Role Tier:')}     ${user.role === 'admin' ? b.gold('ADMIN (Unlimited)') : b.cream('STANDARD (50M Daily Limit)')}`,
                `${b.bold('Storage:')}       ${b.green('Supabase Postgres (relay_chats)')}`,
                `${b.bold('Daily Tokens:')}  ${usage.isUnlimited ? '∞ Unlimited' : `${usage.dailyTokensUsed.toLocaleString()} / 50,000,000`}`,
                `${b.bold('Quota Bar:')}     ${formatTokenProgressBar(usage.dailyTokensUsed, usage.dailyLimit)}`,
              ],
            }).join('\n') + '\n');
          } catch (err: any) {
            spinner.stop();
            console.log(renderErrorCard('Account Error', err.message));
          }
          break;
        }

        case '/quota': {
          const spinner = new ButterSpinner();
          spinner.start('Checking daily token quota against 50M limit...');
          try {
            const usage = await fetchTokenUsage();
            dailyTokensUsed = usage.dailyTokensUsed;
            spinner.stop();
            console.log('\n' + box({
              title: 'Daily Token Quota (50M Limit)',
              width: Math.min(termWidth(), 80),
              lines: [
                `${b.bold('Account:')}       ${b.cream(usage.account)} (${usage.role.toUpperCase()})`,
                `${b.bold('Today Used:')}    ${b.gold(usage.dailyTokensUsed.toLocaleString())} tokens`,
                `${b.bold('Daily Limit:')}   ${usage.isUnlimited ? b.green('∞ Unlimited (Admin Tier)') : b.cream('50,000,000 tokens')}`,
                ...(!usage.isUnlimited ? [`${b.bold('Remaining:')}    ${b.green((usage.remainingTokens || 0).toLocaleString())} tokens`] : []),
                `${b.bold('Progress:')}     ${formatTokenProgressBar(usage.dailyTokensUsed, usage.dailyLimit)}`,
                `${b.bold('Weekly Used:')}   ${usage.weeklyTokensUsed.toLocaleString()} tokens`,
                `${b.bold('All-Time:')}      ${usage.allTimeTokensUsed.toLocaleString()} tokens`,
              ],
            }).join('\n') + '\n');
          } catch (err: any) {
            spinner.stop();
            console.log(renderErrorCard('Quota Error', err.message));
          }
          break;
        }

        case '/login': {
          let [username, password] = rest.split(' ');
          if (!username || !password) {
            console.log(`\n${b.gold('Sign in to Relay / Supabase account:')}`);
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            username = await new Promise<string>((res) => rl.question(`  ${b.bold('Username:')} `, (ans) => res(ans.trim())));
            password = await new Promise<string>((res) => rl.question(`  ${b.bold('Password:')} `, (ans) => { rl.close(); res(ans.trim()); }));
          }
          if (!username || !password) {
            console.log(`\n${b.red('Login aborted: username and password required.')}\n`);
            break;
          }
          const spinner = new ButterSpinner();
          spinner.start(`Logging in as ${username}...`);
          const result = await loginToRelay(username, password);
          spinner.stop();
          if (result.ok && result.user) {
            currentUser = result.user;
            console.log(`\n${renderToast(`Logged in successfully as ${result.user.name} (${result.user.role})!`, true)}\n`);
          } else {
            console.log(`\n${renderErrorCard('Login Failed', result.error || 'Invalid credentials')}\n`);
          }
          break;
        }

        case '/logout': {
          await logoutFromRelay();
          currentUser = { name: 'anonymous', role: 'user' };
          console.log(`\n${renderToast('Logged out. Cleared local credentials.', true)}\n`);
          break;
        }

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
            console.log(`\n${b.gold('UPSTREAM PROVIDERS')} (${provs.length} configured):\n`);
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
          console.log(`\n${b.gold('NATIVE NAMED SUBAGENTS')} (Each with designated persona & model ID):\n`);
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
              console.log(`\n${colors.bold}${colors.butterGold}Git Working Tree Diff:${colors.reset}\n`);
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
            `# Beurre Session Export`,
            `_Session ID: ${agent.getSessionId()} | Model: ${getModelDisplayName(agent.getModel())} (${agent.getModel()}) | Effort: ${agent.getEffort()} | Exported: ${new Date().toLocaleString()}_`,
            '',
          ];
          for (const m of msgs) {
            if (m.role === 'system') continue;
            if (m.role === 'user') {
              mdLines.push(`## User\n\n${m.content}\n`);
            } else if (m.role === 'assistant') {
              mdLines.push(`## Beurre (${getModelDisplayName(agent.getModel())})\n\n${m.content}\n`);
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
          console.log('\n' + box({
            title: 'Session Usage & Context Breakdown',
            width: Math.min(termWidth(), 80),
            lines: [
              `${b.bold('Active Model:')}     ${b.cream(modelName)} ${b.dim(`(${agent.getModel()})`)}`,
              `${b.bold('Reasoning Effort:')} ${b.gold(agent.getEffort().toUpperCase())}`,
              `${b.bold('Session Messages:')} ${b.cream(msgs.length)} turns`,
              `${b.bold('Estimated Tokens:')} ${b.gold(`~${totalEstTokens.toLocaleString()} tokens`)}`,
              `${b.bold('Message Ratio:')}    ${b.dim(`User: ~${Math.round(userChars/4)} tok • Assistant: ~${Math.round(assistantChars/4)} tok • Tools: ~${Math.round(toolChars/4)} tok`)}`,
              `${b.bold('Relay Status:')}     ${b.green('● LIVE (relay-gw.pages.dev)')}`,
            ],
          }).join('\n') + '\n');
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

        case '/history':
        case '/stats': {
          console.log('\n' + renderStats(computeStats(agent.getMessages()), agent.getModel(), contentWidth()).join('\n') + '\n');
          break;
        }

        case '/doctor': {
          console.log('\n' + renderDoctor(runDoctor(agent.getCwd()), contentWidth()).join('\n') + '\n');
          break;
        }

        case '/tools': {
          console.log(`\n${renderToolCatalog(contentWidth())}\n`);
          break;
        }

        case '/env': {
          console.log(`\n${renderEnv(agent.getCwd(), agent.getModel(), agent.getEffort(), contentWidth())}\n`);
          break;
        }

        case '/outline': {
          const target = path.resolve(agent.getCwd(), rest || 'src');
          try {
            const stat = fs.statSync(target);
            const files = stat.isDirectory()
              ? fs.readdirSync(target).filter((f) => /\.(ts|js|mjs|tsx|jsx|py|go|rs)$/.test(f)).map((f) => path.join(target, f))
              : [target];
            const nodes = files.flatMap((f) => outlineFile(f));
            console.log(`\n${renderOutline(nodes, contentWidth()).join('\n')}\n`);
          } catch (err: unknown) {
            console.log(`\n${renderErrorCard('Outline failed', err instanceof Error ? err.message : String(err))}\n`);
          }
          break;
        }

        case '/grep': {
          if (!rest) {
            console.log(`\n${colors.dim}Usage: /grep <text>${colors.reset}\n`);
            break;
          }
          console.log(`\n${renderGrep(grepWorkspaceSafe(rest, agent.getCwd()), rest, contentWidth())}\n`);
          break;
        }

        case '/init': {
          // Hand the generated survey to the turn runner below instead of
          // printing it: `continue` skips turn execution, so a printed prompt
          // would strand the user with nothing in the editor.
          runTurn = buildInitPrompt(agent.getCwd());
          break;
        }

        case '/test': {
          const cmd = detectTestCommand(agent.getCwd());
          if (!cmd) {
            console.log(`\n${renderErrorCard('No test command detected', `Nothing in ${agent.getCwd()} looks like a test runner.`)}\n`);
            break;
          }
          const spinner = new ButterSpinner();
          spinner.start(`Running ${cmd}…`);
          const { code, tail } = await runTestCommand(cmd, { cwd: agent.getCwd() });
          spinner.stop();
          console.log('\n' + renderTestResult(code, tail, contentWidth()) + '\n');
          break;
        }

        case '/checkpoint': {
          // `/checkpoint [save <label> | <id>]`. Saving exists because the empty
          // state promises it; without this the list could only ever be empty.
          const [verb, ...labelParts] = rest.split(' ').filter(Boolean);
          if (!verb) {
            console.log(`\n${renderCheckpoints(listCheckpoints(), contentWidth())}\n`);
          } else if (verb === 'save') {
            const id = `cp-${new Date().toISOString().replace(/[:.]/g, '-')}`;
            saveCheckpoint(id, labelParts.join(' ') || 'manual checkpoint', agent.getMessages());
            console.log(`\n${renderToast(`Saved checkpoint ${id}`, true)}\n`);
          } else {
            const cp = loadCheckpoint(verb);
            if (!cp) {
              console.log(`\n${renderErrorCard('No such checkpoint', verb)}\n`);
            } else {
              agent.setMessages(cp.messages);
              console.log(`\n${renderToast(`Restored ${cp.id} (${cp.label})`, true)}\n`);
            }
          }
          break;
        }

        case '/snippet': {
          // `/snippet <name> [rm] <text>` — the name is the FIRST token, so
          // `/snippet review add hello world` saves name="review", text=
          // "hello world". Parsing the verb first silently dropped the name.
          const [name, verb, ...body] = rest.split(' ').filter(Boolean);
          if (!name) {
            console.log(`\n${renderSnippets(listSnippets(), contentWidth())}\n`);
          } else if (verb === 'rm') {
            console.log(removeSnippet(name)
              ? `\n${renderToast(`Removed snippet ${name}`, true)}\n`
              : `\n${renderErrorCard('No such snippet', name)}\n`);
          } else if (body.length > 0) {
            saveSnippet(name, body.join(' '));
            console.log(`\n${renderToast(`Saved snippet ${name}`, true)}\n`);
          } else {
            console.log(`\n${renderSnippets(listSnippets().filter((s) => s.name === name), contentWidth())}\n`);
          }
          break;
        }

        case '/clear': {
          console.clear();
          console.log(banner('1.0.0', agent.getModel(), agent.getCwd(), agent.getEffort()));
          console.log(`\n  ${colors.dim}Screen buffer cleared. Active session preserved (${messages.length} messages in memory). Use /new to start a fresh session.${colors.reset}\n`);
          break;
        }

        case '/help': {
          console.log('\n' + formatPredictiveHints(SLASH_COMMANDS) + '\n');
          break;
        }

        case '/exit':
        case '/quit': {
          console.log(`\n${b.melt('Au revoir!')}\n`);
          process.off('SIGINT', onSigInt);
          process.exit(0);
          break;
        }

        default: {
          console.log(`\n${b.red('Unknown command:')} ${cmd}. Type ${b.gold('/menu')} or ${b.gold('/help')} for options.\n`);
        }
      }

      // /init set a prompt to execute; fall through to the turn runner.
      if (!runTurn) continue;
    }

    if (runTurn) {
      trimmed = runTurn;
      runTurn = null;
    }

    // Normal Turn Execution with Streaming, Thinking Blocks, Diffs & Clean Error Recovery
    console.log(formatUserMessageCard(trimmed));

    activeAbortController = new AbortController();
    const workingBar = new BeurreWorkingBar({
      model: agent.getModel(),
      effort: agent.getEffort(),
      cwd: agent.getCwd(),
      user: currentUser.name,
      quotaText,
      turns: turnsCount,
      tokens: totalTokensEstimate,
      onSteer: (message: string) => {
        if (hasStartedTokenStream) {
          streamHighlighter.flush();
          workingBar.writeAbove('\n');
          hasStartedTokenStream = false;
        }
        workingBar.writeAbove(formatUserMessageCard(message));
        accumulatedReasoning = '';
        thinkingBlockRendered = false;
        thinkingStartTime = Date.now();
        firstTokenTime = 0;
        streamedTokenCount = 0;
        agent.steer(message);
      },
      onCycleEffort: (newEffort: string) => {
        agent.setEffort(newEffort);
      },
      onCancel: () => {
        activeAbortController?.abort();
      },
    });
    activeWorkingBar = workingBar;
    workingBar.start('Whipping up solution...');

    let accumulatedResponse = '';
    let accumulatedReasoning = '';
    let thinkingBlockRendered = false;
    let hasStartedTokenStream = false;
    let thinkingStartTime = Date.now();
    let firstTokenTime = 0;
    let streamedTokenCount = 0;
    let toolStartTime = 0;

    const streamHighlighter = new StreamingMarkdownHighlighter({
      onWrite: (chunk) => workingBar.writeAbove(chunk),
    });

    const renderThinkingIfNeeded = () => {
      if (accumulatedReasoning && !thinkingBlockRendered && thinkingMode !== 'hidden') {
        const isCollapsed = thinkingMode === 'collapsed';
        const elapsed = ((Date.now() - thinkingStartTime) / 1000).toFixed(1) + 's';
        const block = formatThinkingBlock(accumulatedReasoning, isCollapsed, undefined, elapsed);
        workingBar.writeAbove('\n' + block + '\n');
        thinkingBlockRendered = true;
        lastReasoning = accumulatedReasoning;
      }
    };

    try {
      await agent.runTurn(
        trimmed,
        {
          onStatus: (st) => workingBar.update(st),
          onReasoning: (res) => {
            accumulatedReasoning += res;
            lastReasoning = accumulatedReasoning;
            if (!hasStartedTokenStream) {
              const elapsed = (Date.now() - thinkingStartTime) / 1000;
              const tokenEst = Math.round(accumulatedReasoning.length / 4);
              const snippet = accumulatedReasoning.trim().replace(/\s+/g, ' ').slice(0, 35);
              workingBar.setThinking(tokenEst, elapsed, snippet);
            }
          },
          onToken: (tok) => {
            if (!firstTokenTime) {
              firstTokenTime = Date.now();
            }
            streamedTokenCount++;
            if (!hasStartedTokenStream) {
              renderThinkingIfNeeded();
              hasStartedTokenStream = true;
              workingBar.writeAbove(formatAgentHeader(agent.getModel(), agent.getEffort()));
            }
            accumulatedResponse += tok;
            const durationSec = (Date.now() - firstTokenTime) / 1000;
            const tokPerSec = durationSec > 0 ? (streamedTokenCount / durationSec) : 0;
            workingBar.setGenerating(streamedTokenCount, tokPerSec, durationSec);
            streamHighlighter.feed(tok);
          },
          onToolStart: (name, args) => {
            if (hasStartedTokenStream) {
              streamHighlighter.flush();
              workingBar.writeAbove('\n');
              hasStartedTokenStream = false;
            }
            renderThinkingIfNeeded();
            toolStartTime = Date.now();
            workingBar.writeAbove(`\n${formatClaudeToolCall(name, args)}\n`);
            workingBar.setTool(name, args);
          },
          onToolEnd: (name, output, isError, diff) => {
            const elapsedMs = toolStartTime > 0 ? Date.now() - toolStartTime : 0;
            if (diff) {
              workingBar.writeAbove('\n' + diff + '\n');
            } else {
              workingBar.writeAbove(formatClaudeToolResult(output, isError, elapsedMs) + '\n');
            }
            workingBar.update('Whipping up solution...');
          },
        },
        activeAbortController.signal
      );

      // Finalize thinking block if it hadn't triggered yet
      renderThinkingIfNeeded();

      // Estimate tokens & save response for /copy
      const turnTokens = Math.round((trimmed.length + accumulatedResponse.length + accumulatedReasoning.length) / 4);
      totalTokensEstimate += turnTokens;
      dailyTokensUsed += turnTokens;
      lastAssistantResponse = accumulatedResponse;

      // Auto-sync session turns to Supabase cloud store
      saveCloudSession({
        id: agent.getSessionId(),
        title: trimmed.slice(0, 60),
        model: agent.getModel(),
        history: agent.getMessages(),
      }).catch(() => {});

      if (hasStartedTokenStream) {
        streamHighlighter.flush();
        workingBar.stop();
        const durationSec = firstTokenTime > 0 ? (Date.now() - firstTokenTime) / 1000 : 0;
        const tokPerSec = durationSec > 0 ? (streamedTokenCount / durationSec) : 0;
        const speedBadge = durationSec > 0
          ? ` ${colors.dim}[${tokPerSec.toFixed(1)} tok/s • ~${streamedTokenCount} tokens • ${durationSec.toFixed(1)}s]${colors.reset}`
          : '';
        console.log(`\n${speedBadge}\n`);
      } else {
        workingBar.stop();
      }
    } catch (err: any) {
      workingBar.stop();
      if (!activeAbortController.signal.aborted) {
        console.log(renderErrorCard('Relay Gateway / Inference Error', err.message));
      } else {
        console.log(`\n${colors.butterMelt}Turn cancelled by user.${colors.reset}\n`);
      }
    } finally {
      workingBar.stop();
      activeAbortController = null;
      activeWorkingBar = null;
    }
  }
}
