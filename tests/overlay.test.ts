import { describe, expect, test } from 'bun:test';
import { parseKey, isCharKey, Overlay } from '../src/overlay.ts';

describe('parseKey', () => {
  test('maps arrow keys in both CSI and SS3 form', () => {
    expect(parseKey('\x1b[A')).toBe('up');
    expect(parseKey('\x1b[B')).toBe('down');
    expect(parseKey('\x1bOA')).toBe('up');
    expect(parseKey('\x1bOB')).toBe('down');
  });

  test('maps a bare Esc to esc but not an unknown sequence', () => {
    expect(parseKey('\x1b')).toBe('esc');
    // A mouse-report or bracketed-paste opener must not be read as Esc, which
    // is what used to make the menus close themselves on a stray escape.
    expect(parseKey('\x1b[200~')).toBeNull();
  });

  test('maps control and navigation keys', () => {
    expect(parseKey('\r')).toBe('enter');
    expect(parseKey('\n')).toBe('enter');
    expect(parseKey('\t')).toBe('tab');
    expect(parseKey('\x1b[Z')).toBe('shift+tab');
    expect(parseKey(' ')).toBe('space');
    expect(parseKey('\x7f')).toBe('backspace');
    expect(parseKey('\x1b[5~')).toBe('pageup');
    expect(parseKey('\x1b[6~')).toBe('pagedown');
  });

  test('returns printable characters', () => {
    expect(parseKey('a')).toEqual({ char: 'a' });
    expect(parseKey('/')).toEqual({ char: '/' });
    expect(parseKey('3')).toEqual({ char: '3' });
  });

  test('returns a pasted chunk as chars rather than dropping it', () => {
    const key = parseKey('hello');
    expect(key).toEqual({ char: 'hello' });
    expect(isCharKey(key)).toBe(true);
  });

  test('returns null for an empty chunk so the caller waits', () => {
    expect(parseKey('')).toBeNull();
  });
});

describe('isCharKey', () => {
  test('is false for named keys, true for chars', () => {
    expect(isCharKey('up')).toBe(false);
    expect(isCharKey({ char: 'x' })).toBe(true);
  });
});

// The erase-drift bug: the old overlay counted *logical* lines while the
// terminal wrapped them. These assert the invariant that makes it impossible.
describe('Overlay', () => {
  function fakeStdout() {
    const chunks: string[] = [];
    return {
      chunks,
      write(s: string) { chunks.push(s); return true; },
      joined: () => chunks.join(''),
    };
  }

  test('erases exactly the number of lines it painted', () => {
    const out = fakeStdout();
    const o = new Overlay(out as never);
    o.paint(['a', 'b', 'c']);
    o.erase();
    expect(out.joined()).toContain('\x1b[3A'); // moved up 3 rows
    expect(out.joined()).toContain('\x1b[?25h');
  });
  test('is idempotent: erasing twice does not double-erase', () => {
    const out = fakeStdout();
    const o = new Overlay(out as never);
    o.paint(['a', 'b']);
    o.erase();
    const afterFirst = out.joined();
    o.erase();
    // The first erase clears the block; the second only re-shows the cursor,
    // so no additional cursor-up movement may be emitted.
    const second = out.joined().slice(afterFirst.length);
    expect(second).toBe('\x1b[?25h');
  });

  test('repaint replaces rather than appends', () => {
    const out = fakeStdout();
    const o = new Overlay(out as never);
    o.paint(['first']);
    const before = out.chunks.length;
    o.paint(['second']);
    // A repaint always erases the previous frame first.
    expect(out.chunks.slice(before).join('')).toContain('\x1b[1A');
    expect(out.joined()).toContain('second');
  });

  test('painting nothing clears without drawing', () => {
    const out = fakeStdout();
    const o = new Overlay(out as never);
    o.paint(['x']);
    const before = out.chunks.length;
    o.paint([]);
    expect(out.chunks.slice(before).join('')).not.toContain('x');
    expect(o.isPainted).toBe(false);
  });

  test('erase output is exactly proportional to the painted line count', () => {
    const out = fakeStdout();
    const o = new Overlay(out as never);
    o.paint(Array.from({ length: 7 }, (_, i) => `row ${i}`));
    o.erase();
    const written = out.joined();
    expect(written).toContain('\x1b[7A');
    // one clear-line + one row-down per painted row
    expect(written.match(/\x1b\[2K/g)?.length).toBe(7);
  });
});
