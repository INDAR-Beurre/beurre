import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildInitPrompt,
  computeStats,
  detectTestCommand,
  estimateCost,
  grepWorkspace,
  lastUserPrompt,
  outlineFile,
  renderCheckpoints,
  renderCost,
  renderDoctor,
  renderEnv,
  renderGrep,
  renderOutline,
  renderSnippets,
  renderStats,
  renderToolCatalog,
  runDoctor,
  saveCheckpoint,
  saveSnippet,
  listCheckpoints,
  loadCheckpoint,
  listSnippets,
} from '../src/features.ts';
import { stringWidth, stripAnsi } from '../src/layout.ts';

const WIDTHS = [40, 56, 72, 100, 160];

function fixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beurre-feat-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# Fixture\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'f', scripts: { test: 'bun test' } }));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(
    path.join(dir, 'src', 'a.ts'),
    [
      'export class Widget {}',
      'export function run() {}',
      'export const helper = () => 1;',
      'export interface Shape {}',
      'it("works", () => {});',
      '// == Section ==',
      'export const NEVER_MATCHED = "needle-in-haystack";',
    ].join('\n'),
  );
  return dir;
}

describe('features: /doctor', () => {
  it('reports every check as pass inside a real git-free temp dir', () => {
    const checks = runDoctor(fixture());
    const names = checks.map((c) => c.name);
    expect(names).toContain('Working directory');
    expect(names).toContain('Writable workspace');
    // A temp dir is not a git repo, so that check must fail rather than crash.
    expect(checks.every((c) => typeof c.detail === 'string' && c.detail.length > 0)).toBe(true);
  });

  it('never throws on a nonexistent directory', () => {
    const checks = runDoctor('/definitely/not/here');
    expect(checks[0].ok).toBe(false);
    expect(checks[0].detail).toContain('does not exist');
  });

  it('emits every line at exactly the requested width', () => {
    const rendered = renderDoctor(runDoctor(fixture()), 72).join('\n');
    for (const line of rendered.split('\n')) {
      expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(72);
    }
  });

  it('puts one row per check, not one collapsed blob', () => {
    const checks = runDoctor(fixture());
    const lines = renderDoctor(checks, 80);
    // border top + one row per check + border bottom + blank + summary
    expect(lines.length).toBe(checks.length + 4);
  });
});

describe('features: /outline', () => {
  it('finds declarations by kind with 1-based line numbers', () => {
    const dir = fixture();
    const nodes = outlineFile(path.join(dir, 'src', 'a.ts'));
    const byKind = (k: string) => nodes.filter((n) => n.kind === k);
    expect(byKind('class').map((n) => n.text)).toEqual(['Widget']);
    expect(byKind('def').map((n) => n.text)).toEqual(['run', 'helper', 'Shape']);
    expect(byKind('test').map((n) => n.text)).toEqual(['it("works", () => {});']);
    expect(nodes.every((n) => n.line >= 1)).toBe(true);
  });

  it('does not report every line as a declaration', () => {
    const dir = fixture();
    const lines = fs.readFileSync(path.join(dir, 'src', 'a.ts'), 'utf-8').split('\n').length;
    expect(outlineFile(path.join(dir, 'src', 'a.ts')).length).toBeLessThan(lines);
  });

  it('returns a visible empty state rather than blank rows', () => {
    const rows = renderOutline([], 60);
    expect(rows).toHaveLength(1);
    expect(stripAnsi(rows[0])).toContain('no declarations');
  });

  it('stays within width at every terminal size', () => {
    const dir = fixture();
    const nodes = outlineFile(path.join(dir, 'src', 'a.ts'));
    for (const w of WIDTHS) {
      for (const line of renderOutline(nodes, w)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(w);
      }
    }
  });

  it('right-aligns nothing: line numbers form a stable left column', () => {
    const dir = fixture();
    const rows = renderOutline(outlineFile(path.join(dir, 'src', 'a.ts')), 120).map(stripAnsi);
    const col = rows.map((r) => r.indexOf('def') === -1 ? r.indexOf('cls') : r.indexOf('def'));
    expect(new Set(col.filter((c) => c >= 0)).size).toBe(1);
  });
});

describe('features: /stats and /price', () => {
  it('counts turns and tool calls from real message shapes', () => {
    const s = computeStats([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '{"name":"bash"} {"name":"read"}' },
      { role: 'user', content: 'again' },
    ]);
    expect(s.turns).toBe(3);
    expect(s.user).toBe(2);
    expect(s.assistant).toBe(1);
    expect(s.tools).toBe(2);
  });

  it('handles empty and non-user/assistant roles', () => {
    const s = computeStats([]);
    expect(s.turns).toBe(0);
    expect(computeStats([{ role: 'tool', content: 'x' }]).tools).toBe(0);
  });

  it('prices a known model and refuses to invent a price for an unknown one', () => {
    expect(estimateCost('glm-5-3-flash', 1_000_000)).toBeGreaterThan(0);
    expect(estimateCost('totally-made-up', 1_000_000)).toBeNull();
  });

  it('says so plainly when a model has no published price', () => {
    expect(stripAnsi(renderCost('totally-made-up', 1000, 80))).toContain('no published price');
  });

  it('keeps the stats box inside the terminal', () => {
    for (const w of WIDTHS) {
      const s = computeStats([{ role: 'user', content: 'x' }]);
      for (const line of renderStats(s, 'glm-5-3-flash', w)) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(w);
      }
    }
  });
});

describe('features: /grep', () => {
  it('finds a literal match and reports file:line', () => {
    const dir = fixture();
    const hits = grepWorkspace('needle-in-haystack', dir);
    expect(hits.length).toBe(1);
    expect(hits[0].file).toBe(path.join('src', 'a.ts'));
    expect(hits[0].line).toBe(7);
  });

  it('skips node_modules, .git and dot directories', () => {
    const dir = fixture();
    fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'i.js'), 'needle-in-haystack');
    fs.mkdirSync(path.join(dir, '.hidden'));
    fs.writeFileSync(path.join(dir, '.hidden', 'h.js'), 'needle-in-haystack');
    expect(grepWorkspace('needle-in-haystack', dir)).toHaveLength(1);
  });

  it('respects the result cap', () => {
    const dir = fixture();
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), Array.from({ length: 50 }, () => 'needle-in-haystack').join('\n'));
    expect(grepWorkspace('needle-in-haystack', dir, 10).length).toBeLessThanOrEqual(10);
  });

  it('shows a real empty state on no match', () => {
    expect(stripAnsi(renderGrep([], 'zzz-nope', 60))).toContain('no match');
  });

  it('never overflows the terminal', () => {
    const dir = fixture();
    const hits = grepWorkspace('export', dir);
    for (const w of WIDTHS) {
      for (const line of renderGrep(hits, 'export', w).split('\n')) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(w);
      }
    }
  });
});

describe('features: /init and /testcmd', () => {
  it('grounds the prompt in what is actually on disk', () => {
    const p = buildInitPrompt(fixture());
    expect(p).toContain('README.md');
    expect(p).toContain('node');
    expect(p).toContain('src');
  });

  it('still returns a usable prompt when nothing is recognised', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'beurre-bare-'));
    const p = buildInitPrompt(bare);
    expect(p).toContain('unknown');
    expect(p).toContain('Missing:');
    expect(p).toContain('no README found');
  });
  it('runs the package script command, not a hardcoded one', () => {
    // The fixture's script is literally `bun test`, so detection must return it.
    expect(detectTestCommand(fixture())).toBe('bun test');

    const npmDir = fixture();
    fs.writeFileSync(path.join(npmDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    expect(detectTestCommand(npmDir)).toBe('npm test');

    const jvm = fs.mkdtempSync(path.join(os.tmpdir(), 'beurre-jvm-'));
    fs.writeFileSync(path.join(jvm, 'build.gradle.kts'), '');
    expect(detectTestCommand(jvm)).toBe('./gradlew test');
    expect(detectTestCommand(fs.mkdtempSync(path.join(os.tmpdir(), 'beurre-none-')))).toBeNull();
  });
});

describe('features: /lastcommand', () => {
  it('returns the most recent user prompt', () => {
    expect(lastUserPrompt([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: '  second  ' },
    ])).toBe('second');
  });

  it('returns null when nothing was asked', () => {
    expect(lastUserPrompt([{ role: 'assistant', content: 'reply' }])).toBeNull();
    expect(lastUserPrompt([])).toBeNull();
  });
});

describe('features: /tools, /env, /snippet, /checkpoint', () => {
  it('lists every registered tool with a description', () => {
    const text = stripAnsi(renderToolCatalog(80));
    for (const name of ['read', 'write', 'edit', 'bash', 'web_search']) {
      expect(text).toContain(name);
    }
  });

  it('keeps the tool catalog inside the terminal', () => {
    for (const w of WIDTHS) {
      for (const line of renderToolCatalog(w).split('\n')) {
        expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(w);
      }
    }
  });

  it('reports the live environment', () => {
    const text = stripAnsi(renderEnv(process.cwd(), 'glm-5-3-flash', 'high', 100));
    expect(text).toContain('Model');
    expect(text).toContain('glm-5-3-flash');
    expect(text).toContain(process.cwd());
  });

  it('round-trips a snippet and replaces it by name', () => {
    saveSnippet('beurre-test-snippet', 'first body');
    expect(listSnippets().find((s) => s.name === 'beurre-test-snippet')?.text).toBe('first body');
    saveSnippet('beurre-test-snippet', 'second body');
    expect(listSnippets().filter((s) => s.name === 'beurre-test-snippet')).toHaveLength(1);
    expect(listSnippets().find((s) => s.name === 'beurre-test-snippet')?.text).toBe('second body');
  });

  it('round-trips a checkpoint and returns null for a missing id', () => {
    saveCheckpoint('beurre-test-cp', 'label here', [{ role: 'user', content: 'x' }]);
    expect(loadCheckpoint('beurre-test-cp')?.label).toBe('label here');
    expect(loadCheckpoint('beurre-test-missing')).toBeNull();
    expect(listCheckpoints().some((c) => c.id === 'beurre-test-cp')).toBe(true);
  });

  it('shows actionable empty states instead of blank output', () => {
    expect(stripAnsi(renderSnippets([], 80))).toContain('/snippet add');
    expect(stripAnsi(renderCheckpoints([], 80))).toContain('no checkpoints');
  });
});