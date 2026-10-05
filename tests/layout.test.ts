import { describe, expect, test } from 'bun:test';
import {
  stringWidth, truncate, padTo, fit, columns, box, rule, listWindow, charWidth,
} from '../src/layout.ts';

// The invariant the whole UI rests on: a rendered line is never wider than the
// terminal, so "move up N rows and erase" can never drift from the line count.
describe('stringWidth', () => {
  test('ignores ANSI escapes', () => {
    expect(stringWidth('\x1b[38;2;250;204;21mhello\x1b[0m')).toBe(5);
    expect(stringWidth('\x1b[1m\x1b[38;2;255;255;255mabc\x1b[0m')).toBe(3);
  });

  test('counts wide CJK as two columns', () => {
    expect(stringWidth('日本')).toBe(4);
    expect(stringWidth('a日b')).toBe(4);
  });

  test('ignores combining marks', () => {
    expect(charWidth(0x0301)).toBe(0);
  });

  test('is zero for control characters', () => {
    expect(stringWidth('a\tb')).toBe(2);
  });

  test('handles an empty string', () => {
    expect(stringWidth('')).toBe(0);
  });
});

describe('truncate', () => {
  test('leaves short strings untouched', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  test('never exceeds the budget', () => {
    expect(stringWidth(truncate('hello world', 8))).toBeLessThanOrEqual(8);
  });

  test('closes colour so truncation cannot bleed', () => {
    const out = truncate('\x1b[38;2;250;204;21mhello world\x1b[0m', 6);
    expect(stringWidth(out)).toBeLessThanOrEqual(6);
    expect(out).toContain('\x1b[0m');
  });

  test('counts wide chars correctly when cutting', () => {
    const out = truncate('日本語日本語', 5);
    expect(stringWidth(out)).toBeLessThanOrEqual(5);
  });

  test('returns empty for a zero or negative budget', () => {
    expect(truncate('hello', 0)).toBe('');
    expect(truncate('hello', -3)).toBe('');
  });
});

describe('padTo / fit', () => {
  test('pads to exactly the requested width', () => {
    expect(stringWidth(padTo('ab', 6))).toBe(6);
    expect(stringWidth(fit('abcdefghij', 6))).toBe(6);
  });

  test('padTo never truncates', () => {
    expect(padTo('abcdef', 3)).toBe('abcdef');
  });

  test('fit with coloured text reaches exact width', () => {
    expect(stringWidth(fit('\x1b[31mab\x1b[0m', 8))).toBe(8);
  });
});

describe('columns', () => {
  test('aligns right-hand value at the edge', () => {
    const out = columns('left', 'right', 20);
    expect(stringWidth(out)).toBe(20);
    expect(out.endsWith('right')).toBe(true);
  });

  test('shrinks instead of overflowing when too tight', () => {
    const out = columns('a'.repeat(60), 'b'.repeat(30), 30);
    expect(stringWidth(out)).toBeLessThanOrEqual(30);
  });

  test('respects width with ANSI on both sides', () => {
    const out = columns('\x1b[33mleft\x1b[0m', '\x1b[32mright\x1b[0m', 24);
    expect(stringWidth(out)).toBeLessThanOrEqual(24);
  });
});

describe('box', () => {
  test('every line fits the requested width', () => {
    for (const w of [40, 60, 80, 100, 120]) {
      for (const line of box({ title: 'T', lines: ['short', 'a'.repeat(200), ''], width: w })) {
        expect(stringWidth(line)).toBeLessThanOrEqual(w);
      }
    }
  });

  test('all rows share one width when bordered', () => {
    const lines = box({ title: 'Title', lines: ['a', 'bb', 'ccc'], width: 50 });
    const widths = new Set(lines.map(stringWidth));
    expect(widths.size).toBe(1);
  });

  test('degrades to plain indented lines when too narrow to border', () => {
    const lines = box({ title: 'T', lines: ['a'.repeat(100)], width: 24 });
    for (const l of lines) expect(stringWidth(l)).toBeLessThanOrEqual(24);
  });

  test('emits no border glyphs when border is none', () => {
    const lines = box({ lines: ['hello'], border: 'none', width: 60 });
    expect(lines.join('')).not.toContain('│');
  });

  test('survives a very long title', () => {
    for (const l of box({ title: 'x'.repeat(300), lines: ['a'], width: 50 })) {
      expect(stringWidth(l)).toBeLessThanOrEqual(50);
    }
  });
});

describe('rule', () => {
  test('is exactly the requested width', () => {
    expect(stringWidth(rule(37))).toBe(37);
  });
});

describe('listWindow', () => {
  test('keeps the selection visible', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    for (const sel of [0, 5, 12, 50, 99]) {
      const w = listWindow(items, 12, sel);
      expect(w.selected).toBeGreaterThanOrEqual(0);
      expect(w.start + w.selected).toBe(sel);
      expect(w.items.length).toBeLessThanOrEqual(12);
    }
  });

  test('reports the true visible range for scroll copy', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const w = listWindow(items, 10, 25);
    expect(w.start).toBe(16);
    expect(w.end).toBe(26);
  });

  test('handles a list shorter than the window', () => {
    const w = listWindow([1, 2], 10, 1);
    expect(w.items).toEqual([1, 2]);
    expect(w.selected).toBe(1);
  });

  test('handles an empty list', () => {
    const w = listWindow([], 10, 0);
    expect(w.items).toEqual([]);
    expect(w.selected).toBe(-1);
  });

  test('clamps an out-of-range selection', () => {
    const items = [1, 2, 3];
    expect(listWindow(items, 2, 99).start + listWindow(items, 2, 99).selected).toBe(2);
  });
});
