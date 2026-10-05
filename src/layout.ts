/**
 * Beurre layout primitives — the single source of truth for terminal geometry.
 *
 * Every interactive surface must render lines no wider than the terminal.
 * Two invariants make all cursor arithmetic safe:
 *   1. every rendered line satisfies stringWidth(line) <= termWidth()
 *   2. stringWidth() is ANSI-aware, so escape codes never count as width
 *
 * Given both, one logical line is always one visual line, so a "move up N
 * rows and erase" pass can never drift from the rendered line count. The old
 * menus violated (1), which is why narrow terminals permanently corrupted the
 * scrollback.
 */

// ---------------------------------------------------------------- ANSI ----

// One definition shared by stripAnsi / stringWidth / truncate instead of three
// drifting copies. Deliberately NOT sticky: with /y, `replace` anchors every
// attempt to lastIndex, so escapes separated by plain text ("const\e[39m x")
// were only stripped while they happened to run together from index 0.
const ANSI_SEQ = /[\x1b\x9b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_SEQ, '');
}

// ------------------------------------------------------------- width ----

function isCombining(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    cp === 0x200d // zero-width joiner
  );
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1fa70 && cp <= 0x1faff)
  );
}

export function charWidth(cp: number): number {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0; // control
  if (isCombining(cp)) return 0;
  return isWide(cp) ? 2 : 1;
}

/** Display width of a string, ignoring ANSI escapes and counting wide chars as 2. */
export function stringWidth(s: string): number {
  let w = 0;
  let i = 0;
  const n = s.length;
  while (i < n) {
    // pass ANSI escapes through at zero cost
    if (s.charCodeAt(i) === 0x1b || s.charCodeAt(i) === 0x9b) {
      ANSI_SEQ.lastIndex = i;
      const m = ANSI_SEQ.exec(s);
      if (m) {
        i = ANSI_SEQ.lastIndex;
        continue;
      }
    }
    const cp = s.codePointAt(i)!;
    w += charWidth(cp);
    i += cp > 0xffff ? 2 : 1;
  }
  return w;
}


// --------------------------------------------------------------- term ----

export function termWidth(): number {
  const c = process.stdout.columns;
  return typeof c === 'number' && c > 0 ? c : 80;
}

export function termHeight(): number {
  const r = process.stdout.rows;
  return typeof r === 'number' && r > 0 ? r : 24;
}

export function isTTY(): boolean {
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
}

/**
 * Colour is opt-out (NO_COLOR) and off for dumb terminals and pipes.
 * theme.ts builds its tokens through this, so honouring it is one place.
 */
export function colorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') return true;
  const term = process.env.TERM;
  if (term === 'dumb') return false;
  return isTTY();
}

// ------------------------------------------------------------ fitting ----

/**
 * Truncate to `max` display columns, preserving ANSI codes, closing any open
 * colour with a reset so a truncated string cannot bleed into the next line.
 */
export function truncate(s: string, max: number, ellipsis = '…'): string {
  if (max <= 0) return '';
  if (stringWidth(s) <= max) return s;

  const ell = stringWidth(ellipsis);
  const budget = Math.max(0, max - ell);
  let out = '';
  let w = 0;
  let sawAnsi = false;
  let i = 0;
  const n = s.length;

  while (i < n) {
    if (s.charCodeAt(i) === 0x1b || s.charCodeAt(i) === 0x9b) {
      ANSI_SEQ.lastIndex = i;
      const m = ANSI_SEQ.exec(s);
      if (m) {
        out += m[0];
        sawAnsi = true;
        i = ANSI_SEQ.lastIndex;
        continue;
      }
    }
    const cp = s.codePointAt(i)!;
    const cw = charWidth(cp);
    if (w + cw > budget) break;
    out += String.fromCodePoint(cp);
    w += cw;
    i += cp > 0xffff ? 2 : 1;
  }
  return out + (sawAnsi ? '\x1b[0m' : '') + ellipsis;
}

/** Pad to `width` display columns (never truncates). */
export function padTo(s: string, width: number): string {
  const w = stringWidth(s);
  return w >= width ? s : s + ' '.repeat(width - w);
}

/** Truncate to `width` then pad to exactly `width`. */
export function fit(s: string, width: number): string {
  return padTo(truncate(s, width), width);
}

/** Left-aligned label / right-aligned value row that fills exactly `width`. */
export function columns(left: string, right: string, width: number, gap = 2): string {
  const lw = stringWidth(left);
  const rw = stringWidth(right);
  const room = width - gap;
  if (lw + rw <= room) {
    return left + ' '.repeat(room - lw - rw + gap) + right;
  }
  // Too tight for both sides verbatim: keep the right value readable and let
  // the left label absorb the shrink, but never exceed `width`.
  const rwRoom = Math.min(rw, Math.max(4, Math.floor(room * 0.4)));
  const lwRoom = Math.max(0, room - rwRoom);
  const l = truncate(left, lwRoom);
  return padTo(l, lwRoom) + ' '.repeat(gap) + truncate(right, rwRoom);
}

// ---------------------------------------------------------------- box ----

export interface BoxOptions {
  title?: string;
  lines?: string[];
  width?: number;
  footer?: string;
  /** Border glyphs; defaults to a single-weight rounded box. */
  border?: 'rounded' | 'square' | 'none';
}

/**
 * Width-safe box. Every returned line is guaranteed <= width, so callers can
 * erase by line count without drift. With `border: 'none'` it degrades to
 * indented plain lines, which is what narrow terminals want.
 */
export function box(opts: BoxOptions): string[] {
  const width = Math.max(20, opts.width ?? termWidth());
  const style = opts.border ?? 'rounded';

  if (style === 'none' || width < 34) {
    const out: string[] = [];
    if (opts.title) out.push(truncate(opts.title, width));
    for (const l of opts.lines ?? []) out.push(truncate(`  ${l}`, width));
    if (opts.footer) out.push(truncate(opts.footer, width));
    return out;
  }

  const g = style === 'rounded'
    ? { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }
    : { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };

  const inner = width - 4; // border char + space, both sides

  // Composes to exactly `width` so every row of the box shares one width.
  const rule = (left: string, right: string) => {
    if (!opts.title) return left + g.h.repeat(width - 2) + right;
    const title = truncate(opts.title, Math.max(0, width - 8));
    const dashes = width - 3 - stringWidth(title) - 2;
    if (dashes < 0) return left + g.h.repeat(Math.max(0, width - 2)) + right;
    return `${left}${g.h} ${title} ${g.h.repeat(dashes)}${right}`;
  };

  const out: string[] = [rule(g.tl, g.tr, g.h)];
  for (const l of opts.lines ?? []) out.push(`${g.v} ${fit(l, inner)} ${g.v}`);
  if (opts.footer) {
    out.push(`${g.v} ${fit(opts.footer, inner)} ${g.v}`);
  }
  out.push(rule(g.bl, g.br, g.h));
  return out;
}

/** A single horizontal rule, guaranteed <= width. */
export function rule(width = termWidth(), char = '─'): string {
  return char.repeat(Math.max(0, width));
}

// --------------------------------------------------------- list window ----

export interface Window<T> {
  items: T[];
  start: number;
  end: number;
  /** Index of the selected element within `items`, or -1 when empty. */
  selected: number;
}

/**
 * A scrolling window over `items` that keeps `selected` visible and reports the
 * true index range, so callers can render "showing 12-30 of 96" correctly.
 * A selected index outside the current range means the list scrolled.
 */
export function listWindow<T>(items: T[], visible: number, selected: number): Window<T> {
  if (items.length === 0 || visible <= 0) {
    return { items, start: 0, end: 0, selected: items.length ? 0 : -1 };
  }
  const sel = Math.max(0, Math.min(items.length - 1, selected));
  const size = Math.min(visible, items.length);
  let start = 0;
  if (sel >= size) start = Math.min(items.length - size, sel - size + 1);
  if (sel < start) start = sel;
  const end = start + size;
  return { items: items.slice(start, end), start, end, selected: sel - start };
}
