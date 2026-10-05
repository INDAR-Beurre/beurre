import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  addScratch,
  biggestFiles,
  changedWithHistory,
  compat,
  countLoc,
  dependencyDrift,
  humanBytes,
  isOverdue,
  loadTasks,
  parseCommits,
  parseStashes,
  parseTask,
  rangeViolated,
  removeScratch,
  removeTask,
  renderBigFiles,
  renderChanged,
  renderCompat,
  renderCommits,
  renderDeps,
  renderDue,
  renderLoc,
  renderScratch,
  renderStashList,
  saveTask,
  stashList,
} from '../src/features4.ts';
import { stringWidth, stripAnsi } from '../src/layout.ts';

const WIDTHS = [20, 26, 30, 34, 46, 62, 80, 120, 200];
const BEURRE = path.join(import.meta.dir, '..', '.beurre-test-home');

function fits(width: number, out: string[]): boolean {
  return out.every((l) => stringWidth(l) <= width);
}

describe('features4: parsers', () => {
  test('parseStashes reads ref and message off each row', () => {
    const rows = parseStashes('stash@{0}: WIP on main: 1a2b3c4 subject\nstash@{1}: On master: thing\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].ref).toBe('stash@{0}');
    expect(rows[1].message).toBe('On master: thing');
  });

  test('parseStashes skips lines that are not stashes', () => {
    expect(parseStashes('not a stash\ngit version 2.43.0\n')).toEqual([]);
  });

  test('parseCommits splits on the unit separator, not on spaces', () => {
    // Subjects contain spaces; splitting on whitespace would shift every field.
    const rows = parseCommits('1a2b3c4\x1fdo a thing here\x1falex\x1f2 hours ago\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].subject).toBe('do a thing here');
    expect(rows[0].author).toBe('alex');
    expect(rows[0].short).toBe('1a2b3c4');
  });

  test('parseCommits drops malformed rows rather than emitting blank ones', () => {
    expect(parseCommits('1a2b3c4\x1fonly two fields\n')).toEqual([]);
  });

  test('parseTask keeps a bare task intact', () => {
    expect(parseTask('buy milk')).toEqual({ text: 'buy milk', due: null });
  });

  test('parseTask splits a trailing ISO date off the text', () => {
    expect(parseTask('buy milk 2026-10-07')).toEqual({ text: 'buy milk', due: '2026-10-07' });
  });

  test('parseTask leaves a non-ISO trailing token alone', () => {
    expect(parseTask('buy milk next tuesday')).toEqual({ text: 'buy milk next tuesday', due: null });
  });
});

describe('features4: version ranges', () => {
  // The first version of this stripped only whitespace, so /^(\d+)/ never
  // matched "^7.1.0" and every caret range was reported as satisfied.
  test('a caret range accepts a higher minor', () => {
    expect(rangeViolated('^7.1.0', '7.2.3')).toBe(false);
  });

  test('a caret range rejects a lower major', () => {
    expect(rangeViolated('^7.1.0', '6.0.0')).toBe(true);
  });

  test('a caret range rejects a minor below its floor', () => {
    expect(rangeViolated('^7.1.0', '7.0.0')).toBe(true);
  });

  test('a tilde range rejects a minor below its floor', () => {
    expect(rangeViolated('~1.2.3', '1.1.0')).toBe(true);
    expect(rangeViolated('~1.2.3', '1.3.0')).toBe(false);
  });

  test('an exact pin rejects any difference', () => {
    expect(rangeViolated('1.2.3', '1.2.3')).toBe(false);
    expect(rangeViolated('1.2.3', '1.2.4')).toBe(true);
  });

  test('>= rejects a version below its lower bound only', () => {
    expect(rangeViolated('>=2.0.0', '1.9.9')).toBe(true);
    expect(rangeViolated('>=2.0.0', '2.1.0')).toBe(false);
  });

  test('an unjudgeable range is not reported as violated', () => {
    // A wrong marker on every workspace dep makes the column noise.
    expect(rangeViolated('workspace:*', '1.0.0')).toBe(false);
    expect(rangeViolated('latest', '1.0.0')).toBe(false);
    expect(rangeViolated('', '1.0.0')).toBe(false);
  });
});

describe('features4: formatting', () => {
  test('humanBytes scales units', () => {
    expect(humanBytes(512)).toBe('512 B');
    expect(humanBytes(2048)).toBe('2.0 KB');
    expect(humanBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  test('isOverdue compares dates, not clocks', () => {
    expect(isOverdue('2020-01-01')).toBe(true);
    expect(isOverdue('2099-01-01')).toBe(false);
    expect(isOverdue('not-a-date')).toBe(false);
  });
});

describe('features4: tasks persist', () => {
  beforeEach(() => {
    rmSync(BEURRE, { recursive: true, force: true });
    mkdirSync(BEURRE, { recursive: true });
    process.env.BEURRE_HOME = BEURRE;
  });

  test('a saved task comes back', () => {
    saveTask('buy milk', '2026-10-07');
    expect(loadTasks()).toEqual([{ text: 'buy milk', due: '2026-10-07' }]);
  });

  test('re-saving the same text replaces it instead of duplicating', () => {
    saveTask('buy milk', null);
    saveTask('buy milk', '2026-10-09');
    const list = loadTasks();
    expect(list).toHaveLength(1);
    expect(list[0].due).toBe('2026-10-09');
  });

  test('removing reports whether anything was removed', () => {
    saveTask('buy milk', null);
    expect(removeTask('buy milk')).toBe(true);
    expect(removeTask('buy milk')).toBe(false);
  });

  test('scratch ids increase and removal is reported', () => {
    addScratch('first');
    const second = addScratch('second');
    expect(second.id).toBe(2);
    expect(removeScratch(1)).toBe(true);
    expect(removeScratch(99)).toBe(false);
  });
});

describe('features4: workspace readers', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), 'beurre-f4-'));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  // The readers enumerate the workspace with `git ls-files`, so a fixture has
  // to be a real repo and the files have to be staged — which can only happen
  // after a test writes them.
  function write(rel: string, body: string): void {
    writeFileSync(path.join(repo, rel), body);
  }

  function stage(): void {
    execSync('git init -q && git add -A', { cwd: repo, stdio: 'ignore' });
  }

  test('countLoc groups by language and skips binaries', () => {
    write('a.ts', 'a\nb\nc\n');
    write('b.py', 'x\n');
    stage();
    const rows = countLoc(repo);
    const ts = rows.find((r) => r.lang === 'typescript');
    expect(ts?.files).toBe(1);
    expect(ts?.lines).toBe(3);
    expect(rows.find((r) => r.lang === 'python')?.files).toBe(1);
  });

  test('biggestFiles sorts by size and returns a bounded list', () => {
    write('small.ts', 'x\n');
    write('large.ts', 'line\n'.repeat(500));
    stage();
    const rows = biggestFiles(repo, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe('large.ts');
  });

  test('dependencyDrift flags a range the install does not satisfy', () => {
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0' } }));
    mkdirSync(path.join(repo, 'node_modules', 'react'), { recursive: true });
    writeFileSync(path.join(repo, 'node_modules', 'react', 'package.json'), JSON.stringify({ version: '18.2.0' }));
    const rows = dependencyDrift(repo);
    expect(rows[0].outdated).toBe(true);
  });

  test('dependencyDrift flags a dependency that is not installed at all', () => {
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ dependencies: { ghost: '^1.0.0' } }));
    const rows = dependencyDrift(repo);
    expect(rows[0].installed).toBe('missing');
    expect(rows[0].outdated).toBe(true);
  });

  test('readers return null or empty outside a repo rather than throwing', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'beurre-norepo-'));
    try {
      expect(stashList(bare)).toBeNull();
      expect(changedWithHistory(bare)).toEqual([]);
      expect(dependencyDrift(bare)).toEqual([]);
      expect(countLoc(bare)).toEqual([]);
      expect(biggestFiles(bare)).toEqual([]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('features4: compat', () => {
  test('reports the runtime actually in use', () => {
    const rows = compat();
    expect(rows.some((r) => r.feature === 'runtime')).toBe(true);
    // The suite is running, so the runtime requirement is met by construction.
    expect(rows.find((r) => r.feature === 'runtime')?.ok).toBe(true);
  });
});

describe('features4: every renderer fits the terminal', () => {
  const CASES: [string, (w: number) => string[]][] = [
    ['stash empty', (w) => renderStashList([], w)],
    ['stash full', (w) => renderStashList([{ ref: 'stash@{0}', message: 'WIP on main: abc x', when: '', files: 0 }], w)],
    ['stash long', (w) => renderStashList([{ ref: 'stash@{12}', message: 'z'.repeat(400), when: '', files: 0 }], w)],
    ['commits empty', (w) => renderCommits([], 'since HEAD~5', w)],
    ['commits full', (w) => renderCommits([{ short: '1a2b3c4', subject: 'did a thing', author: 'alex', when: '2 hours ago' }], 'since HEAD~5', w)],
    ['commits long subject', (w) => renderCommits([{ short: '1a2b3c4', subject: 'z'.repeat(400), author: 'alex', when: '2 hours ago' }], 'since HEAD~5', w)],
    ['due empty', (w) => renderDue([], w)],
    ['due full', (w) => renderDue([{ text: 'buy milk', due: '2026-10-07', overdue: true }], w)],
    ['due long', (w) => renderDue([{ text: 'z'.repeat(400), due: '2026-10-07', overdue: false }], w)],
    ['bigfiles empty', (w) => renderBigFiles([], w)],
    ['bigfiles full', (w) => renderBigFiles([{ path: 'src/features4.ts', bytes: 16780, lines: 400 }], w)],
    ['bigfiles long path', (w) => renderBigFiles([{ path: 'z'.repeat(400), bytes: 1, lines: 1 }], w)],
    ['scratch empty', (w) => renderScratch([], w)],
    ['scratch full', (w) => renderScratch([{ id: 1, text: 'remember this', at: '2026-10-05T10:00:00.000Z' }], w)],
    ['scratch long', (w) => renderScratch([{ id: 1, text: 'z'.repeat(400), at: '2026-10-05T10:00:00.000Z' }], w)],
    ['deps empty', (w) => renderDeps([], w)],
    ['deps full', (w) => renderDeps([{ name: 'react-router', declared: '^7.1.0', installed: '6.0.0', outdated: true }], w)],
    ['deps long', (w) => renderDeps([{ name: 'z'.repeat(400), declared: '^7.1.0', installed: '7.2.0', outdated: false }], w)],
    ['loc empty', (w) => renderLoc([], w)],
    ['loc full', (w) => renderLoc([{ lang: 'typescript', files: 20, lines: 4000 }], w)],
    ['compat empty', (w) => renderCompat([], w)],
    ['compat full', (w) => renderCompat([{ feature: 'runtime', needs: 'node >= 20', have: 'v22.1.0', ok: true }], w)],
    ['compat long', (w) => renderCompat([{ feature: 'z'.repeat(400), needs: 'node', have: 'v22', ok: false }], w)],
    ['changed empty', (w) => renderChanged([], w)],
    ['changed full', (w) => renderChanged([{ file: 'src/theme.ts', status: 'M', who: 'alex' }], w)],
    ['changed long', (w) => renderChanged([{ file: 'z'.repeat(400), status: 'M', who: 'w'.repeat(400) }], w)],
  ];

  for (const [name, render] of CASES) {
    test(`${name} never exceeds the width`, () => {
      for (const w of WIDTHS) {
        expect(fits(w, render(w))).toBe(true);
      }
    });
  }
});

describe('features4: empty states are framed', () => {
  // The overlay erases by line count, so an unframed empty state next to a
  // framed populated one makes the whole screen drift.
  const EMPTY: [string, string[]][] = [
    ['stash', renderStashList([], 62)],
    ['commits', renderCommits([], 'x', 62)],
    ['due', renderDue([], 62)],
    ['big files', renderBigFiles([], 62)],
    ['scratch', renderScratch([], 62)],
    ['deps', renderDeps([], 62)],
    ['loc', renderLoc([], 62)],
    ['changed', renderChanged([], 62)],
  ];

  for (const [name, out] of EMPTY) {
    test(`${name} draws a frame when there is nothing to show`, () => {
      expect(out[0]).toContain('╭');
      expect(out[out.length - 1]).toContain('╰');
      // And it must say something, rather than render a blank box.
      expect(stripAnsi(out.join('\n')).trim().length).toBeGreaterThan(0);
    });
  }
});