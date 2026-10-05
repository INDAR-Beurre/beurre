import { describe, expect, it } from 'bun:test';
import {
  BeurreEditor,
  getBuffer2DCoords,
  getCursorFrom2DCoords,
  findWordBoundaryLeft,
  findWordBoundaryRight,
  createInitialEditorState,
  handleKeyStroke,
} from '../src/editor.ts';
import { getPredictiveMatches } from '../src/predictive.ts';

describe('BeurreEditor Engine', () => {
  it('should initialize with initial history', () => {
    const editor = new BeurreEditor(['/help', '/models']);
    const history = editor.getHistory();
    expect(history).toEqual(['/help', '/models']);
  });

  it('should append new commands and avoid duplicate consecutive entries', () => {
    const editor = new BeurreEditor();
    editor.addHistory('/subagents');
    editor.addHistory('/subagents');
    editor.addHistory('/loop test');

    const history = editor.getHistory();
    expect(history.length).toBe(2);
    expect(history[0]).toBe('/subagents');
    expect(history[1]).toBe('/loop test');
  });

  it('should match predictive slash commands as user types', () => {
    const matchesM = getPredictiveMatches('/m');
    expect(matchesM.some((m) => m.command === '/menu')).toBe(true);
    expect(matchesM.some((m) => m.command === '/models')).toBe(true);

    const matchesS = getPredictiveMatches('/sub');
    expect(matchesS.some((m) => m.command === '/subagents')).toBe(true);
    expect(matchesS.some((m) => m.command === '/subagent')).toBe(true);
  });

  it('should calculate 2D line and column coordinates for multi-line buffers accurately', () => {
    const buffer = 'line one\nsecond line\nthird';
    // cursor at 0 -> line 0, col 0
    expect(getBuffer2DCoords(buffer, 0)).toEqual({
      lineIdx: 0,
      colIdx: 0,
      lines: ['line one', 'second line', 'third'],
    });

    // cursor at 9 (start of line 1)
    expect(getBuffer2DCoords(buffer, 9)).toEqual({
      lineIdx: 1,
      colIdx: 0,
      lines: ['line one', 'second line', 'third'],
    });

    // cursor at 15 ('second ' -> col 6 on line 1)
    expect(getBuffer2DCoords(buffer, 15).lineIdx).toBe(1);
    expect(getBuffer2DCoords(buffer, 15).colIdx).toBe(6);

    // roundtrip back to 1D index
    const lines = buffer.split('\n');
    expect(getCursorFrom2DCoords(lines, 1, 6)).toBe(15);
    expect(getCursorFrom2DCoords(lines, 2, 2)).toBe(23);
  });

  it('should navigate up and down within a multi-line buffer before hitting history', () => {
    const buffer = 'first line\nsecond line\nthird line';
    const state = createInitialEditorState(buffer, 2);
    // Cursor initially at end of buffer (line 2, col 10)
    expect(state.cursor).toBe(buffer.length);

    // Press Up arrow -> should move to line 1
    const up1 = handleKeyStroke(state, '\x1b[A', ['history 1', 'history 2']);
    const coords1 = getBuffer2DCoords(up1.state.buffer, up1.state.cursor);
    expect(coords1.lineIdx).toBe(1);

    // Press Up arrow again -> should move to line 0
    const up2 = handleKeyStroke(up1.state, '\x1b[A', ['history 1', 'history 2']);
    const coords2 = getBuffer2DCoords(up2.state.buffer, up2.state.cursor);
    expect(coords2.lineIdx).toBe(0);

    // Press Up arrow on line 0 -> should load history entry
    const up3 = handleKeyStroke(up2.state, '\x1b[A', ['history 1', 'history 2']);
    expect(up3.state.buffer).toBe('history 2');

    // Press Down arrow -> should restore saved multi-line draft
    const down1 = handleKeyStroke(up3.state, '\x1b[B', ['history 1', 'history 2']);
    expect(down1.state.buffer).toBe(buffer);
  });

  it('should insert newlines via Alt+Enter, Shift+Enter, and Ctrl+J', () => {
    let state = createInitialEditorState('hello', 0);
    // Alt+Enter
    const res1 = handleKeyStroke(state, '\x1b\r');
    expect(res1.state.buffer).toBe('hello\n');

    // Type 'world'
    const res2 = handleKeyStroke(res1.state, 'world');
    expect(res2.state.buffer).toBe('hello\nworld');

    // Shift+Enter
    const res3 = handleKeyStroke(res2.state, '\x1b[13;2u');
    expect(res3.state.buffer).toBe('hello\nworld\n');

    // Ctrl+J
    const res4 = handleKeyStroke(res3.state, '\x0a');
    expect(res4.state.buffer).toBe('hello\nworld\n\n');
  });

  it('should support word navigation and word deletion', () => {
    const text = 'const greeting = "hello butter"';
    expect(findWordBoundaryLeft(text, 14)).toBe(6); // 'greeting' -> 6
    expect(findWordBoundaryRight(text, 6)).toBe(15); // 'greeting ' -> 15

    let state = createInitialEditorState(text, 0);
    // Delete previous word (Alt+Backspace / Ctrl+W)
    const delWord = handleKeyStroke(state, '\x17');
    expect(delWord.state.buffer).toBe('const greeting = "hello ');
  });

  it('should handle bracketed paste mode without premature submission', () => {
    const state = createInitialEditorState('', 0);
    const pasteChunk = '\x1b[200~function test() {\n  return 42;\n}\x1b[201~';
    const res = handleKeyStroke(state, pasteChunk);

    expect(res.action).toBe('none');
    expect(res.state.buffer).toBe('function test() {\n  return 42;\n}');
    expect(res.state.inPasteMode).toBe(false);
  });

  it('should complete autocomplete matches on Tab or Enter', () => {
    const state = createInitialEditorState('/mod', 0);
    expect(state.autocompleteMatches.length).toBeGreaterThan(0);
    const selectedCmd = state.autocompleteMatches[0].command;

    const completed = handleKeyStroke(state, '\t');
    expect(completed.state.buffer.startsWith(selectedCmd)).toBe(true);
    expect(completed.action).toBe('none');
  });

  it('should submit a command with its arguments intact, never completing it away', () => {
    // Regression: accepting the single autocomplete match on Enter replaced
    // the buffer with the bare command, so `/outline src/features.ts` was
    // dispatched as `/outline` and the argument vanished.
    const state = createInitialEditorState('/outline src/features.ts', 25);
    expect(state.autocompleteMatches.length).toBe(1);
    const res = handleKeyStroke(state, '\r');
    expect(res.action).toBe('submit');
    expect(res.submittedValue).toBe('/outline src/features.ts');
  });

  it('should submit a command whose arguments contain spaces', () => {
    const state = createInitialEditorState('/grep foo bar', 14);
    const res = handleKeyStroke(state, '\r');
    expect(res.action).toBe('submit');
    expect(res.submittedValue).toBe('/grep foo bar');
  });

  it('should submit an exactly typed command without appending a space', () => {
    const state = createInitialEditorState('/outline', 8);
    const res = handleKeyStroke(state, '\r');
    expect(res.action).toBe('submit');
    expect(res.submittedValue).toBe('/outline');
  });

  it('should submit what was typed when several commands match', () => {
    // `/t` matches /test, /think, /thinking, /todo. Guessing one of them and
    // running it instead is worse than submitting the literal text.
    const state = createInitialEditorState('/t', 2);
    expect(state.autocompleteMatches.length).toBeGreaterThan(1);
    const res = handleKeyStroke(state, '\r');
    expect(res.action).toBe('submit');
    expect(res.submittedValue).toBe('/t');
  });

  it('should accept ghost suggestion on Right Arrow at end of command', () => {
    const state = createInitialEditorState('/mod', 0);
    const rightKey = handleKeyStroke(state, '\x1b[C');
    expect(rightKey.state.buffer.startsWith('/mod')).toBe(true);
  });

  it('should trigger effort_cycle on Shift+Tab keys', () => {
    const state = createInitialEditorState('', 0);
    const backtab = handleKeyStroke(state, '\x1b[Z');
    expect(backtab.action).toBe('effort_cycle');

    const kittyBacktab = handleKeyStroke(state, '\x1b[9;2u');
    expect(kittyBacktab.action).toBe('effort_cycle');

    const xtermBacktab = handleKeyStroke(state, '\x1b[27;2;9~');
    expect(xtermBacktab.action).toBe('effort_cycle');
  });

  it('should navigate autocomplete items with Up/Down arrows and complete with Space or Tab', () => {
    let state = createInitialEditorState('/m', 0);
    expect(state.autocompleteMatches.length).toBeGreaterThan(1);
    expect(state.selectedAutocompleteIdx).toBe(0);

    // Down arrow moves selection
    const downRes = handleKeyStroke(state, '\x1b[B');
    expect(downRes.state.selectedAutocompleteIdx).toBe(1);

    const secondMatch = state.autocompleteMatches[1];

    // Space key auto-completes the selected match
    const spaceRes = handleKeyStroke(downRes.state, ' ');
    expect(spaceRes.state.buffer).toBe(secondMatch.command + ' ');
  });
});
