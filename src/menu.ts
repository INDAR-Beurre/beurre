import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { BeurreAgent } from './agent.ts';
import { relay, getModelDisplayName } from './relay.ts';
import { listSubagents } from './subagents.ts';
import { compactMessages } from './compact.ts';
import { BeurreLoopRunner } from './loop.ts';
import { openModelPicker } from './model-picker.ts';
import { b, colors, renderToast } from './theme.ts';
import { box, columns, fit, listWindow, stringWidth, termHeight, termWidth, truncate } from './layout.ts';

import { Overlay, isCharKey, readKey } from './overlay.ts';
export type MenuCategory = 'model' | 'agents' | 'workspace';

export interface MenuItem {
  id: string;
  category: MenuCategory;
  title: string;
  description: string;
  details: string[];
  /** Short hint shown right-aligned on the row. */
  hint: string;
  /** Words matched by the palette's search filter. */
  keywords?: string;
  getValue?: (agent: BeurreAgent, thinkingMode: string) => string;
  run?: (ctx: MenuContext) => Promise<void>;
}

export interface MenuOptions {
  thinkingMode?: 'expanded' | 'collapsed' | 'hidden';
  onToggleThinking?: (mode: 'expanded' | 'collapsed' | 'hidden') => void;
}

/** Everything an item action needs, so handlers never close over the menu. */
export interface MenuContext {
  agent: BeurreAgent;
  getThinkingMode: () => string;
  setThinkingMode: (mode: 'expanded' | 'collapsed' | 'hidden') => void;
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

const CATEGORY_LABELS: Record<MenuCategory, string> = {
  model: 'Model & reasoning',
  agents: 'Agents & automation',
  workspace: 'Workspace',
};

// -------------------------------------------------------------- actions ----

function prompt(question: string): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  process.stdout.write('\x1b[?25h');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(question, (answer) => {
    rl.close();
    process.stdout.write('\x1b[?25l');
    resolve(answer.trim());
  });
  return promise;
}

async function switchModel(ctx: MenuContext): Promise<void> {
  await openModelPicker(ctx.agent.getModel(), (m) => ctx.agent.setModel(m));
  console.log(
    `\n${renderToast(`Model set to ${getModelDisplayName(ctx.agent.getModel())} (${ctx.agent.getModel()})`, true)}\n`,
  );
}

function cycleEffort(ctx: MenuContext, dir = 1): void {
  const i = EFFORTS.indexOf(ctx.agent.getEffort().toLowerCase() as Effort);
  const next = EFFORTS[(i + dir + EFFORTS.length) % EFFORTS.length];
  ctx.agent.setEffort(next);
  console.log(`\n${renderToast(`Effort set to ${next}`, true)}\n`);
}

function cycleThinking(ctx: MenuContext): void {
  const order = ['expanded', 'collapsed', 'hidden'] as const;
  const next = order[(order.indexOf(ctx.getThinkingMode() as (typeof order)[number]) + 1) % order.length];
  ctx.setThinkingMode(next);
  console.log(`\n${renderToast(`Thinking blocks: ${next}`, true)}\n`);
}

async function showSubagents(): Promise<void> {
  console.log('');
  for (const s of listSubagents()) {
    console.log(`  ${b.gold(s.name.padEnd(12))} ${b.cream(s.modelId)}`);
    console.log(`  ${' '.repeat(12)} ${colors.gray}${truncate(s.role, Math.max(20, termWidth() - 20))}${colors.reset}`);
  }
  console.log(`\n${colors.dim}  Delegate with: /subagent <name> <task>${colors.reset}\n`);
}

async function startLoop(ctx: MenuContext): Promise<void> {
  const loopPrompt = await prompt(`  ${b.gold('Prompt to repeat:')} `);
  if (!loopPrompt) return;
  const maxRaw = await prompt(`  ${b.gold('Iterations (blank = until interrupted):')} `);
  const maxIterations = maxRaw ? Number.parseInt(maxRaw, 10) : undefined;
  if (maxRaw && Number.isNaN(maxIterations)) {
    console.log(`\n${renderToast(`Not a number: ${maxRaw}`, false)}\n`);
    return;
  }
  await new BeurreLoopRunner().start(ctx.agent, loopPrompt, { maxIterations });
}

async function showDiff(ctx: MenuContext): Promise<void> {
  try {
    const out = execSync('git diff HEAD', { cwd: ctx.agent.getCwd(), encoding: 'utf-8', timeout: 5000 });
    const lines = out.split('\n');
    if (!out.trim()) {
      console.log(`\n  ${b.green('Working tree clean.')}\n`);
      return;
    }
    console.log('');
    for (const line of lines.slice(0, 60)) {
      if (line.startsWith('+++') || line.startsWith('---')) console.log(`  ${colors.dim}${line}${colors.reset}`);
      else if (line.startsWith('+')) console.log(`  ${colors.green}${line}${colors.reset}`);
      else if (line.startsWith('-')) console.log(`  ${colors.red}${line}${colors.reset}`);
      else if (line.startsWith('@@')) console.log(`  ${colors.cyan}${line}${colors.reset}`);
      else console.log(`  ${colors.gray}${line}${colors.reset}`);
    }
    if (lines.length > 60) console.log(`  ${colors.dim}… ${lines.length - 60} more lines${colors.reset}`);
    console.log('');
  } catch (err) {
    console.log(`\n  ${b.red(`git diff failed: ${(err as Error).message}`)}\n`);
  }
}

async function compactContext(ctx: MenuContext): Promise<void> {
  const msgs = ctx.agent.getMessages();
  if (msgs.length <= 2) {
    console.log(`\n${renderToast('Nothing to compact yet.', true)}\n`);
    return;
  }
  const compacted = compactMessages(msgs, { iteration: 1, isLoop: false });
  ctx.agent.setMessages(compacted);
  console.log(`\n${renderToast(`Compacted ${msgs.length} → ${compacted.length} messages`, true)}\n`);
}

async function exportSession(ctx: MenuContext): Promise<void> {
  const target = path.join(ctx.agent.getCwd(), `beurre-${new Date().toISOString().slice(0, 10)}.md`);
  const out = [`# beurre session ${new Date().toISOString()}`, ''];
  for (const m of ctx.agent.getMessages()) {
    if (m.role === 'user') out.push(`**you**`, '', m.content, '');
    else if (m.role === 'assistant') out.push(`**${getModelDisplayName(ctx.agent.getModel())}**`, '', m.content, '');
    else if (m.role === 'tool') out.push(`> ${m.name ?? 'tool'}: ${(m.content ?? '').slice(0, 300)}`, '');
  }
  fs.writeFileSync(target, out.join('\n'), 'utf-8');
  console.log(`\n${renderToast(`Exported to ${target}`, true)}\n`);
}

async function showUsage(ctx: MenuContext): Promise<void> {
  const msgs = ctx.agent.getMessages();
  // Count assistant text into the assistant bucket, not the user bucket —
  // the old version summed both into `userChars`, so the breakdown lied.
  let userChars = 0;
  let assistantChars = 0;
  let toolChars = 0;
  for (const m of msgs) {
    const len = m.content?.length ?? 0;
    if (m.role === 'user') userChars += len;
    else if (m.role === 'assistant') assistantChars += len;
    else if (m.role === 'tool') toolChars += len;
  }
  const total = Math.round((userChars + assistantChars + toolChars) / 4);
  const width = termWidth();
  const row = (k: string, v: string) => `  ${columns(`${colors.dim}${k}${colors.reset}`, v, width - 2)}`;

  console.log('');
  for (const l of box({
    title: 'Session',
    width: Math.min(width, 76),
    lines: [
      row('id', `${colors.dim}${ctx.agent.getSessionId()}${colors.reset}`),
      row('model', `${b.gold(getModelDisplayName(ctx.agent.getModel()))} ${colors.dim}(${ctx.agent.getModel()})${colors.reset}`),
      row('effort', b.gold(ctx.agent.getEffort())),
      row('messages', b.cream(String(msgs.length))),
      row('tokens', b.gold(`~${total.toLocaleString()}`)),
      row('breakdown', colors.dim(`you ~${Math.round(userChars / 4)} · model ~${Math.round(assistantChars / 4)} · tools ~${Math.round(toolChars / 4)}`)),
    ],
  })) console.log(l);
  console.log('');
}

function showHelp(): void {
  const width = termWidth();
  const row = (k: string, v: string) => `  ${columns(`${b.gold(k)}`, `${colors.dim}${v}${colors.reset}`, width - 2)}`;
  console.log('');
  for (const l of box({
    title: 'Shortcuts',
    width: Math.min(width, 76),
    lines: [
      '',
      row('Enter', 'send · accept selection'),
      row('Shift+Enter', 'new line'),
      row('Shift+Tab', 'cycle reasoning effort'),
      row('Tab', 'complete command'),
      row('↑ ↓', 'history · navigate'),
      row('Ctrl+C', 'interrupt turn'),
      row('Esc', 'cancel · close'),
      '',
      row('/menu', 'this palette'),
      row('/models', 'switch model'),
      row('/help', 'this screen'),
      row('/exit', 'quit'),
    ],
  })) console.log(l);
  console.log('');
}

// ---------------------------------------------------------------- items ----

export const MENU_ITEMS: MenuItem[] = [
  {
    id: 'model',
    category: 'model',
    title: 'Model',
    hint: 'change',
    description: 'Choose the model that answers your prompts.',
    details: ['Browse every model the Relay Gateway exposes, with context size and supported efforts.'],
    keywords: 'llm switch picker choose brain',
    getValue: (a) => {
      const d = getModelDisplayName(a.getModel());
      return d === a.getModel() ? a.getModel() : `${d} (${a.getModel()})`;
    },
    run: switchModel,
  },
  {
    id: 'effort',
    category: 'model',
    title: 'Reasoning effort',
    hint: 'cycle',
    description: 'How hard the model thinks before answering.',
    details: ['low is fastest and cheapest. max is slowest and most thorough.'],
    keywords: 'thinking tokens depth high low',
    getValue: (a) => a.getEffort(),
    run: (ctx) => cycleEffort(ctx),
  },
  {
    id: 'thinking',
    category: 'model',
    title: 'Thinking blocks',
    hint: 'cycle',
    description: 'Show or hide the model’s reasoning as it works.',
    details: ['expanded shows full reasoning, collapsed shows a one-line summary, hidden shows none.'],
    keywords: 'reasoning show hide expand',
    getValue: (_a, mode) => mode,
    run: cycleThinking,
  },
  {
    id: 'subagents',
    category: 'agents',
    title: 'Subagents',
    hint: 'list',
    description: 'Specialists you can hand a task to.',
    details: ['Each subagent has its own model and instructions.'],
    keywords: 'architect review scout delegate team',
    getValue: () => `${listSubagents().length} available`,
    run: showSubagents,
  },
  {
    id: 'loop',
    category: 'agents',
    title: 'Autonomous loop',
    hint: 'run',
    description: 'Repeat one prompt until you stop it.',
    details: ['Useful for test-fix-retest cycles. History is compacted between runs.'],
    keywords: 'repeat automatic continuous',
    run: startLoop,
  },
  {
    id: 'diff',
    category: 'workspace',
    title: 'Working tree diff',
    hint: 'view',
    description: 'Uncommitted changes in this repository.',
    details: [],
    keywords: 'git changes uncommitted',
    getValue: (a) => {
      try {
        const out = execSync('git status --porcelain', { cwd: a.getCwd(), encoding: 'utf-8', timeout: 500 }).trim();
        if (!out) return 'clean';
        return `${out.split('\n').length} changed`;
      } catch {
        return 'not a repo';
      }
    },
    run: showDiff,
  },
  {
    id: 'compact',
    category: 'workspace',
    title: 'Compact context',
    hint: 'run',
    description: 'Summarise old turns to free up context.',
    details: ['Keeps decisions and file edits, drops the rest.'],
    keywords: 'summarise shrink token melt',
    getValue: (a) => `${a.getMessages().length} messages`,
    run: compactContext,
  },
  {
    id: 'export',
    category: 'workspace',
    title: 'Export session',
    hint: 'run',
    description: 'Save this conversation as Markdown.',
    details: [],
    keywords: 'save markdown file transcript',
    run: exportSession,
  },
  {
    id: 'usage',
    category: 'workspace',
    title: 'Session usage',
    hint: 'view',
    description: 'Token and message counts for this session.',
    details: [],
    keywords: 'tokens metrics stats cost',
    getValue: (a) => `${a.getMessages().length} messages`,
    run: showUsage,
  },
  {
    id: 'help',
    category: 'workspace',
    title: 'Shortcuts & commands',
    hint: 'view',
    description: 'Every keybinding and command.',
    details: [],
    keywords: 'help docs keys reference',
    run: showHelp,
  },
];

// -------------------------------------------------------------- palette ----

/** Rank items against a query; empty query preserves declaration order. */
export function filterMenuItems(items: MenuItem[], query: string): MenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const terms = q.split(/\s+/);
  return items.filter((item) => {
    const hay = `${item.title} ${item.description} ${item.keywords ?? ''}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/**
 * Render the palette. Pure: takes state, returns lines. Every line is fitted to
 * `width`, so Overlay.erase() can never drift from the painted height.
 *
 * Only the highlighted row resolves its live value. Resolving every row would
 * fork `git` on each keypress — the bug that made the old menu stutter.
 */
export function renderPalette(
  items: MenuItem[],
  selected: number,
  query: string,
  width: number,
  agent?: BeurreAgent,
  thinkingMode = 'expanded',
  maxRows = termHeight(),
): string[] {
  const filtered = filterMenuItems(items, query);
  const activeIndex = Math.min(selected, Math.max(0, filtered.length - 1));

  const head: string[] = [
    truncate(`${colors.bold}${colors.butterGold}beurre${colors.reset} ${colors.dim}settings`, width),
    '',
    truncate(
      `  ${colors.butterGold}search${colors.reset} ${
        query ? `${colors.white}${query}${colors.reset}` : `${colors.darkGray}type to filter…${colors.reset}`
      }`,
      width,
    ),
    '',
  ];

  const activeItem = filtered[activeIndex];
  const tail: string[] = [
    '',
    ...(activeItem
      ? [
          truncate(`  ${colors.butterCream}${activeItem.description}${colors.reset}`, width),
          ...activeItem.details
            .slice(0, 2)
            .map((d) => truncate(`  ${colors.dim}${d}${colors.reset}`, width)),
        ]
      : [truncate(`  ${colors.dim}no matches for “${query}”`, width)]),
    '',
    truncate(`  ${colors.dim}↑↓ move · enter select · esc close · type to filter${colors.reset}`, width),
  ];

  // Category headers consume rows the item budget does not account for, so the
  // window is shrunk until the body genuinely fits. Building a dozen rows is
  // cheap, so measure rather than predict.
  const budget = Math.max(1, maxRows - head.length - tail.length);

  const buildBody = (visible: number): string[] => {
    const w = listWindow(filtered, visible, activeIndex);
    const out: string[] = [];
    let lastCat: MenuCategory | null = null;
    for (const [i, item] of w.items.entries()) {
      if (item.category !== lastCat) {
        lastCat = item.category;
        out.push(truncate(`  ${colors.mutedBox}${CATEGORY_LABELS[item.category].toUpperCase()}${colors.reset}`, width));
      }
      const active = i === w.selected;
      const pointer = active ? `${colors.butterGold}❯${colors.reset}` : ' ';
      const name = active
        ? `${colors.bold}${colors.butterGold}${item.title}${colors.reset}`
        : `${colors.white}${item.title}${colors.reset}`;
      // Only the highlighted row resolves its live value: resolving every row
      // forked `git` on each keypress, which is what made the old menu stutter.
      const value = active && agent && item.getValue
        ? `${colors.butterCream}${item.getValue(agent, thinkingMode)}${colors.reset}`
        : '';
      const right = value
        ? `${value}  ${colors.darkGray}${item.hint}${colors.reset}`
        : `${colors.darkGray}${item.hint}${colors.reset}`;
      out.push(truncate(columns(`  ${pointer} ${name}`, right, width), width));
    }
    return out;
  };

  // Category headers count toward the body and the "… N more" line costs a
  // row, so shrink the window until the whole frame fits `budget`.
  let visible = Math.min(filtered.length, budget);
  let body = buildBody(visible);
  const rowsUsed = () => body.length + (filtered.length > visible ? 1 : 0);
  while (rowsUsed() > budget && visible > 1) body = buildBody(--visible);
  body = body.slice(0, Math.max(1, budget - (filtered.length > visible ? 1 : 0)));

  if (filtered.length > visible) {
    body.push(truncate(`  ${colors.darkGray}… ${filtered.length - visible} more`, width));
  }

  return [...head, ...body, ...tail];
}

/**
 * Open the settings palette. Returns when the user closes it or runs an action.
 * Non-TTY falls back to a plain numbered list so pipes and CI never hang.
 */
export async function showMenu(
  agent: BeurreAgent,
  _legacyRl?: readline.Interface,
  options: MenuOptions = {},
): Promise<void> {
  let thinkingMode = options.thinkingMode ?? 'expanded';
  const ctx: MenuContext = {
    agent,
    getThinkingMode: () => thinkingMode,
    setThinkingMode: (m) => {
      thinkingMode = m;
      options.onToggleThinking?.(m);
    },
  };

  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    return showMenuFallback(agent);
  }

  const overlay = new Overlay();
  let query = '';
  let selected = 0;

  try {
    for (;;) {
      const width = termWidth();
      const filtered = filterMenuItems(MENU_ITEMS, query);
      selected = Math.min(selected, Math.max(0, filtered.length - 1));
      overlay.paint(renderPalette(MENU_ITEMS, selected, query, width, agent, thinkingMode));

      const key = await readKey();

      if (key === 'esc' || (isCharKey(key) && (key.char === 'q' || key.char === '\x03'))) break;

      if (key === 'up') {
        if (filtered.length) selected = (selected - 1 + filtered.length) % filtered.length;
        continue;
      }
      if (key === 'down') {
        if (filtered.length) selected = (selected + 1) % filtered.length;
        continue;
      }
      if (key === 'pageup') { selected = Math.max(0, selected - 8); continue; }
      if (key === 'pagedown') { selected = Math.min(filtered.length - 1, selected + 8); continue; }

      if (key === 'backspace') {
        query = query.slice(0, -1);
        selected = 0;
        continue;
      }

      if (key === 'enter') {
        const item = filtered[selected];
        overlay.erase();
        if (!item) return;
        if (item.run) await item.run(ctx);
        return;
      }

      if (isCharKey(key)) {
        query += key.char;
        selected = 0;
      }
    }
  } finally {
    overlay.erase();
  }
}

/** Non-interactive listing for pipes and CI. */
async function showMenuFallback(agent: BeurreAgent): Promise<void> {
  for (const item of MENU_ITEMS) {
    const value = item.getValue?.(agent, 'expanded') ?? '';
    console.log(`${item.id.padEnd(12)} ${item.title}${value ? `  (${value})` : ''}`);
  }
}

export { relay, fit, stringWidth };
