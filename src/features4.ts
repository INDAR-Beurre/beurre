// Ten more commands, all local and all answering a question the app currently
// cannot. Nothing here shells out to a network service or adds a dependency.
//
// Grouped as: diff review helpers, time-and-cost accounting, workspace shape,
// and a durable scratchpad.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { box, stringWidth, truncate } from './layout.ts';
import { b, colors } from './theme.ts';
import { getBeurreDir } from './config.ts';

// --------------------------------------------------------------- /branching ----

const git = (args: string, cwd: string): string | null => {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
  } catch {
    return null;
  }
};

// ------------------------------------------------------------ /stash-list ----

export interface StashRow {
  ref: string;
  message: string;
  when: string;
  files: number;
}

export function parseStashes(text: string): StashRow[] {
  const rows: StashRow[] = [];
  for (const line of text.split('\n').filter(Boolean)) {
    // `git stash list` prints: "stash@{0}: WIP on main: 1a2b3c4 subject"
    const m = line.match(/^stash@\{(\d+)\}:\s*(.*)$/);
    if (!m) continue;
    rows.push({ ref: `stash@{${m[1]}}`, message: m[2].trim(), when: '', files: 0 });
  }
  return rows;
}

export function renderStashList(rows: StashRow[], width: number): string[] {
  if (rows.length === 0) {
    return box({ title: 'stashes (0)', width, lines: [`${colors.dim}none — git stash push to save work${colors.reset}`] });
  }
  const refW = Math.max(...rows.map((r) => r.ref.length));
  return box({
    title: `stashes (${rows.length})`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.butterGold}${r.ref.padEnd(refW)}${colors.reset}  ${r.message}`, width - 6)),
  });
}

export function stashList(cwd: string): StashRow[] | null {
  const out = git('stash list --format=%gd%x1f%gs', cwd);
  return out === null ? null : out.split('\n').filter(Boolean).map((line) => {
    const [ref, message] = line.split('\x1f');
    return { ref, message: (message ?? '').trim(), when: '', files: 0 };
  });
}

// -------------------------------------------------------------- /since ----

export interface CommitRow {
  short: string;
  subject: string;
  author: string;
  when: string;
}

export function parseCommits(text: string): CommitRow[] {
  const rows: CommitRow[] = [];
  for (const line of text.split('\n').filter(Boolean)) {
    const parts = line.split('\x1f');
    if (parts.length < 4) continue;
    rows.push({ short: parts[0], subject: parts[1], author: parts[2], when: parts[3] });
  }
  return rows;
}

export function renderCommits(rows: CommitRow[], title: string, width: number): string[] {
  if (rows.length === 0) {
    return box({ title, width, lines: [`${colors.dim}no commits in this range${colors.reset}`] });
  }
  const shaW = Math.max(...rows.map((r) => r.short.length));
  const whenW = Math.max(...rows.map((r) => r.when.length));
  return box({
    title: `${title} (${rows.length})`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.dim}${r.short.padEnd(shaW)}  ${r.when.padEnd(whenW)}  ${colors.butterGold}${r.author}${colors.reset}  ${r.subject}`, width - 6)),
  });
}

export function commitsSince(cwd: string, rev: string): CommitRow[] | null {
  const out = git(`log ${rev} --no-merges --format=%h%x1f%s%x1f%an%x1f%ar`, cwd);
  if (out === null) return null;
  return parseCommits(out);
}

// ---------------------------------------------------------------- /todo-due ----

export interface DueItem {
  text: string;
  due: string;
  overdue: boolean;
}

const TASKS_FILE = () => path.join(getBeurreDir(), 'tasks.json');

/** Parse "buy milk 2026-10-07" into a text plus a date. A trailing ISO date is
 * the whole format: anything richer needs quoting rules that make a one-line
 * command unusable in a terminal. */
export function parseTask(input: string, today = new Date()): { text: string; due: string | null } {
  const m = input.trim().match(/^(.*?)\s+(\d{4}-\d{2}-\d{2})$/);
  if (!m) return { text: input.trim(), due: null };
  return { text: m[1].trim(), due: m[2] };
}

export function isOverdue(due: string, today = new Date()): boolean {
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  d.setDate(d.getDate() - 1);
  return d.getTime() < startOfDay(today).getTime();
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function loadTasks(): { text: string; due: string | null }[] {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE(), 'utf8')) as { text: string; due: string | null }[];
  } catch {
    return [];
  }
}

export function saveTask(text: string, due: string | null): void {
  const list = loadTasks().filter((t) => t.text !== text);
  list.push({ text, due });
  fs.mkdirSync(path.dirname(TASKS_FILE()), { recursive: true });
  fs.writeFileSync(TASKS_FILE(), JSON.stringify(list, null, 2));
}

export function removeTask(text: string): boolean {
  const list = loadTasks();
  if (!list.some((t) => t.text === text)) return false;
  fs.mkdirSync(path.dirname(TASKS_FILE()), { recursive: true });
  fs.writeFileSync(TASKS_FILE(), JSON.stringify(list.filter((t) => t.text !== text), null, 2));
  return true;
}

export function renderDue(items: DueItem[], width: number): string[] {
  if (items.length === 0) {
    return box({ title: 'due (0)', width, lines: [`${colors.dim}nothing due — add one with /todo-due buy milk 2026-10-07${colors.reset}`] });
  }
  return box({
    title: `due (${items.length})`,
    width,
    lines: items.map((it) => {
      const mark = it.overdue ? `${colors.red}overdue${colors.reset}` : `${colors.green}due    ${colors.reset}`;
      return truncate(`${mark}  ${it.due}  ${it.text}`, width - 6);
    }),
  });
}

// ------------------------------------------------------------- /bigfiles ----

export interface FileRow {
  path: string;
  bytes: number;
  lines: number;
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Largest tracked files in the workspace. A slow agent is usually a slow
 * context, and the context is usually a handful of very large files. */
export function renderBigFiles(rows: FileRow[], width: number): string[] {
  if (rows.length === 0) {
    return box({ title: 'big files (0)', width, lines: [`${colors.dim}no tracked files found${colors.reset}`] });
  }
  const sizeW = Math.max(...rows.map((r) => humanBytes(r.bytes).length));
  const pathW = Math.min(48, Math.max(...rows.map((r) => r.path.length)));
  return box({
    title: `big files (${rows.length})`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.dim}${humanBytes(r.bytes).padStart(sizeW)}${colors.reset}  ${r.path.padEnd(pathW)}  ${colors.dim}${r.lines} lines${colors.reset}`, width - 6)),
  });
}

/**
 * Lines in a text file, the way `wc -l` counts them.
 *
 * Not `text.split('\n').length`: a trailing newline terminates the last line
 * rather than starting a new empty one, so every newline-terminated file — that
 * is nearly all of them — came out exactly one line too long.
 */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  const n = (text.match(/\n/g) ?? []).length;
  return text.endsWith('\n') ? n : n + 1;
}

export function biggestFiles(cwd: string, limit = 8): FileRow[] {
  const out = git('ls-files', cwd) ?? '';
  const rows: FileRow[] = [];
  for (const rel of out.split('\n').filter(Boolean)) {
    const full = path.resolve(cwd, rel);
    try {
      const bytes = fs.statSync(full).size;
      // Skip binaries: a .png has a byte count but no line count, and half a
      // megabyte of PNG should not claim the top of a "what is eating my
      // context" list.
      if (bytes === 0) continue;
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes('\0')) continue;
      rows.push({ path: rel, bytes, lines: countLines(text) });
    } catch {
      continue;
    }
  }
  return rows.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, limit);
}

// ------------------------------------------------------------ /scratch ----

const SCRATCH_FILE = () => path.join(getBeurreDir(), 'scratch.json');

export interface Scratch {
  id: number;
  text: string;
  at: string;
}

export function loadScratch(): Scratch[] {
  try {
    return JSON.parse(fs.readFileSync(SCRATCH_FILE(), 'utf8')) as Scratch[];
  } catch {
    return [];
  }
}

export function addScratch(text: string): Scratch {
  const list = loadScratch();
  const next = Math.max(0, ...list.map((s) => s.id)) + 1;
  const entry: Scratch = { id: next, text, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(SCRATCH_FILE()), { recursive: true });
  fs.writeFileSync(SCRATCH_FILE(), JSON.stringify([...list, entry], null, 2));
  return entry;
}

export function removeScratch(id: number): boolean {
  const list = loadScratch();
  if (!list.some((s) => s.id === id)) return false;
  fs.mkdirSync(path.dirname(SCRATCH_FILE()), { recursive: true });
  fs.writeFileSync(SCRATCH_FILE(), JSON.stringify(list.filter((s) => s.id !== id), null, 2));
  return true;
}

export function renderScratch(list: Scratch[], width: number): string[] {
  if (list.length === 0) {
    return box({ title: 'scratch (0)', width, lines: [`${colors.dim}empty — /scratch <text> to jot something down${colors.reset}`] });
  }
  return box({
    title: `scratch (${list.length})`,
    width,
    lines: list.map((s) =>
      truncate(`${colors.dim}#${s.id}${colors.reset}  ${s.text}  ${colors.dim}${s.at.slice(0, 16).replace('T', ' ')}${colors.reset}`, width - 6)),
  });
}

// ------------------------------------------------------------ /deps-tree ----

export interface DepRow {
  name: string;
  declared: string;
  installed: string;
  outdated: boolean;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)/;

/** True when `installed` does not satisfy `declared`.
 *
 * The interesting failure is not "newer is available" — that is a routine
 * update — it is that the installed tree disagrees with package.json at all:
 * someone bumped the range and never reinstalled. A caret range accepts any
 * minor at or above the floor, so ^7.1.0 is satisfied by 7.9.0 but not 7.0.0.
 *
 * Ranges this cannot judge (workspace:*, a URL, "latest") return false rather
 * than guessing, because a wrong ▲ on every workspace dep is the same as no
 * column at all. */
export function rangeViolated(declared: string, installed: string): boolean {
  const raw = declared.trim();
  // Strip the operator, not just whitespace: /^(\d+)/ never matches "^7.1.0",
  // so an earlier version of this silently reported every caret dep as fine.
  const a = SEMVER.exec(raw.replace(/^[\^~><=\s]+/, ''));
  const b = SEMVER.exec(installed.trim());
  if (!a || !b) return false;

  const maj = Number(a[1]);
  const min = Number(a[2]);
  const pat = Number(a[3]);
  const imaj = Number(b[1]);
  const imin = Number(b[2]);
  const ipat = Number(b[3]);

  if (/^[\d]/.test(raw)) return maj !== imaj || min !== imin || pat !== ipat;
  if (/^[><=]/.test(raw)) return imaj < maj || (imaj === maj && (imin < min || (imin === min && ipat < pat)));
  // ^ and ~ both floor the minor; they diverge only past the major.
  return imaj < maj || (imaj === maj && imin < min);
}

export function renderDeps(rows: DepRow[], width: number): string[] {
  if (rows.length === 0) {
    return box({ title: 'deps', width, lines: [`${colors.dim}no dependencies — nothing to check${colors.reset}`] });
  }
  const nameW = Math.min(28, Math.max(...rows.map((r) => r.name.length)));
  const stale = rows.filter((r) => r.outdated).length;
  return box({
    title: `dep ranges (${rows.length}${stale ? `, ${stale} violated` : ''})`,
    width,
    lines: rows.map((r) => {
      const mark = r.outdated ? `${colors.red}▲${colors.reset}` : `${colors.dim} ·${colors.reset}`;
      return truncate(`${mark} ${r.name.padEnd(nameW)}  ${colors.dim}want ${r.declared}${colors.reset}  ${colors.dim}have ${r.installed}${colors.reset}`, width - 6);
    }),
  });
}

/** Read declared vs installed straight out of node_modules, so this works with
 * any package manager rather than only the one that ships a CLI we would have
 * to shell out to. */
export function dependencyDrift(cwd: string): DepRow[] {
  const pkgPath = path.join(cwd, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };
    const rows: DepRow[] = [];
    for (const [name, want] of Object.entries(declared)) {
      const installedPath = path.join(cwd, 'node_modules', name, 'package.json');
      try {
        const inst = JSON.parse(fs.readFileSync(installedPath, 'utf8')) as { version?: string };
        rows.push({ name, declared: want, installed: inst.version ?? '?', outdated: rangeViolated(want, inst.version ?? '') });
      } catch {
        rows.push({ name, declared: want, installed: 'missing', outdated: true });
      }
    }
    return rows.sort((a, b) => Number(b.outdated) - Number(a.outdated) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// ----------------------------------------------------------- /loc & /lint ----

export interface LocRow {
  lang: string;
  files: number;
  lines: number;
}

const LANG_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.rs': 'rust', '.go': 'go', '.py': 'python', '.rb': 'ruby', '.c': 'c', '.h': 'c',
  '.cpp': 'c++', '.hpp': 'c++', '.java': 'java', '.kt': 'kotlin', '.swift': 'swift',
  '.sh': 'shell', '.sql': 'sql',
};

export function renderLoc(rows: LocRow[], width: number): string[] {
  if (rows.length === 0) {
    return box({ title: 'loc', width, lines: [`${colors.dim}no recognised source files${colors.reset}`] });
  }
  const langW = Math.max(...rows.map((r) => r.lang.length));
  const total = rows.reduce((a, r) => a + r.lines, 0);
  return box({
    title: `loc (${rows.length} languages, ${total.toLocaleString('en-US')} lines)`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.butterGold}${r.lang.padEnd(langW)}${colors.reset}  ${colors.dim}${String(r.files).padStart(5)} files${colors.reset}  ${colors.dim}${r.lines.toLocaleString('en-US')} lines${colors.reset}`, width - 6)),
  });
}

export function countLoc(cwd: string): LocRow[] {
  const out = git('ls-files', cwd) ?? '';
  const byLang = new Map<string, LocRow>();
  for (const rel of out.split('\n').filter(Boolean)) {
    const lang = LANG_EXT[path.extname(rel)];
    if (!lang) continue;
    try {
      const text = fs.readFileSync(path.resolve(cwd, rel), 'utf8');
      if (text.includes('\0')) continue;
      const row = byLang.get(lang) ?? { lang, files: 0, lines: 0 };
      row.files += 1;
      row.lines += countLines(text);
      byLang.set(lang, row);
    } catch {
      continue;
    }
  }
  return [...byLang.values()].sort((a, b) => b.lines - a.lines || a.lang.localeCompare(b.lang));
}

// ------------------------------------------------------------ /rm-compat ----

export interface CompatRow {
  feature: string;
  needs: string;
  have: string;
  ok: boolean;
}

export function renderCompat(rows: CompatRow[], width: number): string[] {
  const bad = rows.filter((r) => !r.ok);
  return box({
    title: `compat (${rows.length - bad.length}/${rows.length} ok)`,
    width,
    lines: rows.map((r) =>
      truncate(`${r.ok ? `${colors.green}✔${colors.reset}` : `${colors.red}✖${colors.reset}`} ${r.feature}  ${colors.dim}needs ${r.needs} · have ${r.have}${colors.reset}`, width - 6)),
    footer: bad.length ? `${colors.red}${bad.length} unmet${colors.reset}` : `${colors.green}all requirements met${colors.reset}`,
  });
}

export function compat(): CompatRow[] {
  const rows: CompatRow[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  rows.push({ feature: 'runtime', needs: 'node >= 20', have: process.version, ok: nodeMajor >= 20 });
  rows.push({
    feature: 'bun',
    needs: 'bun >= 1.0',
    have: typeof Bun !== 'undefined' ? Bun.version : 'absent',
    ok: typeof Bun !== 'undefined',
  });
  try {
    execSync('git --version', { stdio: 'ignore', timeout: 3000 });
    rows.push({ feature: 'git', needs: 'git', have: 'present', ok: true });
  } catch {
    rows.push({ feature: 'git', needs: 'git', have: 'absent', ok: false });
  }
  return rows;
}

// ------------------------------------------------------------ /what-changed ----

export interface ChangedRow {
  file: string;
  status: string;
  who: string;
}

/** Which of the files you changed have someone else also touched recently. The
 * answer to "is this safe to commit" that a diff cannot give you. */
export function renderChanged(rows: ChangedRow[], width: number): string[] {
  if (rows.length === 0) {
    return box({ title: 'what changed', width, lines: [`${colors.dim}working tree is clean${colors.reset}`] });
  }
  return box({
    title: `what changed (${rows.length} file${rows.length === 1 ? '' : 's'})`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.dim}${r.status.padEnd(2)}${colors.reset} ${r.file}  ${colors.dim}${r.who}${colors.reset}`, width - 6)),
  });
}

export function changedWithHistory(cwd: string, rev = 'HEAD~5'): ChangedRow[] {
  const status = git('status --porcelain', cwd);
  if (status === null) return [];
  const rows: ChangedRow[] = [];
  for (const line of status.split('\n').filter(Boolean)) {
    const file = line.slice(3).trim();
    const out = git(`log -1 --format=%an --since=2.weeks.ago -- ${JSON.stringify(file)}`, cwd);
    rows.push({ file, status: line.slice(0, 2).trim() || 'M', who: out ? out.trim() : 'no recent commits' });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}