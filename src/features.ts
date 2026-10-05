/**
 * User-facing features that sit on top of the agent, tools and relay.
 * Each export is one `/command`; they are pure enough to unit test without
 * a pty or a network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { box, columns, stringWidth, truncate } from './layout.ts';
import { b, colors } from './theme.ts';
import { getBeurreDir } from './config.ts';
import { BEURRE_TOOLS, executeTool, type ToolExecutionContext } from './tools.ts';
import type { ChatMessage } from './relay.ts';

// ------------------------------------------------------------- /price ----

/**
 * Per-million-token prices, USD. `unknown` is deliberate: relay-gw does not
 * publish a price for every model, and inventing one would overstate cost.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  'glm-5-3-flash': { in: 0.1, out: 0.4 },
  'kimi-k3:max': { in: 0.6, out: 2.5 },
  'gpt-6-astra:high': { in: 1.25, out: 10 },
  'o3-mini': { in: 1.1, out: 4.4 },
  'gpt-4o': { in: 2.5, out: 10 },
};

export function estimateCost(model: string, tokens: number): number | null {
  const p = PRICES[model];
  return p ? (tokens / 1_000_000) * (p.in + p.out) / 2 : null;
}

export function renderCost(model: string, tokens: number, width: number): string {
  const cost = estimateCost(model, tokens);
  const left = 'Estimated spend';
  const right =
    cost === null
      ? 'no published price for this model'
      : `$${cost.toFixed(4)} for ~${tokens.toLocaleString('en-US')} tokens`;
  return columns(b.dim(left), b.gold(right), width);
}

// ------------------------------------------------------------- /doctor ----

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Self-diagnosis: everything a first-time user can get wrong, in one screen. */
export function runDoctor(cwd: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const push = (name: string, fn: () => string) => {
    try {
      checks.push({ name, ok: true, detail: fn() });
    } catch (e: unknown) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  push('Working directory', () => {
    if (!fs.existsSync(cwd)) throw new Error(`${cwd} does not exist`);
    return cwd;
  });

  push('Git repository', () => {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { cwd, encoding: 'utf-8' }).trim();
    if (branch === 'HEAD') return 'detached HEAD';
    return `on ${branch}`;
  });

  push('Config directory', () => getBeurreDir());

  push('Writable workspace', () => {
    const probe = path.join(cwd, '.beurre-write-probe');
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return 'yes';
  });

  push('Terminal width', () => {
    const cols = process.stdout.columns || 80;
    return cols < 50 ? `${cols} columns — narrow, expect truncation` : `${cols} columns`;
  });

  push('Colour output', () =>
    process.env.NO_COLOR ? 'disabled (NO_COLOR is set)' : 'enabled',
  );

  return checks;
}

export function renderDoctor(checks: DoctorCheck[], width: number): string[] {
  const nameW = Math.max(...checks.map((c) => c.name.length));
  const lines = checks.map((c) => {
    const mark = c.ok ? `${colors.green}✔${colors.reset}` : `${colors.red}✖${colors.reset}`;
    const label = `${mark} ${c.name}`;
    // Detail shares whatever the name column left, so nothing is over-truncated.
    const room = Math.max(12, width - nameW - 10);
    const pad = " ".repeat(Math.max(0, nameW - c.name.length));
    return truncate(`  ${label}${pad}   ${colors.dim}${c.detail}${colors.reset}`, width);
  });
  const bad = checks.filter((c) => !c.ok).length;
  const summary = bad === 0
    ? `${colors.green}✔ all ${checks.length} checks passed${colors.reset}`
    : `${colors.red}✖ ${bad} of ${checks.length} checks failed${colors.reset}`;
  return [...box({ title: "doctor", lines, width }), "", `  ${summary}`];
}

// ------------------------------------------------------------ /outline ----

export interface OutlineNode {
  path: string;
  line: number;
  kind: 'def' | 'class' | 'test' | 'section';
  text: string;
}

const OUTLINE_PATTERNS: { kind: OutlineNode['kind']; re: RegExp }[] = [
  { kind: 'class', re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/ },
  { kind: 'def', re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/ },
  { kind: 'def', re: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/ },
  { kind: 'def', re: /^\s*(?:export\s+)?(?:interface|type)\s+(\w+)/ },
  { kind: 'test', re: /^\s*(?:it|test|describe)\s*\(\s*['"`]/ },
  // `[/]{2}` rather than a literal `//`: two slashes in a row terminate the
  // regex literal early and the rest of the pattern parses as code.
  { kind: 'section', re: /^\s*(?:#|[/]{2}\s*={2,}|[*]{2,})/ },
];

/** Structural outline of a file: what is in it, without reading the whole thing. */
export function outlineFile(filePath: string): OutlineNode[] {
  const src = fs.readFileSync(filePath, 'utf-8');
  const nodes: OutlineNode[] = [];
  src.split('\n').forEach((line, i) => {
    for (const { kind, re } of OUTLINE_PATTERNS) {
      const m = line.match(re);
      if (m) {
        nodes.push({ path: filePath, line: i + 1, kind, text: (m[1] || line).slice(0, 60) });
        return;
      }
    }
  });
  return nodes;
}

export function renderOutline(nodes: OutlineNode[], width: number): string[] {
  if (nodes.length === 0) return [`${colors.dim}  no declarations found${colors.reset}`];
  const maxLine = String(Math.max(...nodes.map((n) => n.line))).length;
  const kindTag = {
    def: `${colors.cyan}def${colors.reset}`,
    class: `${colors.butterGold}cls${colors.reset}`,
    test: `${colors.green}tst${colors.reset}`,
    section: `${colors.dim}sec${colors.reset}`,
  };
  return nodes.map((n) => {
    const at = `${colors.dim}${String(n.line).padStart(maxLine)}${colors.reset}`;
    return truncate(`  ${at} ${kindTag[n.kind]}  ${n.text}`, width);
  });
}

// --------------------------------------------------------- /checkpoint ----

export interface Checkpoint {
  id: string;
  at: string;
  label: string;
  messages: ChatMessage[];
}

function checkpointDir(): string {
  const dir = path.join(getBeurreDir(), 'checkpoints');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Snapshot conversation state so a bad turn can be rolled back. */
export function saveCheckpoint(id: string, label: string, messages: ChatMessage[]): string {
  const file = path.join(checkpointDir(), `${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ id, at: new Date().toISOString(), label, messages }), 'utf-8');
  return file;
}

export function listCheckpoints(): Checkpoint[] {
  const dir = checkpointDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Checkpoint;
      } catch {
        return null;
      }
    })
    .filter((c): c is Checkpoint => c !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function loadCheckpoint(id: string): Checkpoint | null {
  const file = path.join(checkpointDir(), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Checkpoint;
  } catch {
    return null;
  }
}

export function renderCheckpoints(points: Checkpoint[], width: number): string {
  if (points.length === 0) return `${colors.dim}  no checkpoints yet — one is saved each turn${colors.reset}`;
  return points
    .slice(0, 20)
    .map((c) => {
      const when = c.at.replace('T', ' ').slice(0, 19);
      return columns(`  ${colors.dim}${when}${colors.reset}`, truncate(c.label, Math.max(8, width - 26)), width);
    })
    .join('\n');
}

// -------------------------------------------------------------- /stats ----

export interface SessionStats {
  turns: number;
  user: number;
  assistant: number;
  tools: number;
  thinking: number;
  estTokens: number;
}

/** Count conversation shape without retaining anything. */
export function computeStats(messages: ChatMessage[]): SessionStats {
  const s: SessionStats = { turns: 0, user: 0, assistant: 0, tools: 0, thinking: 0, estTokens: 0 };
  for (const m of messages) {
    if (m.role === 'user') s.user++;
    else if (m.role === 'assistant') s.assistant++;
    else continue;
    if (m.role === 'user' || m.role === 'assistant') s.turns++;
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    s.estTokens += Math.round(text.length / 4);
    s.tools += (text.match(/"name":"\w+"/g) || []).length;
    s.thinking += (text.match(/"thinking"/g) || []).length;
  }
  return s;
}

export function renderStats(s: SessionStats, model: string, width: number): string {
  const rows = [
    ['Turns', String(s.turns)],
    ['User messages', String(s.user)],
    ['Assistant messages', String(s.assistant)],
    ['Tool calls', String(s.tools)],
    ['Thinking blocks', String(s.thinking)],
    ['Est. tokens', s.estTokens.toLocaleString('en-US')],
    ['Model', model],
  ];
  const label = Math.max(...rows.map(([k]) => k.length));
  const lines = rows.map(([k, v]) => `  ${colors.dim}${k.padEnd(label)}${colors.reset}  ${colors.butterCream}${v}${colors.reset}`);
  const cost = estimateCost(model, s.estTokens);
  if (cost !== null) lines.push(`  ${colors.dim}${'Est. spend'.padEnd(label)}${colors.reset}  ${colors.butterGold}$${cost.toFixed(4)}${colors.reset}`);
  return box({ title: "session stats", lines, width });
}

// ------------------------------------------------------------- /tools ----

/** The tool surface the model can call, with a one-line description each. */
export function renderToolCatalog(width: number): string {
  const rows = BEURRE_TOOLS.map((t) => [t.function.name, t.function.description]);
  const label = Math.max(...rows.map(([n]) => n.length));
  return rows
    .map(([n, d]) => truncate(`  ${colors.butterGold}${n.padEnd(label)}${colors.reset}  ${colors.dim}${d}${colors.reset}`, width))
    .join('\n');
}

// ------------------------------------------------------------- /env ----

/** The environment the model is told about — the usual "why did it guess wrong" list. */
export function renderEnv(cwd: string, model: string, effort: string, width: number): string {
  const rows: [string, string][] = [
    ['Node', process.version],
    ['Bun', typeof Bun !== 'undefined' ? Bun.version : 'n/a'],
    ['Platform', `${process.platform} ${process.arch}`],
    ['CWD', cwd],
    ['Model', model],
    ['Effort', effort],
    ['Terminal', `${process.stdout.columns || 80}x${process.stdout.rows || 24}`],
  ];
  const label = Math.max(...rows.map(([k]) => k.length));
  return rows
    .map(([k, v]) => truncate(`  ${colors.dim}${k.padEnd(label)}${colors.reset}  ${colors.butterCream}${v}${colors.reset}`, width))
    .join('\n');
}

// ------------------------------------------------------------ /snippets ----

export interface Snippet {
  name: string;
  text: string;
}

function snippetFile(): string {
  return path.join(getBeurreDir(), 'snippets.json');
}

/** Reusable prompts the user can fire with `/snippet <name>`. */
export function listSnippets(): Snippet[] {
  try {
    return JSON.parse(fs.readFileSync(snippetFile(), 'utf-8')) as Snippet[];
  } catch {
    return [];
  }
}

export function saveSnippet(name: string, text: string): void {
  const all = listSnippets().filter((s) => s.name !== name);
  all.push({ name, text });
  fs.writeFileSync(snippetFile(), JSON.stringify(all, null, 2), 'utf-8');
}

export function removeSnippet(name: string): boolean {
  const all = listSnippets();
  const next = all.filter((s) => s.name !== name);
  if (next.length === all.length) return false;
  fs.writeFileSync(snippetFile(), JSON.stringify(next, null, 2), 'utf-8');
  return true;
}

export function renderSnippets(snippets: Snippet[], width: number): string {
  if (snippets.length === 0) {
    return `${colors.dim}  no snippets yet — make one with ${b.gold('/snippet add <name> <text>')}${colors.reset}`;
  }
  const label = Math.max(...snippets.map((s) => s.name.length));
  return snippets
    .map((s) => truncate(`  ${colors.butterGold}${s.name.padEnd(label)}${colors.reset}  ${colors.dim}${s.text}${colors.reset}`, width))
    .join('\n');
}

// ------------------------------------------------------------ /grep ----

/** Literal search across the workspace, ranked by path. */
export function grepWorkspace(pattern: string, cwd: string, maxResults = 40): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']);
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || out.length >= maxResults) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= maxResults) return;
      if (e.name.startsWith('.') && e.name !== '.env') continue;
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      let src: string;
      try {
        if (fs.statSync(full).size > 512_000) continue;
        src = fs.readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      src.split('\n').forEach((line, i) => {
        if (out.length < maxResults && line.includes(pattern)) {
          out.push({ file: path.relative(cwd, full), line: i + 1, text: line.trim().slice(0, 120) });
        }
      });
    }
  };
  walk(cwd, 0);
  return out;
}

export function renderGrep(
  results: { file: string; line: number; text: string }[],
  pattern: string,
  width: number,
): string {
  if (results.length === 0) return `${colors.dim}  no match for “${pattern}”${colors.reset}`;
  const fileW = Math.max(...results.map((r) => r.file.length));
  return results
    .map((r) => truncate(`  ${colors.butterGold}${r.file.padEnd(fileW)}${colors.reset}${colors.dim}:${r.line}${colors.reset}  ${r.text}`, width))
    .join('\n');
}

// --------------------------------------------------------------- /init ----

const INIT_STEPS: { name: string; run: (cwd: string) => string }[] = [
  {
    name: 'Read README',
    run: (cwd) => {
      const readme = ['README.md', 'README.rst', 'README'].find((f) => fs.existsSync(path.join(cwd, f)));
      if (!readme) throw new Error('no README found — write one describing the project');
      return readme;
    },
  },
  {
    name: 'Detect stack',
    run: (cwd) => {
      const has = (f: string) => fs.existsSync(path.join(cwd, f));
      if (has('package.json')) return 'node';
      if (has('Cargo.toml')) return 'rust';
      if (has('pyproject.toml') || has('requirements.txt')) return 'python';
      if (has('go.mod')) return 'go';
      if (has('build.gradle.kts') || has('pom.xml')) return 'jvm';
      return 'unknown';
    },
  },
  {
    name: 'Find tests',
    run: (cwd) => {
      const found = ['tests', 'test', '__tests__', 'src'].filter((d) => fs.existsSync(path.join(cwd, d)));
      if (found.length === 0) throw new Error('no test directory found');
      return found.join(', ');
    },
  },
];

/** Build a grounded task prompt from the repo itself. */
export function buildInitPrompt(cwd: string): string {
  const facts: string[] = [];
  const failures: string[] = [];
  for (const step of INIT_STEPS) {
    try {
      facts.push(`- ${step.name}: ${step.run(cwd)}`);
    } catch (e: unknown) {
      failures.push(`- ${step.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const parts = [
    'Survey this repository and tell me how to work in it.',
    '',
    'What I found:',
    ...(facts.length ? facts : ['- nothing recognised']),
    ...(failures.length ? ['', 'Missing:', ...failures] : []),
    '',
    'Then report: the build and test commands, the entry point, the main modules and what each is for, and the three things most likely to break.',
  ];
  return parts.join('\n');
}

// --------------------------------------------------------- /lastcommand ----

/** Re-run the last turn's prompt — the "undo, but keep it" button. */
export function lastUserPrompt(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const c = messages[i].content;
      const text = typeof c === 'string' ? c : JSON.stringify(c ?? '');
      return text.trim() || null;
    }
  }
  return null;
}

// ---------------------------------------------------------- /testcmd ----

/** The test command for a repo, so the user never has to guess or retype it. */
export function detectTestCommand(cwd: string): string | null {
  const read = (f: string): Record<string, Record<string, string>> | null => {
    try {
      return JSON.parse(fs.readFileSync(path.join(cwd, f), 'utf-8'));
    } catch {
      return null;
    }
  };
  const pkg = read('package.json');
  const testScript = pkg?.scripts?.test;
  if (testScript) {
    // Run the script's own command, not a hardcoded `npm test` — the script
    // may be `vitest run`, `bun test`, or `node --test`.
    const runner = /bun\s+test/.test(testScript)
      ? 'bun'
      : /yarn\b/.test(testScript)
        ? 'yarn'
        : /pnpm\b/.test(testScript)
          ? 'pnpm'
          : 'npm';
    return `${runner} test`;
  }
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'cargo test';
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'pytest.ini'))) return 'pytest';
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'go test ./...';
  if (fs.existsSync(path.join(cwd, 'build.gradle.kts'))) return './gradlew test';
  return null;
}

export async function runTestCommand(cmd: string, ctx: ToolExecutionContext): Promise<{ code: number; tail: string }> {
  const res = await executeTool('local', 'bash', { command: cmd }, ctx);
  const out = res.output || '';
  return { code: res.isError ? 1 : 0, tail: out.split('\n').slice(-25).join('\n') };
}

export function renderTestResult(code: number, tail: string, width: number): string {
  const head = code === 0
    ? `${colors.green}✔ tests passed${colors.reset}`
    : `${colors.red}✖ tests failed (exit ${code})${colors.reset}`;
  const body = tail.split('\n').map((l) => truncate('  ' + l, width));
  return [head, '', ...body].join('\n');
}

/** Width helper so callers do not each re-derive the terminal column. */
export const contentWidth = (): number => Math.max(40, (process.stdout.columns || 80) - 2);

export { stringWidth };

// ---------------------------------------------------------- onboarding ----

function firstRunFile(): string {
  return path.join(getBeurreDir(), 'seen-onboarding');
}

/** True until the user has seen the welcome panel once. */
export function isFirstRun(): boolean {
  return !fs.existsSync(firstRunFile());
}

export function markOnboarded(): void {
  fs.writeFileSync(firstRunFile(), new Date().toISOString(), 'utf-8');
}

/**
 * Shown once on launch. A newcomer needs three things: what this is, how to
 * type a command, and what to do when something goes wrong.
 */
export function renderWelcome(width: number): string[] {
  const lines = [
    `${colors.dim}An agentic coding harness. Type a task and press Enter.${colors.reset}`,
    '',
    `${colors.butterGold}  Getting started${colors.reset}`,
    `  ${colors.dim}1${colors.reset}  Type what you want, in plain language`,
    `  ${colors.dim}2${colors.reset}  Type ${b.gold('/')} to see every command, ${b.gold('/help')} any time`,
    `  ${colors.dim}3${colors.reset}  ${b.gold('/init')} surveys this repo and explains how it works`,
    `  ${colors.dim}4${colors.reset}  ${b.gold('/doctor')} checks your setup if anything looks wrong`,
    '',
    `${colors.dim}  Escape cancels · Shift+Enter adds a newline · Tab completes${colors.reset}`,
  ];
  return box({ title: 'Welcome', lines: lines.map((l) => truncate(l, width - 4)), width });
}
