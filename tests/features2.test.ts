import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripAnsi, stringWidth } from '../src/layout.ts';
import {
  addTodo,
  analysePrompt,
  clearDoneTodos,
  diagnoseRelay,
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