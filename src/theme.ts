// Beurre Theme — Buttery Yellow Aesthetic (Claude Code / OMP Style)
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { getModelDisplayName } from './relay.ts';
import { colorEnabled, termWidth, truncate, columns, stringWidth } from './layout.ts';
import { BEURRE_VERSION } from './config.ts';

// Escape codes collapse to '' when colour is off (NO_COLOR, TERM=dumb, pipes),
// so every styled helper below keeps working unchanged — just without colour.
// ponytail: one gate here covers every consumer; no per-call-site checks.
const c = (code: string) => (colorEnabled() ? code : '');

/** Raw RGB per palette entry, independent of NO_COLOR — the palette definition itself. */
export const PALETTE_RGB: Record<string, number[]> = {
  butterGold: [250, 204, 21], butterCream: [254, 249, 195], butterMelt: [245, 158, 11],
  butterCrust: [217, 119, 6], butterPale: [254, 240, 138],
  white: [255, 255, 255], gray: [168, 162, 158], darkGray: [120, 113, 108],
  green: [132, 204, 22], red: [239, 68, 68], cyan: [56, 189, 248], mutedBox: [87, 83, 78],
  toolBash: [232, 48, 73], toolRead: [48, 171, 232], toolEdit: [134, 48, 232],
  toolWrite: [16, 185, 129], toolSearch: [232, 48, 232], toolImage: [232, 48, 140],
  toolSubagent: [48, 232, 171],
};

export const colors = {
  reset: c('\x1b[0m'),
  bold: c('\x1b[1m'),
  dim: c('\x1b[2m'),
  italic: c('\x1b[3m'),
  underline: c('\x1b[4m'),

  // Butter Yellow Palette
  butterGold: c('\x1b[38;2;250;204;21m'),
  butterCream: c('\x1b[38;2;254;249;195m'),
  butterMelt: c('\x1b[38;2;245;158;11m'),
  butterCrust: c('\x1b[38;2;217;119;6m'),
  butterPale: c('\x1b[38;2;254;240;138m'),

  // Muted accents
  white: c('\x1b[38;2;255;255;255m'),
  gray: c('\x1b[38;2;168;162;158m'),
  darkGray: c('\x1b[38;2;120;113;108m'),
  green: c('\x1b[38;2;132;204;22m'),
  red: c('\x1b[38;2;239;68;68m'),
  cyan: c('\x1b[38;2;56;189;248m'),
  mutedBox: c('\x1b[38;2;87;83;78m'),

  // Tool colours: each tool must be identifiable by hue alone. toolEdit and
  // toolWrite were 37 units apart (indistinguishable); toolRead duplicated
  // cyan and toolSubagent duplicated butterMelt exactly.
  toolBash: c('\x1b[38;2;232;48;73m'),     // red
  toolRead: c('\x1b[38;2;48;171;232m'),    // sky
  toolEdit: c('\x1b[38;2;134;48;232m'),    // violet
  toolWrite: c('\x1b[38;2;16;185;129m'),   // emerald
  toolSearch: c('\x1b[38;2;232;48;232m'),  // magenta
  toolImage: c('\x1b[38;2;232;48;140m'),   // pink
  toolSubagent: c('\x1b[38;2;48;232;171m'),// mint

  // Backgrounds
  bgUser: c('\x1b[48;2;250;204;21m\x1b[30m\x1b[1m'),
  bgAgent: c('\x1b[48;2;245;158;11m\x1b[30m\x1b[1m'),
  bgButterGold: c('\x1b[48;2;250;204;21m\x1b[30m'),
  bgButterMelt: c('\x1b[48;2;245;158;11m\x1b[30m'),
  bgCrust: c('\x1b[48;2;217;119;6m\x1b[37m'),
  bgDark: c('\x1b[48;2;28;25;23m'),
  bgGray: c('\x1b[48;2;44;41;38m'),
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
  subagentBadge: (name: string) => `${colors.bgButterMelt}${colors.bold} ${name} ${colors.reset}`,
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


/**
 * The Beurre mark: a slab of butter, sliced, with the corner
 * melting away.
 *
 * Drawn with block glyphs rather than emoji so it inherits the
 * terminal's own font and can never render as a full-colour emoji.
 * Three rows, not a six-line banner — the same restraint the
 * wordmark follows. Every row is drawn at the same width so the
 * mark reads as one solid shape: the first cut used a four-cell
 * taper under a six-cell slab, so the bottom edge stopped two
 * columns early and the mark looked bitten from the right.
 */
const BUTTER_MARK = [
  '▟████▛',
  '██████',
  '▗▄▄▄▘',
] as const;

const MARK_TINT = [colors.butterPale, colors.butterGold, colors.butterMelt] as const;

/** The mark alone, tinted. The caller owns the gutter. */
export function logoMark(): string[] {
  return BUTTER_MARK.map((row, i) => `${MARK_TINT[i]}${row}${colors.reset}`);
}

// The full gutter a marked row consumes: the one-space indent `row()` adds,
// the widest mark row, and the two spaces between mark and content. Measuring
// this is what keeps `rowWidth` honest — a value one column short pushed
// every marked row a single column past the right margin.
export const LOGO_GUTTER = 3 + Math.max(...BUTTER_MARK.map((r) => stringWidth(r)));

/**
 * Startup banner.
 *
 * Design intent: no ASCII art, no emoji. A big company tool shows its name and
 * state once, then gets out of the way — it does not print a six-line logo that
 * eats a quarter of the viewport on every launch. Every line is fitted to the
 * real terminal width, so this is safe at 40 columns.
 */
export function banner(version = BEURRE_VERSION, model = 'glm-5-3-flash', cwd = process.cwd(), effort = 'high'): string {
  const width = Math.max(20, termWidth());
  const git = getGitStatus(cwd);
  const gitTag = git.branch ? `  ${git.branch}${git.isDirty ? '*' : ''}` : '';
  const modelName = getModelDisplayName(model);
  const wordmark = `${colors.bold}${colors.butterGold}beurre${colors.reset}`;
  const separator = `${colors.mutedBox}·${colors.reset}`;

  // Keep startup chrome compact and inline. The old banner used a three-row
  // logo and independently right-aligned columns, leaving a large empty gulf
  // in wide terminals and making the prompt feel unlike the compact OMP UI.
  const headline = ` ${wordmark} ${colors.dim}v${version}${colors.reset}  ${separator}  ${colors.butterCream}${truncate(modelName, Math.max(8, width - 38))}${colors.reset}  ${separator}  ${colors.dim}${effort}${colors.reset}`;
  const context = ` ${colors.dim}${truncate(`${formatShortCwd(cwd)}${gitTag}`, Math.max(6, width - 1))}${colors.reset}`;

  // Pick a complete hint tier; never slice a command name at the right edge.
  const hintTiers = [
    'Type a task and press Enter.  /menu settings  /models switch  /help all commands',
    'Type a task and press Enter.  /menu settings  /help',
    'Type a task.  /menu  /help',
    '/menu  /help',
  ];
  const hints = hintTiers.find((h) => h.length + 1 <= width) ?? '/help';
  const fit = (line: string): string => truncate(line, Math.max(1, width));
  return [fit(headline), fit(context), fit(`${colors.dim} ${hints}${colors.reset}`)].join('\n');
}

export function renderErrorCard(title: string, message: string): string {
  const cols = Math.min(process.stdout.columns || 80, 80);
  const header = ` ${truncate(title, Math.max(8, cols - 6))} `;
  const borderLen = Math.max(0, cols - header.length - 4);

  const top = `${colors.red}╭──${colors.bold}${header}${colors.reset}${colors.red}${'─'.repeat(borderLen)}╮${colors.reset}`;
  const bottom = `${colors.red}╰${'─'.repeat(cols - 2)}╯${colors.reset}`;

  // A message line wider than the frame wraps, and every overlay then erases
  // by logical line count, so the whole screen drifts for the rest of the
  // session. Truncate here, once, for every error card in the app.
  const lines = message.split('\n').map((l) => `${colors.red}│${colors.reset}  ${truncate(l, cols - 4)}`);
  return `\n${top}\n${lines.join('\n')}\n${bottom}\n`;
}

export function renderToast(message: string, isSuccess = true): string {
  const icon = isSuccess ? `${colors.green}✔${colors.reset}` : `${colors.red}✖${colors.reset}`;
  return `${colors.bgGray} ${icon} ${colors.bold}${message} ${colors.reset}`;
}

export function formatUserMessageCard(prompt: string): string {
  const badge = `${colors.dim}YOU${colors.reset}`;
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
  return `\n${colors.butterGold}${colors.bold}BEURRE${colors.reset} ${colors.dim}[${colors.butterCream}${modelDisplayName}${colors.dim}]${colors.reset}${effortBadge}\n\n`;
}

export function formatToolCall(name: string, args: Record<string, unknown>, durationMs?: number): string {
  // Tool arguments arrive as untrusted JSON from the model, so every field is
  // narrowed through a guard rather than asserted. `str` is the single place
  // that decides what a scalar is allowed to be.
  const str = (key: string) => {
    const v = args[key];
    return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  };
  let detail = '';
  switch (name) {
    case 'bash':
      detail = `${colors.bold}${colors.white}${str('command')}${colors.reset}`;
      break;
    case 'read':
      detail = `${colors.cyan}${str('path')}${str('offset') ? `:${str('offset')}` : ''}${colors.reset}`;
      break;
    case 'write':
      detail = `${colors.cyan}${str('path')}${colors.reset}`;
      break;
    case 'edit':
      detail = `${colors.green}${str('path')}${colors.reset}`;
      break;
    case 'web_search':
      detail = `${colors.italic}${colors.butterCream}"${str('query')}"${colors.reset}`;
      break;
    case 'subagent_run':
      detail = `${b.subagentBadge(str('subagent'))} ${colors.dim}→${colors.reset} ${colors.butterPale}${str('task').slice(0, 50)}${colors.reset}`;
      break;
    case 'generate_image':
      detail = `${colors.italic}${colors.butterPale}"${str('prompt').slice(0, 50)}"${colors.reset}`;
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
      return `${colors.bold}${colors.toolBash}Bash${colors.reset}(${detail})${timing}`;
    case 'read':
      return `${colors.bold}${colors.toolRead}Read${colors.reset}(${detail})${timing}`;
    case 'write':
      return `${colors.bold}${colors.toolWrite}Write${colors.reset}(${detail})${timing}`;
    case 'edit':
      return `${colors.bold}${colors.toolEdit}Edit${colors.reset}(${detail})${timing}`;
    case 'web_search':
      return `${colors.bold}${colors.toolSearch}Search${colors.reset}(${detail})${timing}`;
    case 'subagent_run':
      return `${colors.bold}${colors.toolSubagent}Subagent${colors.reset}(${detail})${timing}`;
    case 'generate_image':
      return `${colors.bold}${colors.toolImage}ImageGen${colors.reset}(${detail})${timing}`;
    default:
      return `${colors.butterMelt}●${colors.reset} ${b.bold(name)}(${b.dim(detail)})${timing}`;
  }
}

export function formatToolResult(output: string, isError = false, durationMs?: number): string {
  const cols = Math.max(20, process.stdout.columns || 80);
  const icon = isError ? `${colors.red}✖ Error: ${colors.reset}` : `${colors.green}└─ ✔ ${colors.reset}`;
  const firstLine = output.trim().split('\n')[0] || '(empty)';
  const remaining = output.trim().split('\n').length - 1;
  const more = remaining > 0 ? ` ${colors.dim}(+${remaining} more lines)${colors.reset}` : '';
  const timing = durationMs !== undefined
    ? ` ${colors.dim}[${durationMs >= 1000 ? (durationMs / 1000).toFixed(1) + 's' : durationMs + 'ms'}]${colors.reset}`
    : '';

  const maxPreview = Math.max(10, cols - 24);
  const safeFirstLine = truncate(firstLine, maxPreview);

  const preview = isError
    ? `${colors.red}${safeFirstLine}${colors.reset}`
    : `${colors.gray}${safeFirstLine}${colors.reset}`;
  return `  ${icon}${preview}${more}${timing}`;
}


export class ButterSpinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
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
    const SHIMMER = [colors.butterGold, colors.butterPale, colors.butterGold, colors.butterMelt];
    const tint = SHIMMER[this.idx % SHIMMER.length];
    process.stdout.write(`\r\x1b[K${tint}${this.frames[this.idx]}${colors.reset} ${colors.butterCream}${this.message}${colors.reset}`);
  }
}

export interface WorkingBarRenderOptions {
  cols?: number;
  spinnerFrame?: string;
  statusText?: string;
  model?: string;
  effort?: string;
  user?: string;
  quotaText?: string;
  cwd?: string;
  turns?: number;
  tokens?: number;
  interactive?: boolean;
  inputBuffer?: string;
  cursor?: number;
  placeholder?: string;
  history?: string[];
  onSteer?: (message: string) => void;
  onCycleEffort?: (newEffort: string) => void;
  onCancel?: () => void;
}

export function formatWorkingPromptBar(options: WorkingBarRenderOptions = {}): string[] {
  const terminalCols = options.cols || (process.stdout.columns || 80);
  const cols = Math.max(20, terminalCols);
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

  const frame = options.spinnerFrame || `${colors.butterGold}⠋${colors.reset}`;
  const rawStatus = options.statusText || 'Whipping up solution...';
  const prefix = `${frame} ${colors.butterCream}`;
  const suffix = `${colors.reset}`;
  const prefixLen = stripAnsi(prefix).length;
  const maxStatusLen = Math.max(1, cols - prefixLen - 2);

  let displayedStatus = rawStatus;
  if (stringWidth(displayedStatus) > maxStatusLen) {
    displayedStatus = truncate(displayedStatus, maxStatusLen);
  }
  let statusLine = `${prefix}${displayedStatus}${suffix}`;
  while (stringWidth(statusLine) > cols && displayedStatus.length > 1) {
    displayedStatus = truncate(displayedStatus, Math.max(1, stringWidth(displayedStatus) - 2));
    statusLine = `${prefix}${displayedStatus}${suffix}`;
  }

  // Model & footer metadata
  const modelName = options.model ? getModelDisplayName(options.model) : 'Beurre';
  const effortTag = options.effort ? options.effort.toLowerCase() : 'high';
  const quotaTag = options.quotaText
    ? (options.quotaText.includes('\x1b') ? options.quotaText : `${colors.cyan}${options.quotaText}${colors.reset}`)
    : '';
  const userTag = options.user ? `${colors.butterCream}${options.user}${colors.reset}` : '';

  // Interactive steering prompt bar mode (Claude Code / OMP standard)
  if (options.interactive) {
    const line0 = statusLine;
    const line1 = `${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`;

    // Line 2: interactive prompt line
    const promptPrefix = `${colors.butterGold}${colors.bold}>${colors.reset} `;
    const isBufferEmpty = !options.inputBuffer || options.inputBuffer.length === 0;
    const defaultPlaceholder = 'Type a message to steer agent (Esc to cancel)...';
    const placeholderText = options.placeholder || defaultPlaceholder;

    let inputLine = '';
    if (isBufferEmpty) {
      const maxPlaceCols = Math.max(5, cols - 3);
      const text = placeholderText.length > maxPlaceCols
        ? placeholderText.slice(0, maxPlaceCols - 1) + '…'
        : placeholderText;
      inputLine = `${promptPrefix}${colors.darkGray}${text}${colors.reset}`;
    } else {
      const maxTextCols = Math.max(5, cols - 3);
      const buf = options.inputBuffer!;
      const cur = options.cursor !== undefined
        ? Math.max(0, Math.min(options.cursor, buf.length))
        : buf.length;
      let displayText = buf;
      if (buf.length > maxTextCols) {
        if (cur < maxTextCols - 1) {
          displayText = buf.slice(0, maxTextCols - 1) + '…';
        } else if (cur > buf.length - (maxTextCols - 1)) {
          const startIdx = buf.length - (maxTextCols - 1);
          displayText = '…' + buf.slice(startIdx);
        } else {
          const windowSize = maxTextCols - 2;
          const startIdx = cur - Math.floor(windowSize / 2);
          const endIdx = startIdx + windowSize;
          displayText = '…' + buf.slice(startIdx, endIdx) + '…';
        }
      }
      inputLine = `${promptPrefix}${colors.bold}${colors.white}${displayText}${colors.reset}`;
    }

    const line3 = `${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`;

    // Line 4: footer with responsive compaction
    let leftStatus = `${colors.dim}esc to cancel • enter to steer • shift+tab effort${colors.reset}`;
    let rightParts = [userTag, modelName, effortTag, quotaTag].filter(Boolean);
    let rightStatus = rightParts.join(` ${colors.dim}·${colors.reset} `);

    let leftLen = stripAnsi(leftStatus).length;
    let rightLen = stripAnsi(rightStatus).length;

    if (leftLen + rightLen + 2 > cols) {
      leftStatus = `${colors.dim}esc cancel  •  enter steer  •  shift+tab${colors.reset}`;
      leftLen = stripAnsi(leftStatus).length;
    }
    if (leftLen + rightLen + 2 > cols) {
      rightParts = [modelName, effortTag, quotaTag].filter(Boolean);
      rightStatus = rightParts.join(` ${colors.dim}·${colors.reset} `);
      rightLen = stripAnsi(rightStatus).length;
    }
    if (leftLen + rightLen + 2 > cols) {
      leftStatus = `${colors.dim}esc cancel  •  enter steer${colors.reset}`;
      leftLen = stripAnsi(leftStatus).length;
    }
    if (leftLen + rightLen + 2 > cols) {
      rightParts = [modelName, effortTag].filter(Boolean);
      rightStatus = rightParts.join(` ${colors.dim}·${colors.reset} `);
      rightLen = stripAnsi(rightStatus).length;
    }
    if (leftLen + rightLen + 2 > cols) {
      leftStatus = `${colors.dim}esc cancel${colors.reset}`;
      leftLen = stripAnsi(leftStatus).length;
    }
    if (leftLen + rightLen + 2 > cols) {
      rightParts = [modelName];
      rightStatus = rightParts.join('');
      rightLen = stripAnsi(rightStatus).length;
    }
    if (leftLen + rightLen + 2 > cols) {
      const maxModelLen = Math.max(3, cols - leftLen - 3);
      rightStatus = modelName.length > maxModelLen ? modelName.slice(0, maxModelLen - 1) + '…' : modelName;
      rightLen = stripAnsi(rightStatus).length;
    }

    const padStatus = Math.max(1, cols - leftLen - rightLen);
    let line4 = `${leftStatus}${' '.repeat(padStatus)}${rightStatus}`;
    if (stringWidth(line4) > cols) {
      line4 = truncate(line4, cols);
    }

    return [line0, line1, inputLine, line3, line4];
  }

  // Classic 4-line bar (top divider, status, middle divider, footer)
  const line0 = `${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`;
  const line1 = statusLine;
  const line2 = `${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`;

  let leftStatus = `${colors.dim}esc to interrupt  •  ctrl+c cancel${colors.reset}`;
  let rightParts = [userTag, modelName, effortTag, quotaTag].filter(Boolean);
  let rightStatus = rightParts.join(` ${colors.dim}·${colors.reset} `);

  let leftLen = stripAnsi(leftStatus).length;
  let rightLen = stripAnsi(rightStatus).length;

  if (leftLen + rightLen + 2 > cols) {
    leftStatus = `${colors.dim}esc interrupt  •  ctrl+c${colors.reset}`;
    leftLen = stripAnsi(leftStatus).length;
  }
  if (leftLen + rightLen + 2 > cols) {
    rightParts = [modelName, effortTag, quotaTag].filter(Boolean);
    rightStatus = rightParts.join(` ${colors.dim}·${colors.reset} `);
    rightLen = stripAnsi(rightStatus).length;
  }
  if (leftLen + rightLen + 2 > cols) {
    rightParts = [modelName, effortTag].filter(Boolean);
    rightStatus = rightParts.join(` ${colors.dim}·${colors.reset} `);
    rightLen = stripAnsi(rightStatus).length;
  }
  if (leftLen + rightLen + 2 > cols) {
    leftStatus = `${colors.dim}esc interrupt${colors.reset}`;
    leftLen = stripAnsi(leftStatus).length;
  }
  if (leftLen + rightLen + 2 > cols) {
    rightParts = [modelName];
    rightStatus = rightParts.join('');
    rightLen = stripAnsi(rightStatus).length;
  }
  if (leftLen + rightLen + 2 > cols) {
    const maxModelLen = Math.max(3, cols - leftLen - 3);
    rightStatus = modelName.length > maxModelLen ? modelName.slice(0, maxModelLen - 1) + '…' : modelName;
    rightLen = stripAnsi(rightStatus).length;
  }

  const padStatus = Math.max(1, cols - leftLen - rightLen);
  let line3 = `${leftStatus}${' '.repeat(padStatus)}${rightStatus}`;
  if (stringWidth(line3) > cols) {
    line3 = truncate(line3, cols);
  }

  return [line0, line1, line2, line3];
}

export function formatSteeringPromptBar(options: WorkingBarRenderOptions = {}): string[] {
  return formatWorkingPromptBar({ ...options, interactive: true });
}

export class BeurreWorkingBar {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private rawGlyphs = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIdx = 0;
  private timer: Timer | null = null;
  private isTTY = Boolean(process.stdout.isTTY);
  private barDrawn = false;
  private statusText = 'Whipping up solution...';
  private customIcon = '';
  private options: WorkingBarRenderOptions = {};
  private tokenBuffer = '';
  private lastFlushTime = 0;
  private onResizeBound: () => void;
  private onDataBound: ((chunk: Buffer) => void) | null = null;
  private wasRaw = false;

  // Steering interactive input state
  private inputBuffer = '';
  private cursor = 0;
  private placeholder = 'Type a message to steer agent (Esc to cancel)...';
  private inPaste = false;
  private pasteBuffer = '';
  private history: string[] = [];
  private historyPos = 0;
  private savedDraft = '';
  private lastStatusUpdateTime = 0;

  // Active phase tracking for live dynamic progression
  private currentPhase: 'idle' | 'status' | 'thinking' | 'generating' | 'tool' = 'status';
  private phaseStartTime = 0;
  private phaseDetail = '';
  private baseToolDetail = '';
  private liveDetail = '';
  private phaseTokens = 0;
  private phaseTokPerSec = 0;
  private phaseSnippet = '';
  private isRendering = false;

  constructor(options: WorkingBarRenderOptions = {}) {
    this.options = { ...options };
    this.history = options.history ? [...options.history] : [];
    this.historyPos = this.history.length;
    this.onResizeBound = () => this.handleResize();
  }

  isDrawn(): boolean {
    return this.barDrawn;
  }

  getStatusText(): string {
    return this.statusText;
  }

  getInputBuffer(): string {
    return this.inputBuffer;
  }

  setInputBuffer(val: string): void {
    this.inputBuffer = val;
    this.cursor = val.length;
    if (this.isTTY && this.barDrawn) {
      this.updateInputLine();
    }
  }

  getCursor(): number {
    return this.cursor;
  }

  getCursorCol(cols = process.stdout.columns || 80): number {
    const effectiveCols = Math.max(10, cols);
    if (!this.inputBuffer || this.inputBuffer.length === 0) {
      return 3;
    }
    const maxTextCols = Math.max(5, effectiveCols - 3);
    const bufLen = this.inputBuffer.length;
    const cur = Math.max(0, Math.min(this.cursor, bufLen));
    if (bufLen <= maxTextCols) {
      return Math.min(effectiveCols, 3 + cur);
    }
    if (cur < maxTextCols - 1) {
      return Math.min(effectiveCols, 3 + cur);
    }
    if (cur > bufLen - (maxTextCols - 1)) {
      const startIdx = bufLen - (maxTextCols - 1);
      return Math.min(effectiveCols, 3 + 1 + (cur - startIdx));
    }
    const windowSize = maxTextCols - 2;
    const startIdx = cur - Math.floor(windowSize / 2);
    return Math.min(effectiveCols, 3 + 1 + (cur - startIdx));
  }

  getEffort(): string {
    return this.options.effort || 'high';
  }

  steer(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    this.inputBuffer = '';
    this.cursor = 0;
    if (this.isTTY && this.barDrawn) {
      this.updateInputLine();
    }
    this.options.onSteer?.(trimmed);
  }

  handleInput(keyStr: string): void {
    // Handle bracketed paste continuation
    if (this.inPaste) {
      if (keyStr.includes('\x1b[201~')) {
        const parts = keyStr.split('\x1b[201~');
        this.pasteBuffer += parts[0];
        const cleanPaste = this.pasteBuffer.replace(/[\r\n]+/g, ' ');
        this.inputBuffer = this.inputBuffer.slice(0, this.cursor) + cleanPaste + this.inputBuffer.slice(this.cursor);
        this.cursor += cleanPaste.length;
        this.inPaste = false;
        this.pasteBuffer = '';
        this.updateInputLine();
      } else {
        this.pasteBuffer += keyStr;
      }
      return;
    }

    // Handle bracketed paste start
    if (keyStr.includes('\x1b[200~')) {
      const parts = keyStr.split('\x1b[200~');
      const rest = parts.slice(1).join('\x1b[200~');
      if (rest.includes('\x1b[201~')) {
        const pasteParts = rest.split('\x1b[201~');
        const cleanPaste = pasteParts[0].replace(/[\r\n]+/g, ' ');
        this.inputBuffer = this.inputBuffer.slice(0, this.cursor) + cleanPaste + this.inputBuffer.slice(this.cursor);
        this.cursor += cleanPaste.length;
        this.updateInputLine();
      } else {
        this.inPaste = true;
        this.pasteBuffer = rest;
      }
      return;
    }

    // Pure Esc key (length 1) -> cancel/interrupt immediately
    if (keyStr === '\x1b') {
      this.inPaste = false;
      this.pasteBuffer = '';
      this.options.onCancel?.();
      return;
    }

    // Ctrl+C -> cancel/interrupt immediately
    if (keyStr === '\x03') {
      this.options.onCancel?.();
      return;
    }

    // Enter (\r or \n) -> steer agent
    if (keyStr === '\r' || keyStr === '\n') {
      const msg = this.inputBuffer.trim();
      if (msg.length > 0) {
        this.history.push(msg);
        this.historyPos = this.history.length;
        this.inputBuffer = '';
        this.cursor = 0;
        this.updateInputLine();
        this.options.onSteer?.(msg);
      }
      return;
    }

    // Shift+Tab effort cycling (\x1b[Z backtab, \x1b[27;2;9~, \x1b[9;2u)
    if (keyStr === '\x1b[Z' || keyStr === '\x1b[27;2;9~' || keyStr === '\x1b[9;2u') {
      const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
      const curEffort = (this.options.effort || 'high').toLowerCase();
      const curIdx = efforts.indexOf(curEffort);
      const nextEffort = efforts[(curIdx + 1) % efforts.length];
      this.options.effort = nextEffort;
      this.options.onCycleEffort?.(nextEffort);
      this.updateFooterLine();
      return;
    }

    // Up Arrow (\x1b[A or \x1bOA) -> navigate steering history
    if (keyStr === '\x1b[A' || keyStr === '\x1bOA') {
      if (this.history.length > 0 && this.historyPos > 0) {
        if (this.historyPos === this.history.length) {
          this.savedDraft = this.inputBuffer;
        }
        this.historyPos--;
        this.inputBuffer = this.history[this.historyPos];
        this.cursor = this.inputBuffer.length;
        this.updateInputLine();
      }
      return;
    }

    // Down Arrow (\x1b[B or \x1bOB) -> navigate steering history
    if (keyStr === '\x1b[B' || keyStr === '\x1bOB') {
      if (this.historyPos < this.history.length) {
        this.historyPos++;
        if (this.historyPos === this.history.length) {
          this.inputBuffer = this.savedDraft;
        } else {
          this.inputBuffer = this.history[this.historyPos];
        }
        this.cursor = this.inputBuffer.length;
        this.updateInputLine();
      }
      return;
    }

    // Word left: Alt+Left / Ctrl+Left (\x1b[1;3D, \x1b[1;5D, \x1bb)
    if (keyStr === '\x1b[1;3D' || keyStr === '\x1b[1;5D' || keyStr === '\x1bb') {
      let idx = this.cursor;
      while (idx > 0 && /\s/.test(this.inputBuffer[idx - 1])) idx--;
      while (idx > 0 && !/\s/.test(this.inputBuffer[idx - 1])) idx--;
      this.cursor = idx;
      this.updateCursorPos();
      return;
    }

    // Word right: Alt+Right / Ctrl+Right (\x1b[1;3C, \x1b[1;5C, \x1bf)
    if (keyStr === '\x1b[1;3C' || keyStr === '\x1b[1;5C' || keyStr === '\x1bf') {
      let idx = this.cursor;
      while (idx < this.inputBuffer.length && !/\s/.test(this.inputBuffer[idx])) idx++;
      while (idx < this.inputBuffer.length && /\s/.test(this.inputBuffer[idx])) idx++;
      this.cursor = idx;
      this.updateCursorPos();
      return;
    }

    // Backspace (\x7f or \x08)
    if (keyStr === '\x7f' || keyStr === '\x08') {
      if (this.cursor > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, this.cursor - 1) + this.inputBuffer.slice(this.cursor);
        this.cursor--;
        this.updateInputLine();
      }
      return;
    }

    // Delete (\x1b[3~)
    if (keyStr === '\x1b[3~') {
      if (this.cursor < this.inputBuffer.length) {
        this.inputBuffer = this.inputBuffer.slice(0, this.cursor) + this.inputBuffer.slice(this.cursor + 1);
        this.updateInputLine();
      }
      return;
    }

    // Left Arrow (\x1b[D or \x1b[OD)
    if (keyStr === '\x1b[D' || keyStr === '\x1b[OD') {
      if (this.cursor > 0) {
        this.cursor--;
        this.updateCursorPos();
      }
      return;
    }

    // Right Arrow (\x1b[C or \x1b[OC)
    if (keyStr === '\x1b[C' || keyStr === '\x1b[OC') {
      if (this.cursor < this.inputBuffer.length) {
        this.cursor++;
        this.updateCursorPos();
      }
      return;
    }

    // Home (\x1b[H, \x1bOH, \x1b[1~, \x01)
    if (keyStr === '\x1b[H' || keyStr === '\x1bOH' || keyStr === '\x1b[1~' || keyStr === '\x01') {
      this.cursor = 0;
      this.updateCursorPos();
      return;
    }

    // End (\x1b[F, \x1bOF, \x1b[4~, \x05)
    if (keyStr === '\x1b[F' || keyStr === '\x1bOF' || keyStr === '\x1b[4~' || keyStr === '\x05') {
      this.cursor = this.inputBuffer.length;
      this.updateCursorPos();
      return;
    }

    // Ctrl+U (kill line to start)
    if (keyStr === '\x15') {
      this.inputBuffer = this.inputBuffer.slice(this.cursor);
      this.cursor = 0;
      this.updateInputLine();
      return;
    }

    // Ctrl+K (kill line to end)
    if (keyStr === '\x0b') {
      this.inputBuffer = this.inputBuffer.slice(0, this.cursor);
      this.updateInputLine();
      return;
    }

    // Ctrl+W or Alt+Backspace (delete word left)
    if (keyStr === '\x17' || keyStr === '\x1b\x7f') {
      let idx = this.cursor;
      while (idx > 0 && /\s/.test(this.inputBuffer[idx - 1])) idx--;
      while (idx > 0 && !/\s/.test(this.inputBuffer[idx - 1])) idx--;
      this.inputBuffer = this.inputBuffer.slice(0, idx) + this.inputBuffer.slice(this.cursor);
      this.cursor = idx;
      this.updateInputLine();
      return;
    }

    // Printable text or bracketed/raw paste
    if (!keyStr.startsWith('\x1b') && !keyStr.startsWith('\x00') && keyStr.charCodeAt(0) >= 32) {
      const cleanStr = keyStr.replace(/[\r\n]+/g, ' ');
      this.inputBuffer = this.inputBuffer.slice(0, this.cursor) + cleanStr + this.inputBuffer.slice(this.cursor);
      this.cursor += cleanStr.length;
      this.updateInputLine();
      return;
    }
  }

  start(initialStatus = 'Whipping up solution...'): void {
    this.statusText = initialStatus;
    this.currentPhase = 'status';
    this.phaseStartTime = Date.now();
    this.phaseDetail = '';
    this.customIcon = '';
    this.spinnerIdx = 0;
    this.barDrawn = false;
    this.tokenBuffer = '';
    this.lastFlushTime = Date.now();
    this.inputBuffer = '';
    this.cursor = 0;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Hook up stdin for steering input
    if (process.stdin.isTTY) {
      this.wasRaw = Boolean(process.stdin.isRaw);
      try {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        this.onDataBound = (chunk: Buffer) => {
          this.handleInput(chunk.toString('utf-8'));
        };
        process.stdin.on('data', this.onDataBound);
      } catch {}
    }

    if (!this.isTTY) return;

    process.stdout.write('\x1b[?25h'); // Show cursor on steering prompt line
    this.renderInitialBar();

    if (process.stdout.on) {
      process.stdout.on('resize', this.onResizeBound);
    }

    this.timer = setInterval(() => {
      this.spinnerIdx = (this.spinnerIdx + 1) % this.frames.length;

      // Update dynamic live time for ongoing phases
      if (this.currentPhase === 'tool' && this.phaseDetail && this.phaseStartTime > 0) {
        const elapsed = (Date.now() - this.phaseStartTime) / 1000;
        if (elapsed >= 0.1) {
          this.statusText = `Executing ${this.phaseDetail} (${elapsed.toFixed(1)}s)...`;
        }
      } else if (this.currentPhase === 'thinking' && this.phaseStartTime > 0) {
        const elapsed = (Date.now() - this.phaseStartTime) / 1000;
        const snippetSuffix = this.phaseSnippet ? `: ${this.phaseSnippet}...` : '...';
        this.statusText = `Thinking (~${this.phaseTokens} tokens • ${elapsed.toFixed(1)}s)${snippetSuffix}`;
      } else if (this.currentPhase === 'generating' && this.phaseStartTime > 0) {
        const elapsed = (Date.now() - this.phaseStartTime) / 1000;
        const speed = this.phaseTokPerSec > 0
          ? `${this.phaseTokPerSec.toFixed(1)} tok/s • `
          : (elapsed > 0 && this.phaseTokens > 0 ? `${(this.phaseTokens / elapsed).toFixed(1)} tok/s • ` : '');
        const snippetSuffix = this.phaseSnippet ? `: "${this.phaseSnippet}"` : '';
        this.statusText = `Generating (~${this.phaseTokens} tokens • ${speed}${elapsed.toFixed(1)}s)${snippetSuffix}...`;
      } else if (this.currentPhase === 'status' && this.phaseStartTime > 0) {
        const elapsed = (Date.now() - this.phaseStartTime) / 1000;
        if (elapsed >= 0.5 && this.statusText.startsWith('Whipping up solution')) {
          this.statusText = `Whipping up solution (${elapsed.toFixed(1)}s)...`;
        }
      }

      if (this.tokenBuffer.length > 0) {
        this.flushTokens();
      } else {
        this.updateStatusLineInPlace();
      }
    }, 80);
  }

  update(status: string, icon?: string): void {
    this.currentPhase = 'status';
    this.phaseStartTime = Date.now();
    this.phaseDetail = '';
    this.phaseSnippet = '';
    this.statusText = status;
    if (icon !== undefined) {
      this.customIcon = icon;
    } else {
      this.customIcon = '';
    }
    if (this.isTTY && this.barDrawn) {
      this.updateStatusLineInPlace();
    }
  }

  setThinking(tokens: number, elapsedSec?: number, snippet?: string): void {
    this.currentPhase = 'thinking';
    this.customIcon = '';
    this.phaseTokens = tokens;
    this.phaseSnippet = snippet || '';
    if (elapsedSec !== undefined && elapsedSec > 0) {
      this.phaseStartTime = Date.now() - Math.round(elapsedSec * 1000);
      const snippetSuffix = snippet ? `: ${snippet}...` : '...';
      this.statusText = `Thinking (~${tokens} tokens • ${elapsedSec.toFixed(1)}s)${snippetSuffix}`;
    } else {
      if (this.phaseStartTime === 0) {
        this.phaseStartTime = Date.now();
      }
      const elapsed = Math.max(0, (Date.now() - this.phaseStartTime) / 1000);
      const snippetSuffix = snippet ? `: ${snippet}...` : '...';
      this.statusText = `Thinking (~${tokens} tokens • ${elapsed.toFixed(1)}s)${snippetSuffix}`;
    }
    if (this.isTTY && this.barDrawn) {
      this.updateStatusLineInPlace();
    }
  }

  setGenerating(tokens: number, tokPerSec?: number, elapsedSec?: number, snippet?: string): void {
    this.currentPhase = 'generating';
    this.customIcon = '';
    this.phaseTokens = tokens;
    if (snippet !== undefined) {
      this.phaseSnippet = snippet.slice(-30).trim();
    }
    if (elapsedSec !== undefined && elapsedSec > 0) {
      this.phaseStartTime = Date.now() - Math.round(elapsedSec * 1000);
    } else if (this.phaseStartTime === 0) {
      this.phaseStartTime = Date.now();
    }
    const elapsed = elapsedSec !== undefined && elapsedSec > 0
      ? elapsedSec
      : Math.max(0, (Date.now() - this.phaseStartTime) / 1000);
    const speed = (tokPerSec !== undefined && tokPerSec > 0)
      ? `${tokPerSec.toFixed(1)} tok/s • `
      : (elapsed > 0 && tokens > 0 ? `${(tokens / elapsed).toFixed(1)} tok/s • ` : '');
    this.phaseTokPerSec = tokPerSec || (elapsed > 0 ? tokens / elapsed : 0);
    const snippetSuffix = this.phaseSnippet ? `: "${this.phaseSnippet}"` : '';
    this.statusText = `Generating (~${tokens} tokens • ${speed}${elapsed.toFixed(1)}s)${snippetSuffix}...`;
    const now = Date.now();
    if (this.isTTY && this.barDrawn && now - this.lastStatusUpdateTime >= 40) {
      this.lastStatusUpdateTime = now;
      this.updateStatusLineInPlace();
    }
  }

  setTool(name: string, args: Record<string, unknown>, elapsedSec?: number): void {
    // Tool arguments arrive as untrusted JSON from the model, so every field is
    // narrowed through one guard rather than asserted to a type it may not have.
    const str = (key: string) => {
      const v = args[key];
      return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
    };
    const label: Record<string, string> = {
      bash: `bash: ${str('command')}`,
      read: `read: ${str('path')}`,
      write: `write: ${str('path')}`,
      edit: `edit: ${str('path')}`,
      web_search: `web search: "${str('query')}"`,
      subagent_run: `subagent ${str('subagent')}`,
      generate_image: `image: "${str('prompt').slice(0, 30)}"`,
    };
    const detail = label[name] ?? name;
    this.currentPhase = 'tool';
    // A known tool has its own glyph from the caller; an unknown one gets a
    // neutral dot rather than a wrong icon.
    this.customIcon = label[name] ? '' : '●';
    this.baseToolDetail = detail;
    this.liveDetail = '';
    this.phaseDetail = detail;
    this.phaseStartTime = Date.now() - Math.round((elapsedSec ?? 0) * 1000);
    this.statusText = elapsedSec !== undefined && elapsedSec > 0
      ? `Executing ${detail} (${elapsedSec.toFixed(1)}s)...`
      : `Executing ${detail}...`;
    if (this.isTTY && this.barDrawn) {
      this.updateStatusLineInPlace();
    }
  }

  setLiveDetail(detail: string): void {
    if (this.currentPhase === 'tool') {
      const lines = detail.trim().split('\n').filter(Boolean);
      const cleaned = (lines.pop() || '').slice(0, 35);
      if (cleaned) {
        this.liveDetail = cleaned;
        this.phaseDetail = `${this.baseToolDetail} [${cleaned}]`;
        this.statusText = `Executing ${this.phaseDetail}...`;
        if (this.isTTY && this.barDrawn) {
          this.updateStatusLineInPlace();
        }
      }
    }
  }

  writeAbove(text: string): void {
    if (!text) return;
    if (!this.isTTY) {
      process.stdout.write(text);
      return;
    }
    this.isRendering = true;
    try {
      const endsWithNewline = text.endsWith('\n');
      const out = endsWithNewline ? text : text + '\n';
      const cols = process.stdout.columns || 80;
      const lines = formatWorkingPromptBar({
        cols,
        spinnerFrame: this.getCurrentFrame(),
        statusText: this.statusText,
        model: this.options.model,
        effort: this.options.effort,
        user: this.options.user,
        quotaText: this.options.quotaText,
        interactive: true,
        inputBuffer: this.inputBuffer,
        cursor: this.cursor,
        placeholder: this.placeholder,
      });
      const cursorCol = this.getCursorCol(cols);

      if (this.barDrawn) {
        process.stdout.write(
          `\x1b[?2026h\x1b[?25l\x1b[2A\r\x1b[J${out}${lines.join('\n')}\x1b[2A\r\x1b[${cursorCol}G\x1b[?25h\x1b[?2026l`
        );
      } else {
        process.stdout.write(
          `\x1b[?2026h\x1b[?25l${out}${lines.join('\n')}\x1b[2A\r\x1b[${cursorCol}G\x1b[?25h\x1b[?2026l`
        );
        this.barDrawn = true;
      }
    } finally {
      this.isRendering = false;
    }
  }

  writeToken(token: string): void {
    if (!this.isTTY) {
      process.stdout.write(token);
      return;
    }
    this.tokenBuffer += token;
    const now = Date.now();
    if (this.tokenBuffer.includes('\n') || now - this.lastFlushTime > 40) {
      this.flushTokens();
    }
  }

  flushTokens(): void {
    if (!this.tokenBuffer) return;
    const text = this.tokenBuffer;
    this.tokenBuffer = '';
    this.lastFlushTime = Date.now();
    this.writeAbove(text);
  }

  stop(finalText?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.onDataBound) {
      process.stdin.removeListener('data', this.onDataBound);
      this.onDataBound = null;
      if (process.stdin.isTTY && !this.wasRaw) {
        try {
          process.stdin.setRawMode(false);
        } catch {}
      }
    }
    this.inPaste = false;
    this.pasteBuffer = '';
    if (this.tokenBuffer) {
      const text = this.tokenBuffer;
      this.tokenBuffer = '';
      if (this.barDrawn) {
        this.clearBar();
      }
      process.stdout.write(text);
    }
    if (this.barDrawn) {
      this.clearBar();
    }
    if (this.isTTY) {
      process.stdout.write('\x1b[?25h'); // Show cursor
      if (process.stdout.removeListener) {
        process.stdout.removeListener('resize', this.onResizeBound);
      }
    }
    if (finalText) {
      console.log(finalText);
    }
  }

  private getCurrentFrame(): string {
    const SHIMMER = [colors.butterGold, colors.butterPale, colors.butterGold, colors.butterMelt];
    const tint = SHIMMER[this.spinnerIdx % SHIMMER.length];
    if (this.customIcon) {
      return `${this.customIcon} ${tint}${this.rawGlyphs[this.spinnerIdx] || '⠋'}${colors.reset}`;
    }
    return `${tint}${this.frames[this.spinnerIdx]}${colors.reset}`;
  }

  private renderInitialBar(): void {
    const cols = process.stdout.columns || 80;
    const lines = formatWorkingPromptBar({
      cols,
      spinnerFrame: this.getCurrentFrame(),
      statusText: this.statusText,
      model: this.options.model,
      effort: this.options.effort,
      user: this.options.user,
      quotaText: this.options.quotaText,
      interactive: true,
      inputBuffer: this.inputBuffer,
      cursor: this.cursor,
      placeholder: this.placeholder,
    });
    process.stdout.write(lines.join('\n'));
    // Cursor is currently at end of Line 4 (footer). Move up 2 lines to Line 2 and column getCursorCol()
    process.stdout.write(`\x1b[2A\r\x1b[${this.getCursorCol(cols)}G`);
    this.barDrawn = true;
  }

  private updateStatusLineInPlace(): void {
    if (this.isRendering || !this.barDrawn || !this.isTTY) return;
    const cols = process.stdout.columns || 80;
    const lines = formatWorkingPromptBar({
      cols,
      spinnerFrame: this.getCurrentFrame(),
      statusText: this.statusText,
      model: this.options.model,
      effort: this.options.effort,
      user: this.options.user,
      quotaText: this.options.quotaText,
      interactive: true,
      inputBuffer: this.inputBuffer,
      cursor: this.cursor,
      placeholder: this.placeholder,
    });
    // From Line 2, move up 2 lines to Line 0, clear line, write lines[0], move down 2 lines back to Line 2, restore column
    process.stdout.write(`\x1b[?25l\x1b[2A\r\x1b[2K${lines[0]}\x1b[2B\r\x1b[${this.getCursorCol(cols)}G\x1b[?25h`);
  }

  private updateInputLine(): void {
    if (this.isRendering || !this.barDrawn || !this.isTTY) return;
    const cols = process.stdout.columns || 80;
    const lines = formatWorkingPromptBar({
      cols,
      spinnerFrame: this.getCurrentFrame(),
      statusText: this.statusText,
      model: this.options.model,
      effort: this.options.effort,
      user: this.options.user,
      quotaText: this.options.quotaText,
      interactive: true,
      inputBuffer: this.inputBuffer,
      cursor: this.cursor,
      placeholder: this.placeholder,
    });
    // Cursor is on Line 2. Clear Line 2, write lines[2], restore column
    process.stdout.write(`\r\x1b[2K${lines[2]}\r\x1b[${this.getCursorCol(cols)}G`);
  }

  private updateFooterLine(): void {
    if (this.isRendering || !this.barDrawn || !this.isTTY) return;
    const cols = process.stdout.columns || 80;
    const lines = formatWorkingPromptBar({
      cols,
      spinnerFrame: this.getCurrentFrame(),
      statusText: this.statusText,
      model: this.options.model,
      effort: this.options.effort,
      user: this.options.user,
      quotaText: this.options.quotaText,
      interactive: true,
      inputBuffer: this.inputBuffer,
      cursor: this.cursor,
      placeholder: this.placeholder,
    });
    // From Line 2, move down 2 lines to Line 4, clear line, write lines[4], move up 2 lines back to Line 2, restore column
    process.stdout.write(`\x1b[?25l\x1b[2B\r\x1b[2K${lines[4]}\x1b[2A\r\x1b[${this.getCursorCol(cols)}G\x1b[?25h`);
  }

  private updateCursorPos(): void {
    if (!this.barDrawn || !this.isTTY) return;
    process.stdout.write(`\r\x1b[${this.getCursorCol()}G`);
  }

  private clearBar(): void {
    if (!this.barDrawn || !this.isTTY) return;
    // Cursor is on Line 2. Move up 2 lines to Line 0, clear from Line 0 down to bottom of screen
    process.stdout.write('\x1b[?25l\x1b[2A\r\x1b[J\x1b[?25h');
    this.barDrawn = false;
  }

  private handleResize(): void {
    if (!this.isTTY || !this.barDrawn) return;
    this.clearBar();
    this.renderInitialBar();
  }
}
