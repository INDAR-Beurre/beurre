import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripAnsi, stringWidth } from '../src/layout.ts';
import { renderModelList } from '../src/model-picker.ts';
import * as features2 from '../src/features2.ts';
import { relay } from '../src/relay.ts';
import { SLASH_COMMANDS } from '../src/predictive.ts';
import { contentWidth } from '../src/features.ts';
import { runHook, renderHooks, type HookConfig } from '../src/features2.ts';
import {
  addTodo,
  analysePrompt,
  clearDoneTodos,
  diagnoseRelay,
  BISECT_MIN_STEPS,
  bisectProgress,
  countTree,
  currentBranch,
  describeElapsed,
  explainIgnored,
  listStashes,
  readBlame,
  readCommits,
  readIgnoreRules,
  renderBlame,
  renderBisect,
  renderBranch,
  renderCommits,
  renderIgnoreCheck,
  renderIgnoreRules,
  renderLastCommit,
  renderMarkers,
  renderSessionClock,
  renderStashes,
  renderWordCount,
  scanMarkers,
  type Commit,
  auditDependencies,
  compareVersions,
  describePermissions,
  groupCommits,
  parseListeningPorts,
  readEnvKeys,
  renderChangelog,
  renderChurn,
  renderCrons,
  renderDeps,
  renderEnvKeys,
  renderOpen,
  renderPorts,
  renderTables,
  renderThemes,
  resolveOpen,
  validateCron,
  expandAlias,
  exportTranscript,
  formatBytes,
  inspectPath,
  keybindings,
  listAliases,
  listNotes,
  listTodos,
  measureCache,
  readWorkingTree,
  removeNote,
  renderAliases,
  renderCache,
  renderChanges,
  renderExport,
  renderKeybindings,
  renderNotes,
  renderPreflight,
  renderTokens,
  renderTodos,
  renderWatch,
  saveAlias,
  saveNote,
  toggleTodo,
  transcriptTo,
  EXPORT_FORMATS,
} from '../src/features2.ts';
import type { ChatMessage } from '../src/relay.ts';

// `box()` floors at 20 columns, so that is the narrowest frame worth honouring.
const WIDTHS = [20, 26, 30, 46, 62, 80, 120];

function fixture(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'beurre-f2-'));
}

describe('features2 renderers never overflow the frame', () => {
  // The bug this pins: footer and summary lines joined in AFTER box() are not
  // truncated by box(), so they silently ran past the terminal and made the
  // next redraw erase the wrong number of rows.
  const cases: Array<[string, (w: number) => string]> = [
    ['notes', (w) => renderNotes([{ tag: 'api', text: 'relay key rotates weekly' }, { tag: 'db', text: 'postgres on 5432' }], w)],
    ['notes empty', (w) => renderNotes([], w)],
    ['todos', (w) => renderTodos([{ text: 'fix the parser', done: false, at: 1 }, { text: 'ship it', done: true, at: 2 }], w)],
    ['todos empty', (w) => renderTodos([], w)],
    ['aliases', (w) => renderAliases({ ll: 'ls -la', t: 'bun test' }, w)],
    ['aliases empty', (w) => renderAliases({}, w)],
    ['tokens', (w) => renderTokens('some prose\n```ts\nconst x = 1;\n```\nmore prose', w)],
    ['tokens empty', (w) => renderTokens('', w)],
    ['keys', (w) => renderKeybindings(keybindings(), w)],
    ['cache', (w) => renderCache([{ label: 'node_modules', bytes: 150_000_000 }, { label: '.git', bytes: 2_000_000 }], w)],
    ['cache empty', (w) => renderCache([], w)],
    ['changes', (w) => renderChanges([{ status: 'M', file: 'src/a.ts', insertions: 3, deletions: 1 }], w)],
    ['changes clean', (w) => renderChanges([], w)],
    ['changes non-git', (w) => renderChanges(null, w)],
    ['watch', (w) => renderWatch([{ label: '/tmp/x', exists: true, kind: 'file', size: 12 }], w)],
    ['watch empty', (w) => renderWatch([], w)],
    ['preflight', (w) => renderPreflight(diagnoseRelay(fixture(), 'https://example.invalid', true), w)],
    ['export unknown', (w) => renderExport(null, 'pdf', w)],
    ['export written', (w) => renderExport('/tmp/beurre-transcript-2026-01-01T00-00-00.md', 'md', w)],
  ];

  for (const [name, render] of cases) {
    for (const width of WIDTHS) {
      test(`${name} at ${width} cols`, () => {
        for (const line of render(width).split('\n')) {
          expect(stringWidth(line)).toBeLessThanOrEqual(width);
        }
      });
    }
  }
});

describe('renderTodos summarises without truncating its own hint', () => {
  test('wide frames keep the hint readable', () => {
    expect(stripAnsi(renderTodos([{ text: 'a', done: false, at: 1 }], 80))).toContain('/todo add <text>');
  });
  test('narrow frames still fit', () => {
    for (const line of renderTodos([{ text: 'a', done: false, at: 1 }], 30).split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(30);
    }
  });
});

describe('exportTranscript', () => {
  const msgs: ChatMessage[] = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ];

  test('md keeps both turns', () => {
    expect(transcriptTo(msgs, 'md')).toContain('hello');
    expect(transcriptTo(msgs, 'md')).toContain('hi');
  });
  test('json round-trips', () => {
    expect(JSON.parse(transcriptTo(msgs, 'json'))).toEqual(msgs);
  });
  test('txt marks the speaker', () => {
    expect(transcriptTo(msgs, 'txt')).toContain('user: hello');
  });
  test('every advertised format is supported', () => {
    for (const f of EXPORT_FORMATS) {
      expect(transcriptTo(msgs, f.id).length).toBeGreaterThan(0);
    }
  });
  test('an unknown format writes nothing', () => {
    const dir = fixture();
    expect(exportTranscript(msgs, 'pdf', dir)).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  test('a known format writes a file with the right extension', () => {
    const dir = fixture();
    const file = exportTranscript(msgs, 'json', dir);
    expect(file).not.toBeNull();
    expect(file?.endsWith('.json')).toBe(true);
    expect(fs.existsSync(file as string)).toBe(true);
  });
});

describe('expandAlias', () => {
  test('expands a leading alias and keeps the arguments', () => {
    expect(expandAlias('/ll -la', { ll: 'ls' })).toBe('ls -la');
  });
  test('leaves an unknown command alone', () => {
    expect(expandAlias('/nope', { ll: 'ls' })).toBeNull();
  });
  test('does not expand a bare word', () => {
    expect(expandAlias('ll', { ll: 'ls' })).toBeNull();
  });
  test('an alias can expand to another slash command', () => {
    expect(expandAlias('/clean', { clean: '/clear' })).toBe('/clear');
  });
  test('an empty expansion collapses to nothing', () => {
    expect(expandAlias('/ll', { ll: '' })).toBe('');
  });
});

describe('alias persistence', () => {
  test('save then list round-trips', () => {
    saveAlias('ll', 'ls -la');
    expect(listAliases().ll).toBe('ls -la');
  });
  test('saving the same name twice overwrites', () => {
    saveAlias('ll', 'ls -la');
    saveAlias('ll', 'ls -l');
    expect(listAliases().ll).toBe('ls -l');
  });
  test('removing an alias that does not exist reports false', () => {
    expect(saveAlias('nothing-here', null)).toBe(false);
  });
  test('removing a real alias drops it', () => {
    saveAlias('tmp-alias', 'echo hi');
    expect(saveAlias('tmp-alias', null)).toBe(true);
    expect(listAliases()['tmp-alias']).toBeUndefined();
  });
});

describe('note persistence', () => {
  test('saving the same tag twice replaces the note', () => {
    saveNote('api', 'first');
    saveNote('api', 'second');
    const notes = listNotes();
    expect(notes.filter((n) => n.tag === 'api').length).toBe(1);
    expect(notes.find((n) => n.tag === 'api')?.text).toBe('second');
  });
  test('removing an unknown note reports false', () => {
    expect(removeNote('never-existed')).toBe(false);
  });
  test('removing a real note drops it', () => {
    saveNote('gone', 'bye');
    expect(removeNote('gone')).toBe(true);
    expect(listNotes().some((n) => n.tag === 'gone')).toBe(false);
  });
});

describe('todo persistence', () => {
  test('toggling flips done and back', () => {
    const text = `todo-${Date.now()}`;
    addTodo(text);
    expect(toggleTodo(text)).toBe(true);
    expect(listTodos().find((t) => t.text === text)?.done).toBe(true);
    toggleTodo(text);
    expect(listTodos().find((t) => t.text === text)?.done).toBe(false);
  });
  test('toggling an unknown todo reports false', () => {
    expect(toggleTodo('never-existed')).toBe(false);
  });
  test('clear removes only completed items', () => {
    addTodo(`keep-${Date.now()}`);
    const done = `drop-${Date.now()}`;
    addTodo(done);
    toggleTodo(done);
    const cleared = clearDoneTodos();
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect(listTodos().some((t) => t.text === done)).toBe(false);
  });
});

describe('analysePrompt', () => {
  test('a fenced block is counted as code', () => {
    const slices = analysePrompt('hi\n```js\nconst a = 1;\n```');
    expect(slices.find((s) => s.label === 'code')?.chars).toBeGreaterThan(0);
  });
  test('shares sum to one', () => {
    const slices = analysePrompt('a\n```\nb\n```\nc');
    expect(slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 5);
  });
  test('an empty prompt has no slices', () => {
    expect(analysePrompt('')).toEqual([]);
  });
});

describe('formatBytes', () => {
  test('bytes below a kilobyte stay in bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  test('it scales through the units', () => {
    expect(formatBytes(2048)).toBe('2.0 K');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 M');
  });
});

describe('inspectPath', () => {
  test('a real directory is reported as a dir', () => {
    const dir = fixture();
    expect(inspectPath(dir).kind).toBe('dir');
  });
  test('a missing path is reported as missing, not thrown', () => {
    const target = inspectPath('/tmp/definitely-not-here-beurre');
    expect(target.exists).toBe(false);
    expect(target.kind).toBe('missing');
  });
});

describe('readWorkingTree', () => {
  test('a non-repo returns null rather than throwing', () => {
    expect(readWorkingTree('/tmp')).toBeNull();
  });
});

describe('measureCache', () => {
  test('an empty project measures nothing', () => {
    expect(measureCache(fixture())).toEqual([]);
  });
});

describe('diagnoseRelay', () => {
  test('a missing credential is reported as a failure', () => {
    const checks = diagnoseRelay(fixture(), 'https://example.invalid', false);
    expect(checks.find((c) => c.name === 'Credential')?.ok).toBe(false);
  });
  test('a present credential passes', () => {
    const checks = diagnoseRelay(fixture(), 'https://example.invalid', true);
    expect(checks.find((c) => c.name === 'Credential')?.ok).toBe(true);
  });
  test('git is informational and never fails the check', () => {
    const checks = diagnoseRelay('/tmp', 'https://example.invalid', true);
    expect(checks.find((c) => c.name === 'Git')?.ok).toBe(true);
  });
});

describe('keybindings', () => {
  test('every binding names both a key and an action', () => {
    for (const b of keybindings()) {
      expect(b.keys.length).toBeGreaterThan(0);
      expect(b.action.length).toBeGreaterThan(0);
    }
  });
});
// ------------------------------------------------------- round three ----

const REPO = path.resolve(import.meta.dir, '..');

describe('git history commands', () => {
  test('reads real commits from this repository', () => {
    const commits = readCommits(REPO, 5);
    expect(commits.length).toBeGreaterThan(0);
    expect(commits[0].subject.length).toBeGreaterThan(0);
    expect(commits[0].short.length).toBeGreaterThanOrEqual(7);
  });

  test('returns empty rather than throwing outside a repository', () => {
    expect(readCommits('/tmp')).toEqual([]);
    expect(listStashes('/tmp')).toEqual([]);
    expect(readIgnoreRules('/tmp')).toEqual([]);
  });

  test('blame attributes a known tracked file', () => {
    const lines = readBlame(REPO, 'src/layout.ts', 5);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].text.length).toBeGreaterThan(0);
  });
});

describe('bisect progress', () => {
  test('refuses to judge a bisect with too few steps', () => {
    const p = bisectProgress(1);
    expect(p.ok).toBe(false);
    expect(p.next).toContain(String(BISECT_MIN_STEPS));
  });
  test('reports the halved range once there are enough steps', () => {
    const p = bisectProgress(10);
    expect(p.ok).toBe(true);
    expect(p.next).toContain('5');
  });
});

describe('ignorecheck', () => {
  test('names the rule and file that ignore a build artifact', () => {
    const r = explainIgnored(REPO, 'node_modules');
    expect(r.state).toBe('ignored');
    expect(r.reason.length).toBeGreaterThan(0);
  });
  test('reports an untracked source file as addable, not ignored', () => {
    const r = explainIgnored(REPO, 'README.md');
    expect(r.state === 'tracked' || r.state === 'untracked').toBe(true);
    if (r.state === 'untracked') expect(r.reason).toContain('git add');
  });
});

describe('tree scanning', () => {
  test('counts source files and skips vendored trees', () => {
    const c = countTree(REPO, 'src');
    expect(c.files).toBeGreaterThan(5);
    expect(c.lines).toBeGreaterThan(c.files);
    expect(c.words).toBeGreaterThan(0);
  });
  test('finds the marker strings it was asked to find', () => {
    const hits = scanMarkers(REPO);
    expect(Array.isArray(hits)).toBe(true);
    for (const h of hits) {
      expect(h.file.length).toBeGreaterThan(0);
      expect(h.line).toBeGreaterThan(0);
    }
  });
});

describe('session clock', () => {
  test('never reports a negative elapsed time when the clock moves backwards', () => {
    expect(describeElapsed(1000, 500)).toBe('0s');
  });
  test('scales from seconds to minutes to hours', () => {
    expect(describeElapsed(0, 5_000)).toBe('5s');
    expect(describeElapsed(0, 125_000)).toBe('2m 5s');
    expect(describeElapsed(0, 3_900_000)).toBe('1h 5m');
  });
});

describe('round-three renderers honour the width invariant', () => {
  const commits: Commit[] = [{ short: 'abc1234', author: 'alex', date: '2026-10-05', subject: 'Fix the thing' }];
  const renderers: Record<string, (w: number) => string[]> = {
    renderCommits: (w) => renderCommits(commits, w),
    renderCommitsEmpty: (w) => renderCommits([], w),
    renderBranch: (w) => renderBranch({ name: 'main', upstream: 'origin/main', ahead: 2, behind: 5 }, w),
    renderBranchNoUpstream: (w) => renderBranch({ name: 'main', upstream: null, ahead: 0, behind: 0 }, w),
    renderStashes: (w) => renderStashes([{ ref: 'stash@{0}', when: '2 hours ago', message: 'work' }], w),
    renderStashesEmpty: (w) => renderStashes([], w),
    renderBlame: (w) => renderBlame([{ line: 1, author: 'alex', when: '', text: 'export const x = 1;' }], 'src/a.ts', w),
    renderBlameEmpty: (w) => renderBlame([], 'src/a.ts', w),
    renderBisect: (w) => renderBisect({ steps: 10, culprit: 'deadbeef' }, w),
    renderBisectEarly: (w) => renderBisect({ steps: 1, culprit: null }, w),
    renderIgnoreRules: (w) => renderIgnoreRules([{ pattern: 'node_modules', source: 'repo' }], w),
    renderIgnoreRulesEmpty: (w) => renderIgnoreRules([], w),
    renderIgnoreCheck: (w) => renderIgnoreCheck('dist/x.js', { state: 'ignored', reason: 'dist (repo)' }, w),
    renderWordCount: (w) => renderWordCount('.', { files: 120, lines: 9000, words: 64000 }, w),
    renderWordCountZero: (w) => renderWordCount('.', { files: 0, lines: 0, words: 0 }, w),
    renderMarkers: (w) => renderMarkers([{ file: 'src/a.ts', line: 9, text: '// TODO: fix' }], w),
    renderMarkersEmpty: (w) => renderMarkers([], w),
    renderSessionClock: (w) => renderSessionClock(0, 125_000, 7, w),
    renderSessionClockIdle: (w) => renderSessionClock(0, 1000, 0, w),
    renderLastCommit: (w) => renderLastCommit('/tmp', w),
  };

  for (const [name, render] of Object.entries(renderers)) {
    for (const width of WIDTHS) {
      test(`${name} fits ${width} columns`, () => {
        for (const line of render(width)) {
          expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(width);
        }
      });
    }
  }
});

describe('every new renderer is reachable from the dispatcher', () => {
  test('the relay methods the model picker calls actually exist', () => {
    // /models rendered nothing at all for the life of the feature: the picker
    // called relay.listModels()/listProviders(), which do not exist, the
    // TypeError was swallowed by a catch, and the screen silently returned.
    expect(typeof relay.fetchLiveModels).toBe('function');
    expect(typeof relay.fetchProviders).toBe('function');
  });

  test('every registered command has a dispatcher case', () => {
    const repl = fs.readFileSync(path.join(REPO, 'src/repl.ts'), 'utf8');
    const missing = SLASH_COMMANDS.filter((c) => !repl.includes(`case '${c.command}'`));
    expect(missing.map((c) => c.command)).toEqual([]);
  });

  test('no command is registered twice', () => {
    const seen = SLASH_COMMANDS.map((c) => c.command);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('every registered command is documented in the README', () => {
    const md = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
    const undocumented = SLASH_COMMANDS.filter((c) => !new RegExp(`\`${c.command}[ \`]`).test(md));
    expect(undocumented.map((c) => c.command)).toEqual([]);
  });
});

describe('bar charts encode the number they claim to', () => {
  // Regression: the filled glyph was '', so ''.repeat(n) rendered nothing
  // and only the empty track showed. Bigger numbers drew SHORTER bars, and
  // every width assertion still passed because the line was the right length.
  const rowBars = (c: { files: number; lines: number; words: number }, width = 80) =>
    renderWordCount('src', c, width)
      .map((l) => stripAnsi(l))
      .filter((l) => /files|lines|words/.test(l))
      .map((l) => l.slice(l.indexOf('█' === '' ? 0 : 0)).match(/[█░]/g)?.join('') ?? '');

  test('a bigger number never draws a shorter bar', () => {
    const bars = rowBars({ files: 10, lines: 100, words: 1000 });
    const filled = bars.map((b) => (b.match(/█/g) ?? []).length);
    expect(filled[0]).toBeLessThan(filled[1]);
    expect(filled[1]).toBeLessThan(filled[2]);
  });

  test('the largest value fills the whole track', () => {
    const bars = rowBars({ files: 1, lines: 2, words: 100000 });
    expect((bars[2].match(/█/g) ?? []).length).toBe(24);
  });

  test('an all-zero tree draws empty tracks, not a crash', () => {
    const bars = rowBars({ files: 0, lines: 0, words: 0 });
    for (const b of bars) expect(b).toBe('░'.repeat(24));
  });
});

// ------------------------------------------------------- round four ----

describe('dependency audit', () => {
  test('compares an installed version against the wanted range', () => {
    expect(compareVersions('1.2.3', '^1.2.0')).toBe('ok');
    expect(compareVersions('1.2.3', '1.2.3')).toBe('ok');
    expect(compareVersions('1.2.3', '^2.0.0')).toBe('behind');
    expect(compareVersions('3.0.0', '^2.0.0')).toBe('ahead');
  });
  test('an exact pin behind is missing, not merely behind', () => {
    expect(compareVersions('1.0.0', '1.2.0')).toBe('missing');
    expect(compareVersions('1.0.0', '~1.2.0')).toBe('behind');
  });
  test('a malformed version is unknown rather than a wrong answer', () => {
    expect(compareVersions('not-a-version', '^1.0.0')).toBe('unknown');
  });
  test('a missing package.json yields no dependencies, not a throw', () => {
    expect(auditDependencies('/tmp')).toEqual([]);
  });
});

describe('changelog grouping', () => {
  test('buckets conventional commits and keeps the rest', () => {
    const g = groupCommits(['feat: add x', 'fix: y', 'docs: z', 'random thing']);
    expect(g.map((x) => x.kind)).toEqual(['feat', 'fix', 'docs', 'other']);
    expect(g[0].commits).toEqual(['feat: add x']);
  });
  test('empty sections are omitted entirely', () => {
    expect(groupCommits(['fix: a']).map((g) => g.kind)).toEqual(['fix']);
  });
  test('a scoped commit still classifies', () => {
    expect(groupCommits(['feat(api): add route'])[0].kind).toBe('feat');
  });
});

describe('cron validation', () => {
  test('accepts a well-formed expression and reports why others fail', () => {
    expect(validateCron('0 9 * * 1-5 backup').valid).toBe(true);
    expect(validateCron('99 * * * * run').reason).toContain('minute');
    expect(validateCron('0 9 * run').reason).toContain('expected 5 time fields');
  });
  test('the command is separated from the schedule', () => {
    const e = validateCron('*/5 * * * * npm test');
    expect(e.schedule).toBe('*/5 * * * *');
    expect(e.command).toBe('npm test');
  });
});

describe('env keys never print a secret value', () => {
  const env = { API_KEY: 'sk-should-never-appear', HOME: '/home/alex', LOWERCASE: 'x', PATH: '/usr/bin' };
  test('a secret-looking name is flagged and its length kept', () => {
    const keys = readEnvKeys(env as NodeJS.ProcessEnv);
    const k = keys.find((x) => x.name === 'API_KEY');
    expect(k?.looksSecret).toBe(true);
    expect(k?.length).toBe('sk-should-never-appear'.length);
  });
  test('the rendered table cannot contain the value', () => {
    const out = renderEnvKeys(readEnvKeys(env as NodeJS.ProcessEnv), 80).join('\n');
    expect(stripAnsi(out)).not.toContain('sk-should-never-appear');
    expect(stripAnsi(out)).toContain('API_KEY');
  });
  test('only conventional upper-case names are listed', () => {
    const mixed = { ...env, lower_case: 'x', '2BAD': 'y' };
    const names = readEnvKeys(mixed as NodeJS.ProcessEnv).map((k) => k.name);
    expect(names).toContain('HOME');
    expect(names).toContain('API_KEY');
    expect(names).toContain('LOWERCASE');
    expect(names).not.toContain('lower_case');
    expect(names).not.toContain('2BAD');
  });
});

describe('port parsing', () => {
  const SS = [
    'tcp LISTEN 0 4096 127.0.0.1:3000 0.0.0.0:* users:(("bun",pid=1234,fd=20))',
    'udp UNCONN 0 0 127.0.0.1:44435 0.0.0.0:* users:(("adb",pid=3190150,fd=14))',
    'tcp LISTEN 0 4096 127.0.0.53%lo:53 0.0.0.0:*',
  ].join('\n');
  test('finds the port, the process and the pid', () => {
    const p = parseListeningPorts(SS);
    expect(p.map((x) => x.port)).toEqual([3000, 44435]);
    expect(p[0].proc).toBe('bun');
    expect(p[0].pid).toBe(1234);
  });
  test('does not skip the first line, ss -H prints no header', () => {
    expect(parseListeningPorts(SS)[0].port).toBe(3000);
  });
  test('a socket with no owning process is skipped, not guessed at', () => {
    expect(parseListeningPorts(SS).some((x) => x.port === 53)).toBe(false);
  });
  test('empty input is empty output', () => {
    expect(parseListeningPorts('')).toEqual([]);
  });
});

describe('open target resolution', () => {
  test('a URL is recognised without touching the filesystem', () => {
    expect(resolveOpen('https://example.com').kind).toBe('url');
  });
  test('a missing path is reported rather than launched', () => {
    expect(resolveOpen('/definitely/not/here').kind).toBe('missing');
  });
  test('a real directory is a dir', () => {
    expect(resolveOpen('/tmp').kind).toBe('dir');
  });
});

describe('round-four renderers honour the width invariant', () => {
  const renderers: Record<string, (w: number) => string[]> = {
    renderDeps: (w) => renderDeps([{ name: 'left-pad', version: '^1.3.0', wanted: '^1.3.0', current: '1.2.0', state: 'behind' }], w),
    renderDepsEmpty: (w) => renderDeps([], w),
    renderDepsAllOk: (w) => renderDeps([{ name: 'x', version: '^1.0.0', wanted: '^1.0.0', current: '1.0.1', state: 'ok' }], w),
    renderChangelog: (w) => renderChangelog(groupCommits(['feat: a very long commit subject that will not fit', 'fix: b']), '1.2.3', w),
    renderChangelogEmpty: (w) => renderChangelog([], '1.0.0', w),
    renderOpen: (w) => renderOpen(resolveOpen('https://example.com/a/very/long/url/that/keeps/going/and/going'), w),
    renderOpenMissing: (w) => renderOpen(resolveOpen('/definitely/not/here/at/all'), w),
    describePermissions: (w) => describePermissions('auto-read', w),
    renderPorts: (w) => renderPorts([{ port: 65535, proc: 'a-very-long-process-name', pid: 123456 }], w),
    renderPortsEmpty: (w) => renderPorts([], w),
    renderThemes: (w) => renderThemes('butter', w),
    renderTables: (w) => renderTables([{ name: 'a_very_long_table_name', rows: 10, bytes: 1048576 }], '/tmp/x.db', w),
    renderTablesEmpty: (w) => renderTables([], '/tmp/x.db', w),
    renderEnvKeys: (w) => renderEnvKeys([{ name: 'A_VERY_LONG_SECRET_VARIABLE_NAME', set: true, looksSecret: true, length: 40 }], w),
    renderEnvKeysEmpty: (w) => renderEnvKeys([], w),
    renderCrons: (w) => renderCrons([{ schedule: '*/5 * * * *', command: 'npm test', valid: true, reason: '' }], w),
    renderCronsInvalid: (w) => renderCrons([{ schedule: '99 * * * *', command: 'x', valid: false, reason: 'minute field "99" is not a valid cron field' }], w),
    renderCronsEmpty: (w) => renderCrons([], w),
    renderChurn: (w) => renderChurn([{ line: 42, times: 19, text: 'const x = doTheThing(withArguments);' }], 'src/index.ts', w),
    renderChurnEmpty: (w) => renderChurn([], 'src/index.ts', w),
  };
  for (const [name, render] of Object.entries(renderers)) {
    for (const width of WIDTHS) {
      test(`${name} fits ${width} columns`, () => {
        for (const line of render(width)) expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(width);
      });
    }
  }
});

describe('round-four contract', () => {
  test('every registered command has a dispatcher case', () => {
    const repl = fs.readFileSync(path.join(REPO, 'src/repl.ts'), 'utf8');
    const missing = SLASH_COMMANDS.filter((c) => !repl.includes(`case '${c.command}'`));
    expect(missing.map((c) => c.command)).toEqual([]);
  });

  test('every symbol repl.ts imports from features2 actually exists', () => {
    // /bisect shipped as `renderBisect is not defined` because it was
    // dispatched but never imported. Read the import block, then resolve each
    // name against the real module -- the audit that catches the whole class.
    const f2 = features2 as unknown as Record<string, unknown>;
    const src = fs.readFileSync(path.join(REPO, 'src/repl.ts'), 'utf8');
    const block = src.match(/from '\.\/features2\.ts'/)?.index;
    expect(block).toBeGreaterThan(0);
    const start = src.lastIndexOf('import {', block);
    const names = src.slice(start, block).match(/^\s+([a-zA-Z][a-zA-Z0-9_]*),/gm) ?? [];
    const missing = names
      .map((l) => l.trim().replace(',', ''))
      .filter((n) => n !== 'type' && !(n in f2));
    expect(missing).toEqual([]);
  });

  test('every new command is documented in the README', () => {
    const md = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
    const NEW = ['/deps', '/changelog', '/open', '/permissions', '/ports', '/theme', '/tables', '/envkeys', '/when', '/churn'];
    const undocumented = SLASH_COMMANDS.filter(
      (c) => NEW.includes(c.command) && !new RegExp(`\`${c.command}[ \`]`).test(md),
    );
    expect(undocumented.map((c) => c.command)).toEqual([]);
  });
});

describe('every surface shares one frame', () => {
  // Individually, each renderer already satisfies the width invariant. The
  // defect this catches is *between* them: a surface that renders 78 columns
  // while its neighbours render 80 makes the overlay erase by the wrong line
  // count and the whole screen drifts.
  const surfaces: Record<string, (w: number) => string[]> = {
    renderDeps: (w) => renderDeps([{ name: 'left-pad', version: '^1.3.0', wanted: '^1.3.0', current: '1.2.0', state: 'behind' }], w),
    renderPorts: (w) => renderPorts([{ port: 3000, proc: 'bun', pid: 1234 }], w),
    renderThemes: (w) => renderThemes('butter', w),
    renderChurn: (w) => renderChurn([{ line: 42, times: 19, text: 'const x = 1' }], 'src/index.ts', w),
    renderCrons: (w) => renderCrons([{ schedule: '*/5 * * * *', command: 'npm test', valid: true, reason: '' }], w),
    renderTables: (w) => renderTables([{ name: 'users', rows: 10, bytes: 1048576 }], '/tmp/x.db', w),
    renderEnvKeys: (w) => renderEnvKeys([{ name: 'API_KEY', set: true, looksSecret: true, length: 40 }], w),
    renderChangelog: (w) => renderChangelog(groupCommits(['feat: a very long subject that will not fit at all']), '1.2.3', w),
    renderOpen: (w) => renderOpen(resolveOpen('https://example.com/very/long/url/that/keeps/going'), w),
    describePermissions: (w) => describePermissions('ask', w),
  };

  for (const width of [46, 62, 80, 120]) {
    test(`all surfaces render exactly ${width} columns at width ${width}`, () => {
      for (const [name, render] of Object.entries(surfaces)) {
        const widths = new Set(render(width).map((l) => stringWidth(stripAnsi(l))));
        expect(`${name}=${[...widths].join('/')}`).toBe(`${name}=${width}`);
      }
    });
  }

  test('the model picker is framed like the rest, not floating free', () => {
    const lines = renderModelList([{ id: 'glm-5-3-flash', name: 'GLM 5.3 Flash' }], 0, '', 80, 'glm-5-3-flash').map(stripAnsi);
    expect(lines[0]).toMatch(/^╭─ select a model ─/);
    expect(new Set(lines.map((l) => stringWidth(l))).size).toBe(1);
  });
});

describe('renderPorts keeps the pid readable', () => {
  // The pid suffix was appended after the proc column was already sized to the
  // full width, so the row overflowed and box() clipped it to "pid 366…".
  // A pid you cannot read is a pid you cannot kill.
  const ports = [
    { port: 3000, proc: 'bun', pid: 1234 },
    { port: 443, proc: 'a-very-long-process-name-here', pid: 987654 },
    { port: 8080, proc: 'chrome', pid: 5 },
  ];

  for (const width of [34, 40, 46, 62, 80, 120]) {
    test(`prints every pid in full at ${width} columns`, () => {
      const lines = renderPorts(ports, width).map(stripAnsi);
      for (const p of ports) {
        expect(lines.some((l) => l.includes(`pid ${p.pid}`))).toBe(true);
      }
      expect(lines.some((l) => /pid\s+\d*…/.test(l))).toBe(false);
    });
  }
});

describe('contentWidth never exceeds the terminal', () => {
  // The 40 floor made every box wider than a narrow terminal, so at 30 columns
  // each row of /ports wrapped onto two lines. Verified live in a 30-col pty.
  for (const cols of [20, 26, 30, 40, 60, 80, 120]) {
    test(`stays within ${cols} columns`, () => {
      const prev = process.stdout.columns;
      process.stdout.columns = cols;
      const w = contentWidth();
      process.stdout.columns = prev;
      expect(w).toBeLessThanOrEqual(cols);
      expect(w).toBeGreaterThanOrEqual(20);
    });
  }
});

describe('hooks', () => {
  // hooks.json is real user configuration, so no test may touch
  // the real one: a test that replaced someone's guard script
  // would be worse than no test. The hooks path comes from
  // getBeurreDir(), which resolves through BEURRE_HOME, so
  // redirect it at a scratch dir and everything under test
  // stays inside the suite.
  const BEURRE_HOME = path.join(import.meta.dir, '..', '.beurre-test-hooks');
  const HOOKS = path.join(BEURRE_HOME, 'hooks.json');

  beforeEach(() => {
    fs.rmSync(BEURRE_HOME, { recursive: true, force: true });
    process.env.BEURRE_HOME = BEURRE_HOME;
  });
  afterEach(() => {
    delete process.env.BEURRE_HOME;
    fs.rmSync(BEURRE_HOME, { recursive: true, force: true });
  });

  const write = (rules: Record<string, unknown>) => {
    fs.mkdirSync(path.dirname(HOOKS), { recursive: true });
    fs.writeFileSync(HOOKS, JSON.stringify({ rules }), 'utf-8');
  };

  test('runs a handler and returns its plain output', () => {
    write({ 'turn-end': [{ matcher: '*', command: 'echo hello-from-hook' }] });
    const r = runHook('turn-end', 'turn', {});
    expect(r.output).toContain('hello-from-hook');
    expect(r.denied).toBe(false);
  });

  test('lets a pre-tool handler deny the call', () => {
    write({
      'pre-tool': [
        {
          matcher: 'bash',
          command: `echo '{"permissionDecision":"deny","reason":"no rm -rf"}'`,
        },
      ],
    });
    const r = runHook('pre-tool', 'bash', { tool_input: { command: 'rm -rf /' } });
    expect(r.denied).toBe(true);
    expect(r.reason).toBe('no rm -rf');
  });

  test('does not fire a handler whose matcher names a different tool', () => {
    write({ 'pre-tool': [{ matcher: 'write', command: 'echo nope' }] });
    const r = runHook('pre-tool', 'bash', { tool_input: { command: 'ls' } });
    expect(r.output).not.toContain('nope');
    expect(r.denied).toBe(false);
  });

  test('reports a failing handler instead of swallowing it', () => {
    // A guard script that crashes must be visible: silently skipping it is how
    // you lose a guard.
    write({ 'pre-tool': [{ matcher: '*', command: 'exit 3' }] });
    const r = runHook('pre-tool', 'bash', {});
    expect(r.output).toContain('exit 3');
  });

  test('ignores rules with no command rather than throwing', () => {
    write({ 'turn-end': [{ matcher: '*' }, { matcher: '*', command: '   ' }, { matcher: '*', command: 'echo ok' }] });
    const r = runHook('turn-end', 'turn', {});
    expect(r.output).toContain('ok');
  });

  test('treats plain-text output as a message, not a failed command', () => {
    // Regression: `JSON.parse('repo: butter')` threw into the command catch, so
    // an ordinary echo hook was reported as a crash. A hook that only wants to
    // annotate is the common case, not an error.
    write({ 'session-start': [{ matcher: '*', command: "echo 'repo: butter'" }] });
    const r = runHook('session-start', 'session', {});
    expect(r.output.trim()).toBe('repo: butter');
    expect(r.output).not.toContain('JSON Parse error');
  });

  test('treats malformed hook JSON as output, not a crash', () => {
    write({ 'turn-end': [{ matcher: '*', command: 'echo not-json' }] });
    const r = runHook('turn-end', 'turn', {});
    expect(r.denied).toBe(false);
    expect(r.output).toContain('not-json');
  });

  test('returns nothing for an event with no rules', () => {
    write({});
    const r = runHook('session-start', 'session', {});
    expect(r.denied).toBe(false);
    expect(r.output).toBe('');
  });

  test('renders an empty state that tells you how to add one', () => {
    const plain = stripAnsi(renderHooks({ rules: {} }, 80).join('\n'));
    expect(plain).toContain('no hooks configured');
    expect(plain).toContain('/hooks add');
  });

  test('lists configured hooks with their event and matcher', () => {
    const cfg: HookConfig = {
      rules: { 'pre-tool': [{ matcher: 'bash', command: 'echo guard' }] },
    };
    const plain = stripAnsi(renderHooks(cfg, 80).join('\n'));
    expect(plain).toContain('pre-tool');
    expect(plain).toContain('bash');
    expect(plain).toContain('guard');
  });
});
