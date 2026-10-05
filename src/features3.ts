// Ten features: a decision log with cross-source recall, session transcripts
// with replay, and three git-intelligence commands.
//
// Storage follows the file pattern already used across this module —
// `const X_FILE = () => path.join(getBeurreDir(), 'x.json')` — and the
// existing `readJson<T>` / `writeJson` helpers, which are the single place an
// on-disk value is asserted to a named type.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { box, stringWidth, truncate } from './layout.ts';
import { b, colors } from './theme.ts';
import { getBeurreDir } from './config.ts';

// ------------------------------------------------------------ /decisions ----

const DECISIONS_FILE = () => path.join(getBeurreDir(), 'decisions.json');
const PROMPTS_FILE = () => path.join(getBeurreDir(), 'prompts.json');
const TRANSCRIPT_DIR = () => path.join(getBeurreDir(), 'transcripts');

export interface Decision {
  title: string;
  rationale: string;
  area: string;
  at: string;
}

const readJson = <T,>(file: string, fallback: T): T => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};

/** Upsert by title: re-deciding something replaces the rationale rather than
 * accumulating a duplicate, which is what made the log unusable as a record. */
export function saveDecision(title: string, rationale: string, area = 'general'): void {
  const list = loadDecisions().filter((d) => d.title !== title);
  list.push({ title, rationale, area, at: new Date().toISOString() });
  writeJson(DECISIONS_FILE(), list);
}

export function removeDecision(title: string): boolean {
  const list = loadDecisions();
  if (!list.some((d) => d.title === title)) return false;
  writeJson(DECISIONS_FILE(), list.filter((d) => d.title !== title));
  return true;
}

export function loadDecisions(): Decision[] {
  return readJson<Decision[]>(DECISIONS_FILE(), []);
}

export function renderDecisions(list: Decision[], width: number): string[] {
  if (list.length === 0) {
    return box({ title: 'decisions (0)', width, lines: [`${colors.dim}none yet — record one with /decision <title> [rationale]${colors.reset}`] });
  }
  const newest = list.slice().sort((a, b) => b.at.localeCompare(a.at));
  return box({
    title: `decisions (${newest.length})`,
    width,
    lines: newest.flatMap((d) => {
      const when = d.at.slice(0, 10);
      const head = truncate(`${colors.dim}${when}${colors.reset}  ${colors.butterGold}${d.title}${colors.reset}  ${colors.dim}${d.area}${colors.reset}`, width - 6);
      return d.rationale ? [head, truncate(`      ${colors.dim}${d.rationale}${colors.reset}`, width - 6)] : [head];
    }),
  });
}

// ---------------------------------------------------------------- /recall ----

export interface RecallHit {
  source: 'decision' | 'note' | 'snippet';
  label: string;
  text: string;
}

/** Rank exact title, then title prefix, then body. The order matters: without
 * it a decision literally titled "cache" loses to every note that mentions the
 * word in passing. */
export function rankRecall(term: string, hits: RecallHit[]): RecallHit[] {
  const needle = term.toLowerCase();
  const score = (h: RecallHit) => {
    const label = h.label.toLowerCase();
    if (label === needle) return 0;
    if (label.startsWith(needle)) return 1;
    if (h.text.toLowerCase().includes(needle)) return 2;
    return 3;
  };
  return hits
    .filter((h) => h.label.toLowerCase().includes(needle) || h.text.toLowerCase().includes(needle))
    .sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label));
}

export function renderRecall(term: string, hits: RecallHit[], width: number): string[] {
  if (hits.length === 0) {
    return box({
      title: `recall ${truncate(term, Math.max(4, width - 14))}`,
      width,
      lines: [`${colors.dim}no match in decisions, notes or snippets${colors.reset}`],
    });
  }
  return box({
    title: `recall ${truncate(term, Math.max(4, width - 14))} (${hits.length})`,
    width,
    lines: hits.map((h) =>
      truncate(`${colors.butterGold}${h.source}${colors.reset}  ${h.label}  ${colors.dim}${h.text}${colors.reset}`, width - 6)),
  });
}

// --------------------------------------------------------------- /prompts ----

export interface Prompt {
  name: string;
  text: string;
  at: string;
}

export function savePrompt(name: string, text: string): void {
  const list = loadPrompts().filter((p) => p.name !== name);
  list.push({ name, text, at: new Date().toISOString() });
  writeJson(PROMPTS_FILE(), list);
}

export function loadPrompts(): Prompt[] {
  return readJson<Prompt[]>(PROMPTS_FILE(), []);
}

export function renderPrompts(list: Prompt[], width: number): string[] {
  if (list.length === 0) {
    return box({ title: 'prompts (0)', width, lines: [`${colors.dim}none yet — save one with /prompt <name> <text>${colors.reset}`] });
  }
  const nameW = Math.min(18, Math.max(...list.map((p) => p.name.length)));
  return box({
    title: `prompts (${list.length})`,
    width,
    lines: list.map((p) =>
      truncate(`${colors.butterGold}${p.name.padEnd(nameW)}${colors.reset}  ${colors.dim}${p.text}${colors.reset}`, width - 6)),
  });
}

// --------------------------------------------------- /transcript, /replay ----

export interface TranscriptLine {
  role: string;
  content: string;
}

const TRANSCRIPT_MAX = 400;

/** One JSON object per line, so a transcript can be tailed and diffed like a log. */
export function writeTranscript(messages: TranscriptLine[], at = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const file = path.join(TRANSCRIPT_DIR(), `${stamp}.jsonl`);
  fs.mkdirSync(TRANSCRIPT_DIR(), { recursive: true });
  fs.writeFileSync(file, messages.map((m) => JSON.stringify(m)).join('\n') + '\n');
  return file;
}

export function readTranscript(file: string): TranscriptLine[] | null {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as TranscriptLine);
  } catch {
    return null;
  }
}

export interface TranscriptInfo {
  file: string;
  at: string;
  bytes: number;
}

export function listTranscripts(): TranscriptInfo[] {
  let names: string[];
  try {
    names = fs.readdirSync(TRANSCRIPT_DIR());
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => {
      const file = path.join(TRANSCRIPT_DIR(), n);
      const st = fs.statSync(file);
      return { file, at: st.mtime.toISOString(), bytes: st.size };
    })
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function renderTranscripts(list: TranscriptInfo[], width: number): string[] {
  if (list.length === 0) {
    return box({ title: 'transcripts (0)', width, lines: [`${colors.dim}none yet — save one with /transcript${colors.reset}`] });
  }
  const whenW = 19;
  return box({
    title: `transcripts (${list.length})`,
    width,
    lines: list.map((t) => {
      const name = path.basename(t.file);
      const when = t.at.slice(0, 19).replace('T', ' ');
      return truncate(`${colors.dim}${when.padEnd(whenW)}${colors.reset}  ${colors.butterGold}${name}${colors.reset}  ${colors.dim}${t.bytes}B${colors.reset}`, width - 6);
    }),
  });
}

/** Truncate long messages to a readable width, saying how much was hidden —
 * a silently clipped transcript reads as a complete one. */
export function renderReplay(file: string, lines: TranscriptLine[] | null, width: number): string[] {
  if (lines === null) {
    return box({ title: 'replay', width, lines: [`${colors.dim}cannot read ${path.basename(file)} — is it a transcript?${colors.reset}`] });
  }
  if (lines.length === 0) {
    return box({ title: `replay ${path.basename(file)} (0)`, width, lines: [`${colors.dim}transcript is empty${colors.reset}`] });
  }
  return box({
    title: `replay ${truncate(path.basename(file), Math.max(4, width - 16))} (${lines.length})`,
    width,
    lines: lines.map((l) => {
      const role = l.role === 'user' ? b.gold('you') : l.role === 'assistant' ? b.subagentBadge('beurre') : colors.dim + l.role + colors.reset;
      const full = l.content.replace(/\s+/g, ' ').trim();
      // The "… (N chars)" note is the whole point of truncating, so its width is
      // reserved before the body is cut. Sizing the body to the full budget and
      // letting the outer truncate win silently ate the note, which made a
      // clipped transcript indistinguishable from a complete one.
      const note = `… (${full.length} chars)`;
      const room = Math.max(8, width - 6 - stringWidth(role) - 2 - stringWidth(note));
      const body = full.length > room ? `${truncate(full, room)}${note}` : full;
      return `${role}  ${body}`;
    }),
  });
}

// ------------------------------------------------------------- git commands ----

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

export interface ReviewRow {
  status: string;
  file: string;
  adds: number;
  dels: number;
}

/** Parse `git status --porcelain` plus `git diff --numstat`. Untracked files
 * have no numstat row, so they are reported with zero counts rather than
 * dropped — a new file is exactly what a reviewer most needs to see. */
export function parseReview(status: string, numstat: string): ReviewRow[] {
  const stats = new Map<string, [number, number]>();
  for (const line of numstat.split('\n')) {
    const [a, d, file] = line.split('\t');
    if (!file) continue;
    stats.set(file, [Number(a) || 0, Number(d) || 0]);
  }
  const rows: ReviewRow[] = [];
  for (const line of status.split('\n').filter(Boolean)) {
    const code = line.slice(0, 2);
    const file = line.slice(3).trim();
    const [adds, dels] = stats.get(file) ?? [0, 0];
    rows.push({ status: code.trim() || 'M', file, adds, dels });
  }
  return rows;
}

export function renderReview(rows: ReviewRow[], cwd: string, width: number): string[] {
  if (rows.length === 0) {
    return box({ title: 'review', width, lines: [`${colors.green}✔${colors.reset} working tree is clean`] });
  }
  const nameW = Math.min(40, Math.max(...rows.map((r) => r.file.length)));
  const total = rows.reduce((a, r) => a + r.adds + r.dels, 0);
  return box({
    title: `review (${rows.length} file${rows.length === 1 ? '' : 's'}, ${total} lines)`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.dim}${r.status.padEnd(2)}${colors.reset} ${r.file.padEnd(nameW)}  ${colors.green}+${r.adds}${colors.reset} ${colors.red}-${r.dels}${colors.reset}`, width - 6)),
    footer: cwd,
  });
}

export function reviewWorkspace(cwd: string): ReviewRow[] | null {
  const status = git('status --porcelain', cwd);
  const numstat = git('diff --numstat HEAD', cwd);
  if (status === null || numstat === null) return null;
  return parseReview(status, numstat);
}

export interface AuthorRow {
  author: string;
  commits: number;
  share: number;
}

/** Share is a percentage of that file's commits, so the rows describe one file
 * rather than the whole repository. */

export function renderAuthors(rows: AuthorRow[], file: string, width: number): string[] {
  if (rows.length === 0) {
    return box({ title: `blame ${path.basename(file)}`, width, lines: [`${colors.dim}no commits touch this file${colors.reset}`] });
  }
  const nameW = Math.min(28, Math.max(...rows.map((r) => r.author.length)));
  return box({
    title: `blame ${path.basename(file)} (${rows.length} authors)`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.butterGold}${r.author.padEnd(nameW)}${colors.reset}  ${colors.dim}${String(r.commits).padStart(4)} commits  ${String(r.share).padStart(3)}%${colors.reset}`, width - 6)),
  });
}

export function blameSummary(cwd: string, file: string): AuthorRow[] | null {
  // `git shortlog` summarises stdin, so without an explicit revision it reads
  // an empty stream and reports "no commits" for a file with hundreds of them.
  // The `HEAD --` form is what actually answers the question.
  const shortlog = git(`shortlog -sn --no-merges HEAD -- ${JSON.stringify(file)}`, cwd);
  if (shortlog === null) return null;
  const rows: AuthorRow[] = [];
  let total = 0;
  for (const line of shortlog.split('\n').filter(Boolean)) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const commits = Number(m[1]);
    total += commits;
    rows.push({ author: m[2].trim(), commits, share: 0 });
  }
  // Share is computed once the denominator is known, so the rows a user reads
  // always add up to the file they describe rather than to some other total.
  for (const r of rows) r.share = total ? Math.round((r.commits / total) * 100) : 0;
  return rows.sort((a, b) => b.commits - a.commits || a.author.localeCompare(b.author));
}

/** Count how often each path appears in the log. A path that shows up once per
 * commit across six months is where the churn — and the bugs — live. */
export function countChurn(log: string, limit: number): { file: string; changes: number }[] {
  const counts = new Map<string, number>();
  for (const line of log.split('\n')) {
    const file = line.trim();
    if (!file || file.includes(' ')) continue;
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([file, changes]) => ({ file, changes }))
    .sort((a, b) => b.changes - a.changes || a.file.localeCompare(b.file))
    .slice(0, limit);
}

export function renderHotspots(rows: { file: string; changes: number }[], width: number): string[] {
  if (rows.length === 0) {
    return box({ title: 'hotspots (6 months)', width, lines: [`${colors.dim}no history in the last 6 months${colors.reset}`] });
  }
  const nameW = Math.min(44, Math.max(...rows.map((r) => r.file.length)));
  return box({
    title: `hotspots (6 months, top ${rows.length})`,
    width,
    lines: rows.map((r) =>
      truncate(`${colors.butterGold}${r.file.padEnd(nameW)}${colors.reset}  ${colors.dim}${r.changes} changes${colors.reset}`, width - 6)),
  });
}

export function hotspots(cwd: string, limit = 5): { file: string; changes: number }[] | null {
  const log = git('log --since=6.months --name-only --pretty=format:', cwd);
  return log === null ? null : countChurn(log, limit);
}
