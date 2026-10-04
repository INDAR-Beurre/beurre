// Beurre Theme — Buttery Yellow Aesthetic (Claude Code / OMP Style)
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { getModelDisplayName } from './relay.ts';

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Butter Yellow Palette
  butterGold: '\x1b[38;2;250;204;21m',       // #FACC15 (Vibrant Gold)
  butterCream: '\x1b[38;2;254;249;195m',     // #FEF9C3 (Soft Butter)
  butterMelt: '\x1b[38;2;245;158;11m',       // #F59E0B (Melted Amber)
  butterCrust: '\x1b[38;2;217;119;6m',       // #D97706 (Toasted Crust)
  butterPale: '\x1b[38;2;254;240;138m',      // #FEF08A (Light Butter)

  // Claude Code / Muted accents
  white: '\x1b[38;2;255;255;255m',
  gray: '\x1b[38;2;168;162;158m',
  darkGray: '\x1b[38;2;120;113;108m',
  green: '\x1b[38;2;132;204;22m',            // #84CC16 (Success)
  red: '\x1b[38;2;239;68;68m',               // #EF4444 (Error)
  cyan: '\x1b[38;2;56;189;248m',             // #38BDF8 (Info)
  mutedBox: '\x1b[38;2;87;83;78m',           // #57534E (Muted borders)

  // High-Contrast Tool Colors
  toolBash: '\x1b[38;2;249;115;22m',         // #F97316 (Vivid Orange / Terminal)
  toolRead: '\x1b[38;2;56;189;248m',         // #38BDF8 (Sky Blue / Inspection)
  toolEdit: '\x1b[38;2;16;185;129m',         // #10B981 (Emerald Green / Surgical Edit)
  toolWrite: '\x1b[38;2;20;184;166m',        // #14B8A6 (Teal / Creation)
  toolSearch: '\x1b[38;2;168;85;247m',       // #A855F7 (Purple / Web Search)
  toolImage: '\x1b[38;2;244;63;94m',         // #F43F5E (Rose / Image Generation)
  toolSubagent: '\x1b[38;2;245;158;11m',     // #F59E0B (Amber Gold / Subagents)

  // Backgrounds
  bgUser: '\x1b[48;2;250;204;21m\x1b[30m\x1b[1m',
  bgAgent: '\x1b[48;2;245;158;11m\x1b[30m\x1b[1m',
  bgButterGold: '\x1b[48;2;250;204;21m\x1b[30m',
  bgButterMelt: '\x1b[48;2;245;158;11m\x1b[30m',
  bgCrust: '\x1b[48;2;217;119;6m\x1b[37m',
  bgDark: '\x1b[48;2;28;25;23m',
  bgGray: '\x1b[48;2;44;41;38m',
};

export const b = {
  gold: (text: string | number) => `${colors.butterGold}${text}${colors.reset}`,
  cream: (text: string | number) => `${colors.butterCream}${text}${colors.reset}`,
  melt: (text: string | number) => `${colors.butterMelt}${text}${colors.reset}`,
  crust: (text: string | number) => `${colors.butterCrust}${text}${colors.reset}`,
  pale: (text: string | number) => `${colors.butterPale}${text}${colors.reset}`,
  bold: (text: string | number) => `${colors.bold}${text}${colors.reset}`,
  dim: (text: string | number) => `${colors.dim}${text}${colors.reset}`,
  gray: (text: string | number) => `${colors.gray}${text}${colors.reset}`,
  green: (text: string | number) => `${colors.green}${text}${colors.reset}`,
  red: (text: string | number) => `${colors.red}${text}${colors.reset}`,
  cyan: (text: string | number) => `${colors.cyan}${text}${colors.reset}`,
  badge: (label: string) => `${colors.bgButterGold}${colors.bold} ${label} ${colors.reset}`,
  subagentBadge: (name: string) => `${colors.bgButterMelt}${colors.bold} 🧈 ${name} ${colors.reset}`,
};

export function getGitBranch(cwd: string): string | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd,
      encoding: 'utf-8',
      timeout: 1000,
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

export function getGitStatus(cwd: string): { branch: string | null; isDirty: boolean } {
  const branch = getGitBranch(cwd);
  if (!branch) return { branch: null, isDirty: false };
  try {
    const status = execSync('git status --porcelain 2>/dev/null', { cwd, encoding: 'utf-8', timeout: 1000 }).trim();
    return { branch, isDirty: status.length > 0 };
  } catch {
    return { branch, isDirty: false };
  }
}

export function formatShortCwd(cwd: string): string {
  const home = os.homedir();
  if (cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length);
  }
  return cwd;
}

export function getBeurreLogo(): string {
  const g1 = colors.butterGold;
  const g2 = colors.butterMelt;
  const g3 = colors.butterCrust;
  const r = colors.reset;
  return [
    `  ${g1}██████╗ ███████╗██╗   ██╗██████╗ ██████╗ ███████╗${r}`,
    `  ${g1}██╔══██╗██╔════╝██║   ██║██╔══██╗██╔══██╗██╔════╝${r}`,
    `  ${g2}██████╔╝█████╗  ██║   ██║██████╔╝██████╔╝█████╗  ${r}`,
    `  ${g2}██╔══██╗██╔══╝  ██║   ██║██╔══██╗██╔══██╗██╔══╝  ${r}`,
    `  ${g3}██████╔╝███████╗╚██████╔╝██║  ██║██║  ██║███████╗${r}`,
    `  ${g3}╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝${r}`,
  ].join('\n');
}

export function claudePromptHeader(model: string, cwd: string): string {
  const shortPath = formatShortCwd(cwd);
  const branch = getGitBranch(cwd);
  const gitInfo = branch ? ` (git: ${branch})` : '';
  const cols = Math.min(process.stdout.columns || 80, 80);
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

  const modelDisplayName = getModelDisplayName(model);
  const title = modelDisplayName !== model
    ? ` beurre [${modelDisplayName}] `
    : ` beurre [${model}] `;
  const borderLen = Math.max(0, cols - title.length - 3);

  const line1 = `${colors.butterCrust}╭──${colors.bold}${colors.butterGold}${title}${colors.reset}${colors.butterCrust}${'─'.repeat(borderLen)}╮${colors.reset}`;
  const infoText = `  🧈 ${colors.butterCream}${shortPath}${colors.dim}${gitInfo}${colors.reset}  ${colors.dim}•${colors.reset}  ${colors.dim}type ${colors.butterGold}/menu${colors.dim} for dashboard${colors.reset}`;
  const pad = Math.max(0, cols - stripAnsi(infoText).length - 2);
  const line2 = `${colors.butterCrust}│${colors.reset}${infoText}${' '.repeat(pad)}${colors.butterCrust}│${colors.reset}`;
  const line3 = `${colors.butterCrust}╰${'─'.repeat(cols - 2)}╯${colors.reset}`;

  return `\n${line1}\n${line2}\n${line3}\n`;
}

export function banner(version = '1.0.0', model = 'glm-5-3-flash', cwd = process.cwd(), effort = 'high'): string {
  const shortPath = formatShortCwd(cwd);
  const git = getGitStatus(cwd);
  const gitInfo = git.branch ? ` (git: ${git.branch}${git.isDirty ? '*' : ''})` : '';
  const modelDisplayName = getModelDisplayName(model);
  const modelStr = modelDisplayName !== model
    ? `${modelDisplayName} (${model})`
    : model;

  const logo = getBeurreLogo();
  const cols = Math.min(process.stdout.columns || 80, 80);
  const innerWidth = cols - 4;
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

  const formatLine = (content: string) => {
    const visibleLen = stripAnsi(content).length;
    const pad = Math.max(0, innerWidth - visibleLen);
    return `${colors.mutedBox}│${colors.reset} ${content}${' '.repeat(pad)} ${colors.mutedBox}│${colors.reset}`;
  };

  const topBorder = `${colors.mutedBox}╭${'─'.repeat(cols - 2)}╮${colors.reset}`;
  const bottomBorder = `${colors.mutedBox}╰${'─'.repeat(cols - 2)}╯${colors.reset}`;

  const header = ` ${colors.bold}${colors.butterGold}🧈 BEURRE${colors.reset} ${colors.dim}v${version}${colors.reset} ${colors.dim}•${colors.reset} ${colors.butterCream}L'Agent Fondant & Autonome${colors.reset}`;
  const modelLine = ` ${colors.dim}Model:${colors.reset}     ${colors.bold}${colors.butterGold}${modelStr}${colors.reset} ${colors.dim}· effort: ${effort}${colors.reset}`;
  const dirLine = ` ${colors.dim}Workspace:${colors.reset} ${colors.white}${shortPath}${colors.reset}${colors.dim}${gitInfo}${colors.reset}`;
  const relayLine = ` ${colors.dim}Relay:${colors.reset}     ${colors.cyan}https://relay-gw.pages.dev${colors.reset} ${colors.green}● LIVE${colors.reset}`;
  const subLine = ` ${colors.dim}Subagents:${colors.reset} ${colors.butterPale}Architect • CodeCraft • Reviewer • BugHunter • Scout • Visionary${colors.reset}`;
  const hintsLine = ` ${colors.dim}Commands:${colors.reset}  Type ${colors.butterGold}/menu${colors.reset} ${colors.dim}for settings,${colors.reset} ${colors.butterGold}/models${colors.reset} ${colors.dim}to switch,${colors.reset} ${colors.butterGold}/help${colors.reset} ${colors.dim}for cheatsheet${colors.reset}`;

  return [
    '',
    logo,
    '',
    topBorder,
    formatLine(header),
    formatLine(''),
    formatLine(modelLine),
    formatLine(dirLine),
    formatLine(relayLine),
    formatLine(subLine),
    formatLine(''),
    formatLine(hintsLine),
    bottomBorder,
    '',
  ].join('\n');
}

export interface StatusBarOptions {
  model: string;
  cwd: string;
  turns?: number;
  tokens?: number;
  status?: string;
  isBusy?: boolean;
}

export function statusBar(options: StatusBarOptions): string {
  const terminalCols = process.stdout.columns || 100;
  const cols = Math.max(80, Math.min(terminalCols, 120));
  const shortPath = formatShortCwd(options.cwd);
  const git = getGitStatus(options.cwd);
  const gitTag = git.branch ? ` (${git.branch}${git.isDirty ? '*' : ''})` : '';
  const modelDisplayName = getModelDisplayName(options.model);
  const displayModel = modelDisplayName !== options.model ? `${modelDisplayName} (${options.model})` : options.model;

  const left = ` 🧈 ${colors.bold}${colors.butterGold}${displayModel}${colors.reset} ${colors.dim}│${colors.reset} ${colors.butterCream}${shortPath}${colors.dim}${gitTag}${colors.reset}`;

  const turnsText = options.turns !== undefined ? `Turns: ${options.turns} ` : '';
  const tokensText = options.tokens !== undefined ? `~${Math.round(options.tokens / 1000)}k tok ` : '';
  const statusIndicator = options.isBusy
    ? `${colors.butterGold}● working...${colors.reset}`
    : `${colors.green}● LIVE${colors.reset}`;

  const right = `${colors.dim}${turnsText}${tokensText}│${colors.reset} ${statusIndicator} `;

  // Strip ansi for width calculation
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
  const leftLen = stripAnsi(left).length;
  const rightLen = stripAnsi(right).length;

  if (cols < leftLen + rightLen + 4) {
    const compactStats = [turnsText.trim(), tokensText.trim()].filter(Boolean).join(' • ');
    const statsTag = compactStats ? ` ${colors.dim}[${compactStats}]${colors.reset}` : '';
    return `${colors.butterGold}🧈 [${displayModel}]${colors.reset} ${colors.butterCream}${shortPath}${colors.dim}${gitTag}${colors.reset}${statsTag} ${statusIndicator}`;
  }

  const spaces = Math.max(1, cols - leftLen - rightLen - 2);

  const topBorder = `${colors.mutedBox}╭${'─'.repeat(cols - 2)}╮${colors.reset}`;
  const content = `${colors.mutedBox}│${colors.reset}${left}${' '.repeat(spaces)}${right}${colors.mutedBox}│${colors.reset}`;
  const bottomBorder = `${colors.mutedBox}╰${'─'.repeat(cols - 2)}╯${colors.reset}`;

  return `${topBorder}\n${content}\n${bottomBorder}`;
}

export function renderErrorCard(title: string, message: string): string {
  const cols = Math.min(process.stdout.columns || 80, 80);
  const header = ` ⚠️ ${title} `;
  const borderLen = Math.max(0, cols - header.length - 3);

  const top = `${colors.red}╭──${colors.bold}${header}${colors.reset}${colors.red}${'─'.repeat(borderLen)}╮${colors.reset}`;
  const bottom = `${colors.red}╰${'─'.repeat(cols - 2)}╯${colors.reset}`;

  const lines = message.split('\n').map((l) => `${colors.red}│${colors.reset}  ${l}`);
  return `\n${top}\n${lines.join('\n')}\n${bottom}\n`;
}

export function renderToast(message: string, isSuccess = true): string {
  const icon = isSuccess ? `${colors.green}✔${colors.reset}` : `${colors.red}✖${colors.reset}`;
  return `${colors.bgGray} ${icon} ${colors.bold}${message} ${colors.reset}`;
}

export function formatUserMessageCard(prompt: string): string {
  const badge = `${colors.dim}👤 YOU${colors.reset}`;
  const chevron = `${colors.butterGold}${colors.bold}❯${colors.reset}`;
  const lines = prompt.split('\n');
  if (lines.length === 1) {
    return `\n${chevron} ${colors.bold}${colors.white}${prompt}${colors.reset}  ${badge}\n`;
  }
  const formatted = lines
    .map((l, i) => (i === 0
      ? `${chevron} ${colors.bold}${colors.white}${l}${colors.reset}`
      : `  ${colors.dim}│${colors.reset} ${colors.bold}${colors.white}${l}${colors.reset}`))
    .join('\n');
  return `\n${formatted}  ${badge}\n`;
}

export function formatAgentHeader(model: string, effort?: string): string {
  const modelDisplayName = getModelDisplayName(model);
  const effortBadge = effort
    ? ` ${colors.dim}· effort: ${colors.butterPale}${effort}${colors.reset}`
    : '';
  return `\n${colors.butterGold}${colors.bold}🧈 BEURRE${colors.reset} ${colors.dim}[${colors.butterCream}${modelDisplayName}${colors.dim}]${colors.reset}${effortBadge}\n\n`;
}

export function formatClaudeToolCall(name: string, args: Record<string, any>, durationMs?: number): string {
  let detail = '';
  switch (name) {
    case 'bash':
      detail = `${colors.bold}${colors.white}${args.command || ''}${colors.reset}`;
      break;
    case 'read':
      detail = `${colors.cyan}${args.path || ''}${args.offset ? `:${args.offset}` : ''}${colors.reset}`;
      break;
    case 'write':
      detail = `${colors.cyan}${args.path || ''}${colors.reset}`;
      break;
    case 'edit':
      detail = `${colors.green}${args.path || ''}${colors.reset}`;
      break;
    case 'web_search':
      detail = `${colors.italic}${colors.butterCream}"${args.query || ''}"${colors.reset}`;
      break;
    case 'subagent_run':
      detail = `${b.subagentBadge(args.subagent || '')} ${colors.dim}→${colors.reset} ${colors.butterPale}${args.task?.slice(0, 50) || ''}${colors.reset}`;
      break;
    case 'generate_image':
      detail = `${colors.italic}${colors.butterPale}"${args.prompt?.slice(0, 50) || ''}"${colors.reset}`;
      break;
    default:
      detail = JSON.stringify(args).slice(0, 60);
      break;
  }

  const timing = durationMs !== undefined
    ? ` ${colors.dim}[${durationMs >= 1000 ? (durationMs / 1000).toFixed(1) + 's' : durationMs + 'ms'}]${colors.reset}`
    : '';

  switch (name) {
    case 'bash':
      return `${colors.toolBash}⚡${colors.reset} ${colors.bold}${colors.toolBash}Bash${colors.reset}(${detail})${timing}`;
    case 'read':
      return `${colors.toolRead}📖${colors.reset} ${colors.bold}${colors.toolRead}Read${colors.reset}(${detail})${timing}`;
    case 'write':
      return `${colors.toolWrite}📝${colors.reset} ${colors.bold}${colors.toolWrite}Write${colors.reset}(${detail})${timing}`;
    case 'edit':
      return `${colors.toolEdit}✏️${colors.reset} ${colors.bold}${colors.toolEdit}Edit${colors.reset}(${detail})${timing}`;
    case 'web_search':
      return `${colors.toolSearch}🔍${colors.reset} ${colors.bold}${colors.toolSearch}Search${colors.reset}(${detail})${timing}`;
    case 'subagent_run':
      return `${colors.toolSubagent}👥${colors.reset} ${colors.bold}${colors.toolSubagent}Subagent${colors.reset}(${detail})${timing}`;
    case 'generate_image':
      return `${colors.toolImage}🎨${colors.reset} ${colors.bold}${colors.toolImage}ImageGen${colors.reset}(${detail})${timing}`;
    default:
      return `${colors.butterMelt}●${colors.reset} ${b.bold(name)}(${b.dim(detail)})${timing}`;
  }
}

export function formatClaudeToolResult(output: string, isError = false, durationMs?: number): string {
  const icon = isError ? `${colors.red}❌ Error: ${colors.reset}` : `${colors.green}└─ ✔ ${colors.reset}`;
  const firstLine = output.trim().split('\n')[0] || '(empty)';
  const preview = isError
    ? `${colors.red}${firstLine.slice(0, 100)}${colors.reset}`
    : `${colors.gray}${firstLine.slice(0, 100)}${colors.reset}`;
  const remaining = output.trim().split('\n').length - 1;
  const more = remaining > 0 ? ` ${colors.dim}(+${remaining} more lines)${colors.reset}` : '';
  const timing = durationMs !== undefined
    ? ` ${colors.dim}[${durationMs >= 1000 ? (durationMs / 1000).toFixed(1) + 's' : durationMs + 'ms'}]${colors.reset}`
    : '';
  return `  ${icon}${preview}${more}${timing}`;
}

export function butterBox(title: string, content: string, borderColor = colors.butterMelt): string {
  const width = Math.min(process.stdout.columns || 80, 80);
  const top = `${borderColor}╭─ 🧈 ${colors.bold}${title}${colors.reset}${borderColor} ${'─'.repeat(Math.max(0, width - title.length - 8))}╮${colors.reset}`;
  const bottom = `${borderColor}╰${'─'.repeat(Math.max(0, width - 2))}╯${colors.reset}`;
  const lines = content.split('\n').map((l) => `${borderColor}│${colors.reset} ${l}`).join('\n');
  return `${top}\n${lines}\n${bottom}`;
}

export class ButterSpinner {
  private frames = ['🧈 ⠋', '🧈 ⠙', '🧈 ⠹', '🧈 ⠸', '🧈 ⠼', '🧈 ⠴', '🧈 ⠦', '🧈 ⠧', '🧈 ⠇', '🧈 ⠏'];
  private idx = 0;
  private timer: Timer | null = null;
  private message = '';
  private isTTY = Boolean(process.stdout.isTTY);

  start(message: string) {
    this.message = message;
    this.idx = 0;
    if (this.timer) clearInterval(this.timer);
    if (!this.isTTY) return;
    process.stdout.write('\x1b[?25l'); // Hide cursor
    this.render();
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  update(message: string) {
    this.message = message;
    if (this.isTTY) {
      this.render();
    }
  }

  stop(finalText?: string) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isTTY) {
      process.stdout.write('\r\x1b[K'); // Clear line
      process.stdout.write('\x1b[?25h'); // Show cursor
    }
    if (finalText) {
      console.log(finalText);
    }
  }

  private render() {
    if (!this.isTTY) return;
    process.stdout.write(`\r\x1b[K${colors.butterGold}${this.frames[this.idx]}${colors.reset} ${colors.butterCream}${this.message}${colors.reset}`);
  }
}
