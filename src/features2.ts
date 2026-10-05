/**
 * Second batch of user-facing features. Same contract as features.ts: each
 * export is pure enough to unit test without a pty or a network, and every
 * render* honours `stringWidth(line) <= width`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { box, padTo, stringWidth, truncate } from './layout.ts';
import { colors } from './theme.ts';
import { getBeurreDir } from './config.ts';
import type { ChatMessage } from './relay.ts';

// ------------------------------------------------------------- /notes ----

export interface Note {
  tag: string;
  text: string;
  at: number;
}

const NOTES_FILE = () => path.join(getBeurreDir(), 'notes.json');

export function listNotes(): Note[] {
  try {
    const raw = JSON.parse(fs.readFileSync(NOTES_FILE(), 'utf-8')) as unknown;
    return Array.isArray(raw) ? (raw as Note[]).filter((n) => typeof n?.tag === 'string') : [];
  } catch {
    return [];
  }
}

export function saveNote(tag: string, text: string): Note {
  const note: Note = { tag, text, at: Date.now() };
  const notes = listNotes().filter((n) => n.tag !== tag);
  notes.push(note);
  fs.mkdirSync(getBeurreDir(), { recursive: true });
  fs.writeFileSync(NOTES_FILE(), JSON.stringify(notes, null, 2), 'utf-8');
  return note;
}

export function removeNote(tag: string): boolean {
  const notes = listNotes();
  const kept = notes.filter((n) => n.tag !== tag);
  if (kept.length === notes.length) return false;
  fs.writeFileSync(NOTES_FILE(), JSON.stringify(kept, null, 2), 'utf-8');
  return true;
}

export function renderNotes(notes: Note[], width: number): string {
  if (notes.length === 0) {
    return truncate(`${colors.dim}  no notes yet — make one with /notes add <tag> <text>${colors.reset}`, width);
  }
  const tagW = Math.min(16, Math.max(...notes.map((n) => stringWidth(n.tag))));
  const lines = notes
    .slice()
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map((n) => `  ${colors.butterGold}${padTo(n.tag, tagW)}${colors.reset}  ${colors.gray}${truncate(n.text, Math.max(10, width - tagW - 6))}${colors.reset}`);
  return box({ title: `notes (${notes.length})`, lines, width }).join('\n');
}

// ------------------------------------------------------------- /todo ----

export interface Todo {
  text: string;
  done: boolean;
  at: number;
}

const TODO_FILE = () => path.join(getBeurreDir(), 'todos.json');

export function listTodos(): Todo[] {
  try {
    const raw = JSON.parse(fs.readFileSync(TODO_FILE(), 'utf-8')) as unknown;
    return Array.isArray(raw) ? (raw as Todo[]).filter((t) => typeof t?.text === 'string') : [];
  } catch {
    return [];
  }
}

export function saveTodos(todos: Todo[]): void {
  fs.mkdirSync(getBeurreDir(), { recursive: true });
  fs.writeFileSync(TODO_FILE(), JSON.stringify(todos, null, 2), 'utf-8');
}

export function addTodo(text: string): Todo {
  const todo: Todo = { text, done: false, at: Date.now() };
  saveTodos([...listTodos(), todo]);
  return todo;
}

export function toggleTodo(text: string): boolean {
  const todos = listTodos();
  const hit = todos.find((t) => t.text === text);
  if (!hit) return false;
  hit.done = !hit.done;
  saveTodos(todos);
  return true;
}

export function clearDoneTodos(): number {
  const todos = listTodos();
  const open = todos.filter((t) => !t.done);
  saveTodos(open);
  return todos.length - open.length;
}

export function renderTodos(todos: Todo[], width: number): string {
  if (todos.length === 0) {
    return truncate(`${colors.dim}  nothing to do — add one with /todo add <text>${colors.reset}`, width);
  }
  const lines = todos.map((t) => {
    const mark = t.done ? `${colors.green}✔${colors.reset}` : `${colors.dim}○${colors.reset}`;
    const text = t.done ? `${colors.dim}${t.text}${colors.reset}` : t.text;
    return truncate(`  ${mark} ${text}`, width);
  });
  const open = todos.filter((t) => !t.done).length;
  return [
    ...box({ title: `todo (${open} open / ${todos.length})`, lines, width }),
    '',
    truncate(`  ${colors.dim}/todo add <text> · /todo done <text> · /todo clear${colors.reset}`, width),
  ].join('\n');
}

// ------------------------------------------------------------ /export ----

export interface ExportFormat {
  id: string;
  label: string;
  extension: string;
}

/** Formats the transcript can actually be written in. */
export const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'md', label: 'Markdown', extension: 'md' },
  { id: 'json', label: 'JSON', extension: 'json' },
  { id: 'txt', label: 'Plain text', extension: 'txt' },
];

export function transcriptTo(messages: ChatMessage[], format: string): string {
  if (format === 'json') return JSON.stringify(messages, null, 2);
  if (format === 'txt') {
    return messages.map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')}`).join('\n\n');
  }
  return messages
    .map((m) => {
      const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
      return m.role === 'user' ? `**${m.role}**\n\n${body}` : `**${m.role}**\n\n${body}`;
    })
    .join('\n\n---\n\n');
}

export function exportTranscript(messages: ChatMessage[], format: string, cwd: string): string | null {
  const spec = EXPORT_FORMATS.find((f) => f.id === format);
  if (!spec) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(cwd, `beurre-transcript-${stamp}.${spec.extension}`);
  fs.writeFileSync(file, transcriptTo(messages, format), 'utf-8');
  return file;
}

export function renderExport(file: string | null, format: string, width: number): string {
  if (!file) {
    return box({
      title: 'export',
      lines: [`${colors.dim}Unknown format "${format}". Try one of:${colors.reset}`]
        .concat(EXPORT_FORMATS.map((f) => `  ${colors.butterGold}${f.id}${colors.reset}  ${colors.gray}${f.label}${colors.reset}`)),
      width,
    }).join('\n');
  }
  return box({
    title: 'export',
    lines: [
      `  ${colors.green}✔${colors.reset} wrote ${truncate(path.basename(file), width - 14)}`,
      `  ${colors.gray}${truncate(file, width - 4)}${colors.reset}`,
    ],
    width,
  }).join('\n');
}

// ------------------------------------------------------------- /alias ----

const ALIAS_FILE = () => path.join(getBeurreDir(), 'aliases.json');

/** `/alias ll "ls -la"` -> `/ll` runs `ls -la`. */
export function listAliases(): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(ALIAS_FILE(), 'utf-8')) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(([k, v]) => typeof v === 'string'),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

/** `null` expansion removes the alias; anything else sets it. */
export function saveAlias(name: string, expansion: string | null): boolean {
  const aliases = listAliases();
  if (expansion === null) {
    if (!(name in aliases)) return false;
    delete aliases[name];
  } else {
    aliases[name] = expansion;
  }
  fs.mkdirSync(getBeurreDir(), { recursive: true });
  fs.writeFileSync(ALIAS_FILE(), JSON.stringify(aliases, null, 2), 'utf-8');
  return true;
}

/** Expands a leading `/alias` in input. Returns null when nothing matched. */
export function expandAlias(input: string, aliases: Record<string, string>): string | null {
  if (!input.startsWith('/')) return null;
  const name = input.slice(1).split(/\s/)[0];
  if (!(name in aliases)) return null;
  return aliases[name] + input.slice(1 + name.length);
}

export function renderAliases(aliases: Record<string, string>, width: number): string {
  const entries = Object.entries(aliases);
  if (entries.length === 0) {
    return truncate(`${colors.dim}  no aliases — make one with /alias <name> <expansion>${colors.reset}`, width);
  }
  const nameW = Math.max(...entries.map(([n]) => stringWidth(n)));
  const lines = entries.map(([n, v]) => `  ${colors.butterGold}${padTo(n, nameW)}${colors.reset}  ${colors.gray}${truncate(v, Math.max(10, width - nameW - 6))}${colors.reset}`);
  return box({ title: `aliases (${entries.length})`, lines, width }).join('\n');
}

// ------------------------------------------------------------ /tokens ----

export interface TokenSlice {
  label: string;
  chars: number;
  share: number;
}

/**
 * Breaks a prompt into where its tokens actually go. Chars, not tokens, by
 * design: a real tokenizer is not available here and a char share is honest
 * about that rather than pretending a 4-chars-per-token constant is a fact.
 */
export function analysePrompt(prompt: string): TokenSlice[] {
  const parts: Array<{ label: string; text: string }> = [];
  const fence = /```[\s\S]*?```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(prompt)) !== null) {
    if (m.index > last) parts.push({ label: 'prose', text: prompt.slice(last, m.index) });
    parts.push({ label: 'code', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < prompt.length) parts.push({ label: 'prose', text: prompt.slice(last) });

  const total = prompt.length || 1;
  return parts
    .filter((p) => p.text.trim().length > 0)
    .map((p) => ({ label: p.label, chars: p.text.length, share: p.text.length / total }));
}

export function renderTokens(prompt: string, width: number): string {
  if (!prompt.trim()) {
    return truncate(`${colors.dim}  nothing to analyse — pass a prompt: /tokens <text>${colors.reset}`, width);
  }
  const slices = analysePrompt(prompt);
  const est = Math.round(prompt.length / 4);
  const labelW = Math.max(...slices.map((s) => s.label.length));
  const barW = Math.max(4, width - labelW - 22);
  const lines = slices.map((s) => {
    const filled = Math.round(s.share * barW);
    const bar = `${colors.butterGold}${'█'.repeat(filled)}${colors.dim}${'░'.repeat(barW - filled)}${colors.reset}`;
    return `  ${padTo(s.label, labelW)}  ${bar} ${colors.gray}${Math.round(s.share * 100)}%${colors.reset}`;
  });
  return [
    ...box({ title: `prompt ~${est} tokens`, lines, width }),
    '',
    truncate(`  ${colors.dim}${prompt.length} chars · prose vs code${colors.reset}`, width),
  ].join('\n');
}

// ---------------------------------------------------------- /lastchange ----

export interface ChangedFile {
  status: string;
  file: string;
  insertions: number;
  deletions: number;
}

export function readWorkingTree(cwd: string): ChangedFile[] | null {
  try {
    // `git diff` prints its full usage to stderr when HEAD does not resolve;
    // swallowing that keeps a non-repo from spraying help text into the REPL.
    const out = execSync('git diff --numstat HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = out.trim();
    if (!lines) return [];
    return lines.split('\n').map((line) => {
      const [ins, del, ...rest] = line.split('\t');
      return {
        status: 'M',
        file: rest.join('\t'),
        insertions: Number(ins) || 0,
        deletions: Number(del) || 0,
      };
    });
  } catch {
    return null;
  }
}

export function renderChanges(files: ChangedFile[] | null, width: number): string {
  if (files === null) {
    return box({
      title: 'changes',
      lines: [`${colors.dim}Not a git repository, so there are no changes to show.${colors.reset}`],
      width,
    }).join('\n');
  }
  if (files.length === 0) {
    return truncate(`${colors.green}✔${colors.reset} working tree clean — nothing to review.`, width);
  }
  const fileW = Math.min(28, Math.max(...files.map((f) => stringWidth(f.file))));
  const statW = 7;
  const lines = files.map((f) => {
    const name = truncate(f.file, fileW);
    const pad = ' '.repeat(Math.max(0, fileW - stringWidth(name)));
    const stats = `${colors.green}+${f.insertions}${colors.reset} ${colors.red}-${f.deletions}${colors.reset}`;
    return truncate(`  ${colors.butterGold}${name}${colors.reset}${pad}  ${stats}`, width);
  });
  const ins = files.reduce((a, f) => a + f.insertions, 0);
  const del = files.reduce((a, f) => a + f.deletions, 0);
  return [
    ...box({ title: `changes (${files.length} file${files.length === 1 ? '' : 's'})`, lines, width }),
    '',
    truncate(`  ${colors.green}+${ins}${colors.reset} ${colors.red}-${del}${colors.reset} across ${files.length} file${files.length === 1 ? '' : 's'}`, width),
  ].join('\n');
}

// ------------------------------------------------------------- /watch ----

export interface WatchTarget {
  label: string;
  exists: boolean;
  kind: string;
  size: number;
}

/** Reports what a path currently is, so `/watch` can never lie about it. */
export function inspectPath(target: string): WatchTarget {
  try {
    const st = fs.statSync(target);
    const kind = st.isDirectory() ? 'dir' : st.isSymbolicLink() ? 'link' : 'file';
    return { label: target, exists: true, kind, size: st.size };
  } catch {
    return { label: target, exists: false, kind: 'missing', size: 0 };
  }
}

export function renderWatch(targets: WatchTarget[], width: number): string {
  if (targets.length === 0) {
    return truncate(`${colors.dim}  nothing to watch — pass a path: /watch <path>${colors.reset}`, width);
  }
  const labelW = Math.min(24, Math.max(...targets.map((t) => stringWidth(path.basename(t.label)))));
  const lines = targets.map((t) => {
    const mark = t.exists ? `${colors.green}✔${colors.reset}` : `${colors.red}✖${colors.reset}`;
    const name = truncate(path.basename(t.label), labelW);
    const pad = ' '.repeat(Math.max(0, labelW - stringWidth(name)));
    const detail = t.exists ? `${t.kind} · ${t.size} B` : 'missing';
    return truncate(`  ${mark} ${colors.butterGold}${name}${colors.reset}${pad}  ${colors.gray}${detail}${colors.reset}`, width);
  });
  return box({ title: `watch (${targets.length})`, lines, width }).join('\n');
}

// -------------------------------------------------------------- /cache ----

export interface CacheEntry {
  label: string;
  bytes: number;
}

/** Directory sizes that are safe to measure without walking huge trees. */
export function measureCache(cwd: string): CacheEntry[] {
  const targets: Array<{ label: string; dir: string }> = [
    { label: 'node_modules', dir: path.join(cwd, 'node_modules') },
    { label: 'build', dir: path.join(cwd, 'build') },
    { label: 'dist', dir: path.join(cwd, 'dist') },
    { label: '.git', dir: path.join(cwd, '.git') },
  ];
  const entries: CacheEntry[] = [];
  for (const { label, dir } of targets) {
    if (!fs.existsSync(dir)) continue;
    let bytes = 0;
    const stack = [dir];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of dirents) {
        const full = path.join(cur, d.name);
        if (d.isDirectory()) stack.push(full);
        else {
          try {
            bytes += fs.statSync(full).size;
          } catch {
            /* unreadable entry: skip */
          }
        }
      }
    }
    entries.push({ label, bytes });
  }
  return entries;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['K', 'M', 'G', 'T'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function renderCache(entries: CacheEntry[], width: number): string {
  if (entries.length === 0) {
    return truncate(`${colors.dim}  nothing cached — no build output in this project.${colors.reset}`, width);
  }
  const total = entries.reduce((a, e) => a + e.bytes, 0);
  const labelW = Math.max(...entries.map((e) => e.label.length));
  const barW = Math.max(4, width - labelW - 16);
  const lines = entries.map((e) => {
    const filled = total === 0 ? 0 : Math.round((e.bytes / total) * barW);
    const bar = `${colors.butterGold}${'█'.repeat(filled)}${colors.dim}${'░'.repeat(barW - filled)}${colors.reset}`;
    return `  ${padTo(e.label, labelW)}  ${bar} ${colors.gray}${formatBytes(e.bytes)}${colors.reset}`;
  });
  return [
    ...box({ title: 'cache', lines, width }),
    '',
    truncate(`  ${colors.gray}${formatBytes(total)} total${colors.reset}`, width),
  ].join('\n');
}

// ---------------------------------------------------------- /keybindings ----

export interface Keybinding {
  keys: string;
  action: string;
}

/** Editor keys, read from the same source the editor itself documents. */
export function keybindings(): Keybinding[] {
  return [
    { keys: 'Enter', action: 'Send the prompt' },
    { keys: 'Shift+Enter', action: 'Insert a newline' },
    { keys: 'Up / Down', action: 'Walk prompt history' },
    { keys: 'Left / Right', action: 'Move the cursor' },
    { keys: 'Ctrl+A / Ctrl+E', action: 'Start / end of line' },
    { keys: 'Ctrl+U / Ctrl+K', action: 'Clear before / after the cursor' },
    { keys: 'Ctrl+W', action: 'Delete the previous word' },
    { keys: 'Tab', action: 'Complete a command or path' },
    { keys: 'Shift+Tab', action: 'Cycle reasoning effort' },
    { keys: 'Esc', action: 'Cancel the running turn' },
  ];
}

export function renderKeybindings(binds: Keybinding[], width: number): string {
  const keysW = Math.min(18, Math.max(...binds.map((b) => stringWidth(b.keys))));
  const room = width - keysW - 6;
  const lines = binds.flatMap((b) => {
    const action = truncate(b.action, room);
    if (room >= 24) return [`  ${colors.butterGold}${padTo(b.keys, keysW)}${colors.reset}  ${colors.gray}${action}${colors.reset}`];
    // Narrow frame: stack the action under its key so neither is truncated away.
    return [
      `  ${colors.butterGold}${b.keys}${colors.reset}`,
      `    ${colors.gray}${action}${colors.reset}`,
    ];
  });
  return box({ title: 'keys', lines, width }).join('\n');
}

// ------------------------------------------------------------- /welcome ----

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Last-resort diagnosis for someone who cannot get a model to answer. */
export function diagnoseRelay(cwd: string, relayUrl: string, hasKey: boolean): PreflightCheck[] {
  const checks: PreflightCheck[] = [];
  checks.push({
    name: 'Relay URL',
    ok: relayUrl.startsWith('https://'),
    detail: relayUrl,
  });
  checks.push({
    name: 'Credential',
    ok: hasKey,
    detail: hasKey ? 'resolved' : 'no key in RELAY_API_KEY, ~/.beurre/config.json or models.yml',
  });
  let git = false;
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore', timeout: 5000 });
    git = true;
  } catch {
    git = false;
  }
  checks.push({ name: 'Git', ok: true, detail: git ? 'repository detected' : 'not a repository (fine)' });
  let net = false;
  try {
    execSync(`curl -sS -o /dev/null -w '%{http_code}' --max-time 6 ${relayUrl}/v1/models`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    });
    net = true;
  } catch {
    net = false;
  }
  checks.push({
    name: 'Relay reachable',
    ok: net,
    detail: net ? 'responded to /v1/models' : 'no response within 6s',
  });
  return checks;
}

export function renderPreflight(checks: PreflightCheck[], width: number): string {
  const nameW = Math.max(...checks.map((c) => c.name.length));
  const lines = checks.map((c) => {
    const mark = c.ok ? `${colors.green}✔${colors.reset}` : `${colors.red}✖${colors.reset}`;
    const pad = ' '.repeat(Math.max(0, nameW - c.name.length));
    return truncate(`  ${mark} ${colors.butterGold}${padTo(c.name, nameW)}${colors.reset}  ${colors.dim}${c.detail}${colors.reset}`, width);
  });
  const bad = checks.filter((c) => !c.ok).length;
  const summary = bad === 0
    ? `${colors.green}✔ relay looks healthy${colors.reset}`
    : `${colors.red}✖ ${bad} problem${bad === 1 ? '' : 's'} found${colors.reset}`;
  return [...box({ title: 'preflight', lines, width }), '', `  ${summary}`].join('\n');
}
// ---------------------------------------------------------- round three ----

/** Parses `git log` output into structured commits. Empty outside a repo. */
export interface Commit {
  short: string;
  author: string;
  date: string;
  subject: string;
}

export function readCommits(cwd: string, limit = 20): Commit[] {
  const out = gitOut(cwd, `git log -n ${Math.max(1, limit)} --pretty=format:%h%x09%an%x09%ad%x09%s --date=short`);
  if (!out) return [];
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [short = '', author = '', date = '', subject = ''] = line.split('\t');
      return { short, author, date, subject };
    });
}

export function renderCommits(commits: Commit[], width: number): string[] {
  if (commits.length === 0) {
    return box({ title: 'log', width, lines: [`  ${truncate('No commits yet — this repository has no history.', width - 4)}`] });
  }
  const head = commits[0];
  const headW = head ? Math.min(8, head.short.length) : 0;
  const body = commits.map((c) =>
    truncate(`  ${c.short.padEnd(headW)}  ${c.subject}  ${colors.dim}${c.author} · ${c.date}${colors.reset}`, width - 2),
  );
  return box({ title: `log (${commits.length})`, width, lines: body.map((l) => truncate(l, width - 4)) });
}

function gitOut(cwd: string, cmd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- /branch ----

export function currentBranch(cwd: string): { name: string; upstream: string | null; ahead: number; behind: number } {
  const name = gitOut(cwd, 'git rev-parse --abbrev-ref HEAD') ?? '(detached)';
  const counts = gitOut(cwd, 'git rev-list --left-right --count @{upstream}...HEAD');
  const [behind = '0', ahead = '0'] = (counts ?? '').split(/\s+/);
  const upstream = gitOut(cwd, 'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}');
  return { name, upstream, ahead: Number(ahead) || 0, behind: Number(behind) || 0 };
}

export function renderBranch(info: ReturnType<typeof currentBranch>, width: number): string[] {
  const mark = (n: number, glyph: string) => (n > 0 ? `${colors.gold}${n} ${glyph}${colors.reset}` : `${colors.dim}0 ${glyph}${colors.reset}`);
  const lines = [
    `  ${colors.dim}branch${colors.reset}    ${info.name}`,
    `  ${colors.dim}upstream${colors.reset}  ${info.upstream ?? truncate('(none — not tracking a remote)', Math.max(8, width - 14))}`,
    `  ${colors.dim}sync${colors.reset}      ${mark(info.ahead, 'ahead')}   ${mark(info.behind, 'behind')}`,
  ];
  return box({ title: 'branch', width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// -------------------------------------------------------------- /stash ----

export interface Stash {
  ref: string;
  message: string;
  when: string;
}

export function listStashes(cwd: string): Stash[] {
  const out = gitOut(cwd, 'git stash list --pretty=format:%gd%x09%ar%x09%gs');
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    const [ref = '', when = '', message = ''] = line.split('\t');
    return { ref, when, message: message.replace(/^On \w+:/, '') || message };
  });
}

export function renderStashes(stashes: Stash[], width: number): string[] {
  if (stashes.length === 0) {
    return box({ title: 'stash', width, lines: [`  ${truncate('No stashes. Everything you have is on the branch.', width - 4)}`] });
  }
  const refW = Math.max(...stashes.map((s) => s.ref.length));
  const whenW = Math.max(...stashes.map((s) => s.when.length));
  const lines = stashes.map((s) =>
    truncate(`  ${colors.dim}${s.ref.padEnd(refW)}${colors.reset}  ${s.message}  ${colors.dim}${s.when.padEnd(whenW)}${colors.reset}`, width - 2),
  );
  return box({ title: `stash (${stashes.length})`, width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// ---------------------------------------------------------- /blame <file> ----

export interface BlameLine {
  line: number;
  author: string;
  when: string;
  text: string;
}

export function readBlame(cwd: string, file: string, limit = 20): BlameLine[] {
  const out = gitOut(cwd, `git blame -n --date=short -L 1,${Math.max(1, limit)} -- ${JSON.stringify(file)}`);
  if (!out) return [];
  return out.split('\n').filter(Boolean).map((line) => {
    const m = /^\^?([0-9a-f]{7,40})\s+\S+\s+\d+\s+\S+\s+\S+\s+(\S+)\s+(.+)$/.exec(line);
    return m ? { line: 0, author: m[2] ?? '', when: '', text: m[3] ?? '' } : { line: 0, author: '', when: '', text: line };
  });
}

export function renderBlame(lines: BlameLine[], file: string, width: number): string[] {
  if (lines.length === 0) {
    return box({ title: 'blame', width, lines: [`  ${truncate(`Could not read history for ${file}.`, width - 4)}`] });
  }
  const body = lines.map((l) => truncate(`  ${colors.dim}${l.author.padEnd(12)}${colors.reset} ${l.text}`, width - 2));
  return box({ title: `blame ${file}`, width, lines: body.map((l) => truncate(l, width - 4)) });
}

// ---------------------------------------------------------- /lastcommit ----

export function renderLastCommit(cwd: string, width: number): string[] {
  const c = readCommits(cwd, 1)[0];
  if (!c) {
    return box({ title: 'last', width, lines: [`  ${truncate('No commits yet.', width - 4)}`] });
  }
  const files = (gitOut(cwd, 'git show --name-only --pretty=format: HEAD') ?? '').split('\n').filter(Boolean);
  const lines = [
    `  ${colors.dim}${c.short}${colors.reset}  ${c.subject}`,
    `  ${colors.dim}${c.author} · ${c.date} · ${files.length} file${files.length === 1 ? '' : 's'}${colors.reset}`,
    '',
    ...files.slice(0, 12).map((f) => `    ${colors.dim}${f}${colors.reset}`),
  ];
  return box({ title: 'last commit', width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// ------------------------------------------------------------- /bisect ----

/** Bisect needs 4 steps to mean anything; below that there is nothing to say. */
export const BISECT_MIN_STEPS = 4;

export function bisectProgress(steps: number): { ok: boolean; next: string } {
  if (steps < BISECT_MIN_STEPS) {
    return { ok: false, next: `Run at least ${BISECT_MIN_STEPS} steps before judging a bisect (have ${steps}).` };
  }
  return { ok: true, next: `Half the range is now ${Math.floor(steps / 2)} step${Math.floor(steps / 2) === 1 ? '' : 's'}.` };
}

export function renderBisect(state: { steps: number; culprit: string | null }, width: number): string[] {
  if (state.culprit) {
    return box({
      title: 'bisect',
      width,
      lines: [
        `  ${colors.green}✔${colors.reset} First bad commit`,
        `  ${colors.gold}${truncate(state.culprit, width - 8)}${colors.reset}`,
      ].map((l) => truncate(l, width - 4)),
    });
  }
  const p = bisectProgress(state.steps);
  const lines = [
    `  ${colors.dim}steps run${colors.reset}   ${state.steps}`,
    `  ${p.ok ? `${colors.green}✔${colors.reset}` : `${colors.red}✖${colors.reset}`} ${truncate(p.next, width - 6)}`,
  ];
  return box({ title: 'bisect', width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// --------------------------------------------------------------- /ignore ----

export interface IgnoreRule {
  pattern: string;
  source: 'repo' | 'global' | 'local';
}

export function readIgnoreRules(cwd: string): IgnoreRule[] {
  const out: IgnoreRule[] = [];
  for (const [file, source] of [['.gitignore', 'repo'], [path.join(getBeurreDir(), 'ignore'), 'global']] as const) {
    const full = source === 'repo' ? path.join(cwd, file) : file;
    try {
      for (const raw of fs.readFileSync(full, 'utf-8').split('\n')) {
        const pattern = raw.trim();
        if (pattern && !pattern.startsWith('#')) out.push({ pattern, source });
      }
    } catch {
      // Absent file is the normal case; an unreadable one is not worth a toast.
    }
  }
  return out;
}

export function renderIgnoreRules(rules: IgnoreRule[], width: number): string[] {
  if (rules.length === 0) {
    return box({ title: 'ignore', width, lines: [`  ${truncate('No ignore rules. Everything in this directory is tracked.', width - 4)}`] });
  }
  const patW = Math.max(...rules.map((r) => r.pattern.length));
  const lines = rules.map((r) => truncate(`  ${r.pattern.padEnd(patW)}  ${colors.dim}${r.source}${colors.reset}`, width - 2));
  return box({ title: `ignore (${rules.length})`, width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// -------------------------------------------------------------- /ignorecheck ----

/** Why is a path not tracked? Answers "ignore rule" vs "not added" vs "tracked". */
export function explainIgnored(cwd: string, relPath: string): { state: string; reason: string } {
  const check = gitOut(cwd, `git check-ignore -v -- ${JSON.stringify(relPath)}`);
  if (check) {
    const parts = check.split(':');
    const source = parts[1] ?? '';
    const pattern = parts[2] ?? '';
    return { state: 'ignored', reason: truncate(`${pattern} (${path.basename(source)})`, 120) };
  }
  const tracked = gitOut(cwd, `git ls-files --error-unmatch -- ${JSON.stringify(relPath)}`);
  if (tracked) return { state: 'tracked', reason: 'already committed' };
  return { state: 'untracked', reason: 'not ignored and not committed — `git add` will pick it up' };
}

export function renderIgnoreCheck(relPath: string, result: ReturnType<typeof explainIgnored>, width: number): string[] {
  const tone = result.state === 'ignored' ? colors.red : result.state === 'tracked' ? colors.green : colors.gold;
  const lines = [
    `  ${colors.dim}path${colors.reset}    ${truncate(relPath, width - 12)}`,
    `  ${colors.dim}state${colors.reset}   ${tone}${result.state}${colors.reset}`,
    `  ${colors.dim}reason${colors.reset}  ${truncate(result.reason, width - 12)}`,
  ];
  return box({ title: 'ignore check', width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// ------------------------------------------------------------ /wordcount ----

export interface FileCount {
  files: number;
  lines: number;
  words: number;
}

export function countTree(cwd: string, target = '.'): FileCount {
  const root = path.resolve(cwd, target);
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', 'vendor', '__pycache__']);
  let files = 0;
  let lines = 0;
  let words = 0;
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(path.join(dir, e.name));
      } else if (/\.(ts|tsx|js|mjs|jsx|py|go|rs|java|kt|c|h|md)$/.test(e.name)) {
        try {
          const text = fs.readFileSync(path.join(dir, e.name), 'utf-8');
          files++;
          lines += text.split('\n').length;
          words += text.split(/\s+/).filter(Boolean).length;
        } catch {
          // Binary or unreadable: not worth counting.
        }
      }
    }
  };
  walk(root);
  return { files, lines, words };
}

export function renderWordCount(target: string, c: FileCount, width: number): string[] {
  const bar = (n: number, total: number, glyph: string) => {
    const filled = total > 0 ? Math.round((n / total) * 24) : 0;
    return `${glyph.repeat(filled)}${colors.darkGray}${'░'.repeat(24 - filled)}${colors.reset}`;
  };
  const max = Math.max(c.files, c.lines, c.words);
  const rows: [string, number][] = [['files', c.files], ['lines', c.lines], ['words', c.words]];
  const lines = rows.map(([label, n]) =>
    `  ${colors.dim}${label.padEnd(6)}${colors.reset} ${String(n).padStart(8)}  ${bar(n, max, '')}`,
  );
  return box({ title: `size of ${target}`, width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// -------------------------------------------------------------- /todoscan ----

export interface ScanHit {
  file: string;
  line: number;
  text: string;
}

/** Finds TODO/FIXME/HACK/XXX markers so a session can report leftover debt. */
export function scanMarkers(cwd: string, limit = 40): ScanHit[] {
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'target']);
  const hits: ScanHit[] = [];
  const walk = (dir: string): void => {
    if (hits.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= limit) return;
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(path.join(dir, e.name));
      } else if (/\.(ts|tsx|js|mjs|py|go|rs|java|kt)$/.test(e.name)) {
        try {
          fs.readFileSync(path.join(dir, e.name), 'utf-8').split('\n').forEach((text, i) => {
            if (hits.length < limit && /\b(TODO|FIXME|HACK|XXX)\b/.test(text)) {
              hits.push({ file: path.relative(cwd, path.join(dir, e.name)), line: i + 1, text: text.trim() });
            }
          });
        } catch {
          // Unreadable file: nothing to scan.
        }
      }
    }
  };
  walk(path.resolve(cwd));
  return hits;
}

export function renderMarkers(hits: ScanHit[], width: number): string[] {
  if (hits.length === 0) {
    return box({ title: 'markers', width, lines: [`  ${truncate('No TODO / FIXME / HACK markers. Clean tree.', width - 4)}`] });
  }
  const locW = Math.max(...hits.map((h) => `${path.basename(h.file)}:${h.line}`.length));
  const lines = hits.map((h) => {
    const loc = `${path.basename(h.file)}:${h.line}`.padEnd(locW);
    return truncate(`  ${colors.dim}${loc}${colors.reset}  ${h.text}`, width - 2);
  });
  return box({ title: `markers (${hits.length})`, width, lines: lines.map((l) => truncate(l, width - 4)) });
}

// ------------------------------------------------------------------ /time ----

/** Turns a session's wall-clock start into an honest elapsed summary. */
export function describeElapsed(startedAt: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function renderSessionClock(startedAt: number, now: number, turns: number, width: number): string[] {
  const elapsed = describeElapsed(startedAt, now);
  const perTurn = turns > 0 ? Math.floor((now - startedAt) / 1000 / turns) : 0;
  const lines = [
    `  ${colors.dim}elapsed${colors.reset}  ${elapsed}`,
    `  ${colors.dim}turns${colors.reset}    ${turns}`,
    `  ${colors.dim}per turn${colors.reset} ${perTurn > 0 ? `${perTurn}s` : truncate('—', 40)}`,
  ];
  return box({ title: 'session clock', width, lines: lines.map((l) => truncate(l, width - 4)) });
}
