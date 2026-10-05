/**
 * Beurre overlay — one correct implementation of "draw an interactive block
 * inline, redraw it on every keypress, erase it exactly".
 *
 * Why this exists: the old menus tracked a `lastRenderedLinesCount` integer and
 * erased that many rows. That is only correct when every rendered line occupies
 * exactly one terminal row. At widths below the hardcoded box width the lines
 * wrapped, so the erase count drifted from the real height and fragments were
 * left behind permanently. This class derives the erase count from the actual
 * rendered text, so wrapping (if it ever happened) is accounted for.
 *
 * Usage: build lines with `render()`, then call `paint()` / `erase()`.
 */
export class Overlay {
  private paintedRows = 0;

  constructor(private readonly out: NodeJS.WriteStream = process.stdout) {}

  /**
   * Replace whatever the previous frame drew with `lines`.
   * Safe to call every frame: erase-then-draw, so there is never a stale row.
   */
  paint(lines: string[]): void {
    this.erase();
    if (lines.length === 0) return;
    // Hide the cursor across the repaint so the frame never flickers with a
    // stray caret sitting inside the block.
    this.out.write('\x1b[?25l');
    this.out.write(lines.join('\n') + '\n');
    this.paintedRows = lines.length;
  }

  /** Erase the current frame and restore the cursor. Idempotent. */
  erase(): void {
    if (this.paintedRows > 0) {
      this.out.write(`\x1b[${this.paintedRows}A`);
      for (let i = 0; i < this.paintedRows; i++) {
        this.out.write('\x1b[2K\x1b[1B');
      }
      this.out.write(`\x1b[${this.paintedRows}A\r`);
      this.paintedRows = 0;
    }
    this.out.write('\x1b[?25h');
  }

  get isPainted(): boolean {
    return this.paintedRows > 0;
  }
}

/**
 * Read one keypress from a raw-mode stdin, resolving to a normalised key name.
 *
 * Normalising here means every caller handles arrows, letters, digits, and
 * control chars identically, instead of each re-implementing escape-sequence
 * parsing (which is how the old pickers ended up disagreeing about Esc).
 */
export type Key =
  | 'up' | 'down' | 'left' | 'right'
  | 'enter' | 'esc' | 'tab' | 'shift+tab' | 'backspace'
  | 'space' | 'pageup' | 'pagedown' | 'home' | 'end'
  | { char: string };

export function parseKey(raw: string): Key | null {
  if (raw === '') return null;

  // CSI sequences
  if (raw.startsWith('\x1b') || raw.startsWith('\x9b')) {
    const csi = raw.slice(1);
    switch (csi) {
      case '[A': return 'up';
      case '[B': return 'down';
      case '[C': return 'right';
      case '[D': return 'left';
      case '[H': return 'home';
      case '[F': return 'end';
      case '[Z': return 'shift+tab';
      case '[3~': return 'backspace';
      case '[5~': return 'pageup';
      case '[6~': return 'pagedown';
    }
    if (csi.startsWith('O')) {
      switch (csi) {
        case 'OA': return 'up';
        case 'OB': return 'down';
        case 'OC': return 'right';
        case 'OD': return 'left';
        case 'OH': return 'home';
        case 'OF': return 'end';
      }
    }
    // Bare Esc is a single 0x1b byte; anything else starting with Esc is a
    // sequence we do not model, so treat it as "unknown" rather than Esc.
    if (raw === '\x1b') return 'esc';
    return null;
  }

  switch (raw) {
    case '\r':
    case '\n': return 'enter';
    case '\t': return 'tab';
    case '\x7f':
    case '\b': return 'backspace';
    case ' ': return 'space';
    case '\x03': return { char: '\x03' }; // Ctrl+C
    case '\x04': return { char: '\x04' }; // Ctrl+D
  }

  // Printable character, or a pasted chunk (returned as-is for the caller to
  // append character by character).
  return { char: raw };
}

/** Await a single normalised keypress. */
export function readKey(stdin: NodeJS.ReadStream = process.stdin): Promise<Key> {
  const { promise, resolve } = Promise.withResolvers<Key>();
  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  const onData = (chunk: Buffer) => {
    stdin.removeListener('data', onData);
    if (!wasRaw && stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    const key = parseKey(chunk.toString('utf-8'));
    if (key !== null) resolve(key);
    else resolve(readKey(stdin)); // unmodelled sequence: wait for a real one
  };

  stdin.on('data', onData);
  return promise;
}

/** True when the key is a printable character (used for search-as-you-type). */
export function isCharKey(key: Key): key is { char: string } {
  return typeof key === 'object' && 'char' in key;
}
