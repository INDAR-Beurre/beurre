// Permanent tests for the three feature families added in `features3.ts`.
//
// These cover logic that would break silently: the ranking order of `/recall`,
// the upsert-by-title behaviour of the decision log, the truncation contract
// of `/replay`, and the git parsers. Wiring is deliberately not tested.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  blameSummary,
  countChurn,
  loadDecisions,
  parseReview,
  rankRecall,
  readTranscript,
  removeDecision,
  renderReplay,
  saveDecision,
  writeTranscript,
} from '../src/features3.ts';
import { stringWidth, stripAnsi } from '../src/layout.ts';

const REPO = path.resolve(import.meta.dir, '..');
const BEURRE = path.join(os.homedir(), '.beurre');
const DECISIONS = path.join(BEURRE, 'decisions.json');
const TRANSCRIPTS = path.join(BEURRE, 'transcripts');

describe('/decisions', () => {
  let backup: string | null = null;

  beforeEach(() => {
    backup = fs.existsSync(DECISIONS) ? fs.readFileSync(DECISIONS, 'utf8') : null;
  });

  afterEach(() => {
    if (backup === null) fs.rmSync(DECISIONS, { force: true });
    else fs.writeFileSync(DECISIONS, backup);
  });

  test('re-deciding a title replaces the rationale instead of duplicating it', () => {
    saveDecision('use a box', 'first reasoning');
    saveDecision('use a box', 'second reasoning');
    const list = loadDecisions();
    // A duplicate entry made the log useless as a record of what was decided.
    expect(list.filter((d) => d.title === 'use a box')).toHaveLength(1);
    expect(list.find((d) => d.title === 'use a box')?.rationale).toBe('second reasoning');
  });

  test('removing a decision that was never recorded reports false', () => {
    expect(removeDecision('never recorded')).toBe(false);
  });
});

describe('/recall ranking', () => {
  const hits = [
    { source: 'note' as const, label: 'caching notes', text: 'mentions cache once' },
    { source: 'decision' as const, label: 'cache', text: 'exact title' },
    { source: 'snippet' as const, label: 'cold storage', text: 'the cache is cold' },
  ];

  test('an exact title outranks a title prefix, which outranks a body mention', () => {
    // Without this order a decision literally titled "cache" loses to every note
    // that mentions the word in passing, which is the opposite of useful.
    expect(rankRecall('cache', hits).map((h) => h.source)).toEqual(['decision', 'note', 'snippet']);
  });

  test('matches case-insensitively and drops non-matches', () => {
    expect(rankRecall('CACH', hits)).toHaveLength(3);
    expect(rankRecall('zzz', hits)).toHaveLength(0);
  });
});

describe('/replay truncation', () => {
  test('a long message is cut and states how much was hidden', () => {
    // A silently clipped transcript reads as a complete one, which is how a
    // half-answer gets mistaken for the whole answer.
    const long = 'y'.repeat(900);
    const out = stripAnsi(renderReplay('/t.jsonl', [{ role: 'assistant', content: long }], 80).join('\n'));
    expect(out).toContain('…');
    expect(out).toContain('900 chars');
    expect(out).not.toContain(long);
  });

  test('a short message is shown whole with no ellipsis', () => {
    const out = stripAnsi(renderReplay('/t.jsonl', [{ role: 'user', content: 'fix the banner' }], 80).join('\n'));
    expect(out).toContain('fix the banner');
    expect(out).not.toContain('…');
  });

  test('an unreadable path renders a framed reason instead of throwing', () => {
    const out = stripAnsi(renderReplay('/no/such/file.jsonl', null, 80).join('\n'));
    expect(out).toContain('cannot read');
    expect(out).toContain('╭');
  });
});

describe('transcript round-trip', () => {
  let written: string | null = null;

  afterEach(() => {
    if (written) fs.rmSync(written, { force: true });
    written = null;
  });

  test('writes one JSON object per line and reads back identically', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    written = writeTranscript(messages, new Date('2026-10-05T12:00:00Z'));
    expect(fs.readFileSync(written, 'utf8').trim().split('\n')).toHaveLength(2);
    expect(readTranscript(written)).toEqual(messages);
  });

  test('a malformed transcript reads as null rather than throwing', () => {
    const bad = path.join(TRANSCRIPTS, 'bad.jsonl');
    fs.mkdirSync(TRANSCRIPTS, { recursive: true });
    fs.writeFileSync(bad, 'not json at all');
    expect(readTranscript(bad)).toBeNull();
    fs.rmSync(bad, { force: true });
  });
});

describe('git parsers', () => {
  test('parseReview pairs each changed file with its numstat counts', () => {
    const status = ' M src/theme.ts\n?? src/new.ts\n';
    const numstat = '12\t3\tsrc/theme.ts\n';
    const rows = parseReview(status, numstat);
    // An untracked file has no numstat row; dropping it would hide exactly the
    // new file a reviewer most needs to look at.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ status: 'M', file: 'src/theme.ts', adds: 12, dels: 3 });
    expect(rows[1]).toEqual({ status: '??', file: 'src/new.ts', adds: 0, dels: 0 });
  });

  test('countChurn returns the most-changed files first, capped at the limit', () => {
    const log = ['src/a.ts', 'src/b.ts', 'src/a.ts', 'src/c.ts', 'src/a.ts', 'src/b.ts', ''].join('\n');
    expect(countChurn(log, 2)).toEqual([
      { file: 'src/a.ts', changes: 3 },
      { file: 'src/b.ts', changes: 2 },
    ]);
  });

  test('countChurn ignores blank lines and commit-header noise', () => {
    expect(countChurn('commit abc123\nAuthor: x\n\n', 5)).toEqual([]);
  });
});

describe('blameSummary reads real history', () => {
  test('finds the commits that actually touched a file in this repo', () => {
    // `git shortlog` summarises stdin. Without an explicit revision it reads an
    // empty stream and reports "no commits" for a file with hundreds of them —
    // a plausible-looking empty result, not an error, so nothing else caught it.
    const rows = blameSummary(REPO, 'src/theme.ts');
    expect(rows).not.toBeNull();
    expect(rows ?? []).toHaveLength(1);
    expect((rows ?? []).reduce((a, r) => a + r.commits, 0)).toBeGreaterThan(0);
  });

  test('share percentages describe this file and sum to about 100', () => {
    const rows = blameSummary(REPO, 'src/theme.ts') ?? [];
    const sum = rows.reduce((a, r) => a + r.share, 0);
    // Rounding can land the total on 99 or 101, but not on a number derived
    // from a different denominator — which is what the old rev-list total was
    // doing whenever a file had merge commits.
    expect(sum).toBeGreaterThanOrEqual(95);
    expect(sum).toBeLessThanOrEqual(105);
  });

  test('a path git has never seen returns an empty list, not null', () => {
    // null means "not a git repository"; [] means "no commits touch this file".
    // Collapsing the two would claim a file has no history when the truth is
    // that the command cannot answer at all.
    expect(blameSummary(REPO, 'does/not/exist.ts')).toEqual([]);
  });

  test('outside a git repository it returns null rather than throwing', () => {
    expect(blameSummary(os.tmpdir(), 'src/theme.ts')).toBeNull();
  });
});

describe('renderer width contract', () => {
  const WIDTHS = [20, 26, 30, 46, 62, 80, 120];

  test('every new renderer stays inside the terminal at every width', () => {
    // The defect this catches is between surfaces: a renderer two columns wide
    // erases its overlay by the wrong line count and the whole screen drifts.
    const long = 'z'.repeat(300);
    const renderers = [(w: number) => renderReplay('/t.jsonl', [{ role: 'assistant', content: long }], w)];
    for (const render of renderers) {
      for (const w of WIDTHS) {
        for (const line of render(w)) {
          expect(stringWidth(line)).toBeLessThanOrEqual(w);
        }
      }
    }
  });
});