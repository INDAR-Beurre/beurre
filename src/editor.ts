import readline from 'node:readline';
import { colors, b, getGitStatus } from './theme.ts';
import { SLASH_COMMANDS, getPredictiveMatches, type SlashCommandInfo } from './predictive.ts';

export interface EditorPromptOptions {
  promptText?: string;
  model?: string;
  cwd?: string;
  turns?: number;
  tokens?: number;
  history?: string[];
  initialValue?: string;
  onAbort?: () => void;
  signal?: AbortSignal;
}

export interface EditorCoords {
  lineIdx: number;
  colIdx: number;
  lines: string[];
}

export function getBuffer2DCoords(buffer: string, cursor: number): EditorCoords {
  const lines = buffer.split('\n');
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length;
    if (cursor <= charCount + lineLen) {
      return {
        lineIdx: i,
        colIdx: cursor - charCount,
        lines,
      };
    }
    charCount += lineLen + 1; // +1 for the '\n'
  }
  return {
    lineIdx: Math.max(0, lines.length - 1),
    colIdx: lines[lines.length - 1]?.length ?? 0,
    lines,
  };
}

export function getCursorFrom2DCoords(lines: string[], lineIdx: number, colIdx: number): number {
  const targetLine = Math.max(0, Math.min(lineIdx, lines.length - 1));
  let cursor = 0;
  for (let i = 0; i < targetLine; i++) {
    cursor += lines[i].length + 1;
  }
  const maxCol = lines[targetLine]?.length ?? 0;
  cursor += Math.max(0, Math.min(colIdx, maxCol));
  return cursor;
}

export function findWordBoundaryLeft(buffer: string, cursor: number): number {
  if (cursor <= 0) return 0;
  let idx = cursor;
  // Skip trailing spaces
  while (idx > 0 && /\s/.test(buffer[idx - 1])) {
    idx--;
  }
  // Move to start of word
  while (idx > 0 && !/\s/.test(buffer[idx - 1])) {
    idx--;
  }
  return idx;
}

export function findWordBoundaryRight(buffer: string, cursor: number): number {
  if (cursor >= buffer.length) return buffer.length;
  let idx = cursor;
  // Skip leading non-spaces
  while (idx < buffer.length && !/\s/.test(buffer[idx])) {
    idx++;
  }
  // Skip spaces
  while (idx < buffer.length && /\s/.test(buffer[idx])) {
    idx++;
  }
  return idx;
}

export interface EditorState {
  buffer: string;
  cursor: number;
  historyPos: number;
  savedDraft: string;
  autocompleteMatches: SlashCommandInfo[];
  selectedAutocompleteIdx: number;
  inPasteMode: boolean;
  pasteBuffer: string;
}

export function createInitialEditorState(initialValue = '', historyLength = 0): EditorState {
  return {
    buffer: initialValue,
    cursor: initialValue.length,
    historyPos: historyLength,
    savedDraft: initialValue,
    autocompleteMatches: initialValue.startsWith('/') ? getPredictiveMatches(initialValue) : [],
    selectedAutocompleteIdx: 0,
    inPasteMode: false,
    pasteBuffer: '',
  };
}

export interface KeyResult {
  state: EditorState;
  action: 'none' | 'submit' | 'abort' | 'exit';
  submittedValue?: string;
}

export function handleKeyStroke(
  state: EditorState,
  keyStr: string,
  history: string[] = []
): KeyResult {
  const s: EditorState = { ...state };

  // Handle bracketed paste start
  if (keyStr.includes('\x1b[200~')) {
    s.inPasteMode = true;
    s.pasteBuffer = '';
    const parts = keyStr.split('\x1b[200~');
    let remaining = parts.slice(1).join('\x1b[200~');
    if (remaining.includes('\x1b[201~')) {
      const pasteParts = remaining.split('\x1b[201~');
      const pastedContent = pasteParts[0].replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      s.buffer = s.buffer.slice(0, s.cursor) + pastedContent + s.buffer.slice(s.cursor);
      s.cursor += pastedContent.length;
      s.inPasteMode = false;
      s.pasteBuffer = '';
      if (s.buffer.startsWith('/')) {
        s.autocompleteMatches = getPredictiveMatches(s.buffer);
      } else {
        s.autocompleteMatches = [];
      }
      return { state: s, action: 'none' };
    } else {
      s.pasteBuffer = remaining;
      return { state: s, action: 'none' };
    }
  }

  // Handle bracketed paste continuation and end
  if (s.inPasteMode) {
    if (keyStr.includes('\x1b[201~')) {
      const parts = keyStr.split('\x1b[201~');
      s.pasteBuffer += parts[0];
      const pastedContent = s.pasteBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      s.buffer = s.buffer.slice(0, s.cursor) + pastedContent + s.buffer.slice(s.cursor);
      s.cursor += pastedContent.length;
      s.inPasteMode = false;
      s.pasteBuffer = '';
      if (s.buffer.startsWith('/')) {
        s.autocompleteMatches = getPredictiveMatches(s.buffer);
      } else {
        s.autocompleteMatches = [];
      }
      return { state: s, action: 'none' };
    } else {
      s.pasteBuffer += keyStr;
      return { state: s, action: 'none' };
    }
  }

  // Ctrl+C
  if (keyStr === '\x03') {
    if (s.autocompleteMatches.length > 0) {
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }
    if (s.buffer.length > 0) {
      s.buffer = '';
      s.cursor = 0;
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }
    return { state: s, action: 'abort' };
  }

  // Ctrl+D
  if (keyStr === '\x04') {
    if (s.buffer.length === 0) {
      return { state: s, action: 'exit' };
    }
    // Delete char under cursor
    if (s.cursor < s.buffer.length) {
      s.buffer = s.buffer.slice(0, s.cursor) + s.buffer.slice(s.cursor + 1);
      if (s.buffer.startsWith('/')) {
        s.autocompleteMatches = getPredictiveMatches(s.buffer);
      }
    }
    return { state: s, action: 'none' };
  }

  // Alt+Enter (\x1b\r or \x1b\n) or Shift+Enter (\x1b[13;2u, \x1b[27;2;13~) or Ctrl+J (\x0a)
  const isAltEnter = keyStr === '\x1b\r' || keyStr === '\x1b\n' || keyStr === '\x1b[13;2u' || keyStr === '\x1b[27;2;13~' || keyStr === '\x0a';
  if (isAltEnter) {
    s.buffer = s.buffer.slice(0, s.cursor) + '\n' + s.buffer.slice(s.cursor);
    s.cursor++;
    s.autocompleteMatches = [];
    return { state: s, action: 'none' };
  }

  // Standard Enter (\r or \n)
  if (keyStr === '\r' || keyStr === '\n') {
    // If user ended line with backslash '\', turn it into a newline
    if (s.cursor > 0 && s.buffer[s.cursor - 1] === '\\') {
      s.buffer = s.buffer.slice(0, s.cursor - 1) + '\n' + s.buffer.slice(s.cursor);
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }

    // If autocomplete is visible, complete command instead of submitting
    if (s.autocompleteMatches.length > 0 && s.selectedAutocompleteIdx >= 0) {
      const selected = s.autocompleteMatches[s.selectedAutocompleteIdx];
      if (selected) {
        s.buffer = selected.command + (selected.argsHint ? ' ' : '');
        s.cursor = s.buffer.length;
        s.autocompleteMatches = [];
        return { state: s, action: 'none' };
      }
    }

    return { state: s, action: 'submit', submittedValue: s.buffer };
  }

  // Tab
  if (keyStr === '\t') {
    if (s.autocompleteMatches.length > 0) {
      const selected = s.autocompleteMatches[s.selectedAutocompleteIdx];
      if (selected) {
        s.buffer = selected.command + (selected.argsHint ? ' ' : '');
        s.cursor = s.buffer.length;
        s.autocompleteMatches = [];
        return { state: s, action: 'none' };
      }
    } else if (s.buffer.startsWith('/')) {
      s.autocompleteMatches = getPredictiveMatches(s.buffer);
      s.selectedAutocompleteIdx = 0;
      return { state: s, action: 'none' };
    } else {
      // Indent 2 spaces
      s.buffer = s.buffer.slice(0, s.cursor) + '  ' + s.buffer.slice(s.cursor);
      s.cursor += 2;
      return { state: s, action: 'none' };
    }
  }

  // Escape
  if (keyStr === '\x1b') {
    if (s.autocompleteMatches.length > 0) {
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }
    s.buffer = '';
    s.cursor = 0;
    s.autocompleteMatches = [];
    return { state: s, action: 'none' };
  }

  // Up arrow: \x1b[A
  if (keyStr === '\x1b[A') {
    if (s.autocompleteMatches.length > 0) {
      s.selectedAutocompleteIdx =
        s.selectedAutocompleteIdx <= 0
          ? s.autocompleteMatches.length - 1
          : s.selectedAutocompleteIdx - 1;
      return { state: s, action: 'none' };
    }

    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    if (coords.lineIdx > 0) {
      // Move up within multi-line buffer
      s.cursor = getCursorFrom2DCoords(coords.lines, coords.lineIdx - 1, coords.colIdx);
      return { state: s, action: 'none' };
    }

    // History navigation
    if (history.length > 0 && s.historyPos > 0) {
      if (s.historyPos === history.length) {
        s.savedDraft = s.buffer;
      }
      s.historyPos--;
      s.buffer = history[s.historyPos];
      s.cursor = s.buffer.length;
      if (s.buffer.startsWith('/')) {
        s.autocompleteMatches = getPredictiveMatches(s.buffer);
      } else {
        s.autocompleteMatches = [];
      }
    }
    return { state: s, action: 'none' };
  }

  // Down arrow: \x1b[B
  if (keyStr === '\x1b[B') {
    if (s.autocompleteMatches.length > 0) {
      s.selectedAutocompleteIdx =
        (s.selectedAutocompleteIdx + 1) % s.autocompleteMatches.length;
      return { state: s, action: 'none' };
    }

    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    if (coords.lineIdx < coords.lines.length - 1) {
      // Move down within multi-line buffer
      s.cursor = getCursorFrom2DCoords(coords.lines, coords.lineIdx + 1, coords.colIdx);
      return { state: s, action: 'none' };
    }

    // History navigation
    if (s.historyPos < history.length) {
      s.historyPos++;
      if (s.historyPos === history.length) {
        s.buffer = s.savedDraft;
      } else {
        s.buffer = history[s.historyPos];
      }
      s.cursor = s.buffer.length;
      if (s.buffer.startsWith('/')) {
        s.autocompleteMatches = getPredictiveMatches(s.buffer);
      } else {
        s.autocompleteMatches = [];
      }
    }
    return { state: s, action: 'none' };
  }

  // Left arrow: \x1b[D
  if (keyStr === '\x1b[D') {
    if (s.cursor > 0) {
      s.cursor--;
    }
    return { state: s, action: 'none' };
  }

  // Right arrow: \x1b[C
  if (keyStr === '\x1b[C') {
    if (s.cursor < s.buffer.length) {
      s.cursor++;
    } else if (s.autocompleteMatches.length > 0) {
      // Accept ghost completion on right arrow
      const topMatch = s.autocompleteMatches[s.selectedAutocompleteIdx]?.command ?? '';
      if (topMatch.startsWith(s.buffer)) {
        s.buffer = topMatch;
        s.cursor = s.buffer.length;
        s.autocompleteMatches = [];
      }
    }
    return { state: s, action: 'none' };
  }

  // Home: \x1b[H, \x1b[1~, Ctrl+A (\x01)
  if (keyStr === '\x1b[H' || keyStr === '\x1b[1~' || keyStr === '\x01') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    if (coords.colIdx === 0) {
      s.cursor = 0; // jump to start of entire buffer
    } else {
      s.cursor = getCursorFrom2DCoords(coords.lines, coords.lineIdx, 0);
    }
    return { state: s, action: 'none' };
  }

  // End: \x1b[F, \x1b[4~, Ctrl+E (\x05)
  if (keyStr === '\x1b[F' || keyStr === '\x1b[4~' || keyStr === '\x05') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    const lineLen = coords.lines[coords.lineIdx]?.length ?? 0;
    if (coords.colIdx === lineLen) {
      s.cursor = s.buffer.length; // jump to end of entire buffer
    } else {
      s.cursor = getCursorFrom2DCoords(coords.lines, coords.lineIdx, lineLen);
    }
    return { state: s, action: 'none' };
  }

  // Word jumps: Alt+Left (\x1b[1;3D, \x1b[1;5D, \x1bb, \x1bB)
  if (keyStr === '\x1b[1;3D' || keyStr === '\x1b[1;5D' || keyStr === '\x1bb' || keyStr === '\x1bB') {
    s.cursor = findWordBoundaryLeft(s.buffer, s.cursor);
    return { state: s, action: 'none' };
  }

  // Word jumps: Alt+Right (\x1b[1;3C, \x1b[1;5C, \x1bf, \x1bF)
  if (keyStr === '\x1b[1;3C' || keyStr === '\x1b[1;5C' || keyStr === '\x1bf' || keyStr === '\x1bF') {
    s.cursor = findWordBoundaryRight(s.buffer, s.cursor);
    return { state: s, action: 'none' };
  }

  // Word deletion: Alt+Backspace / Ctrl+W (\x17, \x1b\x7f, \x1b\x08)
  if (keyStr === '\x17' || keyStr === '\x1b\x7f' || keyStr === '\x1b\x08') {
    const targetIdx = findWordBoundaryLeft(s.buffer, s.cursor);
    s.buffer = s.buffer.slice(0, targetIdx) + s.buffer.slice(s.cursor);
    s.cursor = targetIdx;
    if (s.buffer.startsWith('/')) {
      s.autocompleteMatches = getPredictiveMatches(s.buffer);
    } else {
      s.autocompleteMatches = [];
    }
    return { state: s, action: 'none' };
  }

  // Ctrl+U (kill to beginning of line)
  if (keyStr === '\x15') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    const lineStart = getCursorFrom2DCoords(coords.lines, coords.lineIdx, 0);
    s.buffer = s.buffer.slice(0, lineStart) + s.buffer.slice(s.cursor);
    s.cursor = lineStart;
    if (s.buffer.startsWith('/')) {
      s.autocompleteMatches = getPredictiveMatches(s.buffer);
    } else {
      s.autocompleteMatches = [];
    }
    return { state: s, action: 'none' };
  }

  // Ctrl+K (kill to end of line)
  if (keyStr === '\x0b') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    const lineLen = coords.lines[coords.lineIdx]?.length ?? 0;
    const lineEnd = getCursorFrom2DCoords(coords.lines, coords.lineIdx, lineLen);
    s.buffer = s.buffer.slice(0, s.cursor) + s.buffer.slice(lineEnd);
    if (s.buffer.startsWith('/')) {
      s.autocompleteMatches = getPredictiveMatches(s.buffer);
    } else {
      s.autocompleteMatches = [];
    }
    return { state: s, action: 'none' };
  }

  // Backspace: \x7f or \x08
  if (keyStr === '\x7f' || keyStr === '\x08') {
    if (s.cursor > 0) {
      s.buffer = s.buffer.slice(0, s.cursor - 1) + s.buffer.slice(s.cursor);
      s.cursor--;
      if (s.buffer.startsWith('/')) {
        s.autocompleteMatches = getPredictiveMatches(s.buffer);
      } else {
        s.autocompleteMatches = [];
      }
    }
    return { state: s, action: 'none' };
  }

  // Delete: \x1b[3~
  if (keyStr === '\x1b[3~') {
    if (s.cursor < s.buffer.length) {
      s.buffer = s.buffer.slice(0, s.cursor) + s.buffer.slice(s.cursor + 1);
      if (s.buffer.startsWith('/')) {
        s.autocompleteMatches = getPredictiveMatches(s.buffer);
      } else {
        s.autocompleteMatches = [];
      }
    }
    return { state: s, action: 'none' };
  }

  // Multi-character raw paste (e.g. pasted snippet with newlines)
  if (!keyStr.startsWith('\x1b') && (keyStr.includes('\n') || keyStr.includes('\r'))) {
    const normalized = keyStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s.buffer = s.buffer.slice(0, s.cursor) + normalized + s.buffer.slice(s.cursor);
    s.cursor += normalized.length;
    if (s.buffer.startsWith('/')) {
      s.autocompleteMatches = getPredictiveMatches(s.buffer);
    } else {
      s.autocompleteMatches = [];
    }
    return { state: s, action: 'none' };
  }

  // Normal typing (printable characters)
  if (!keyStr.startsWith('\x1b') && keyStr.length >= 1) {
    s.buffer = s.buffer.slice(0, s.cursor) + keyStr + s.buffer.slice(s.cursor);
    s.cursor += keyStr.length;
    if (s.buffer.startsWith('/')) {
      s.autocompleteMatches = getPredictiveMatches(s.buffer);
    } else {
      s.autocompleteMatches = [];
    }
    return { state: s, action: 'none' };
  }

  return { state: s, action: 'none' };
}

export class BeurreEditor {
  private history: string[] = [];

  constructor(initialHistory: string[] = []) {
    this.history = [...initialHistory];
  }

  getHistory(): string[] {
    return this.history;
  }

  addHistory(entry: string): void {
    const trimmed = entry.trim();
    if (!trimmed) return;
    if (this.history.length === 0 || this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
    }
  }

  async readPrompt(options: EditorPromptOptions = {}): Promise<string> {
    const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!isTTY) {
      return this.readPromptFallback(options.promptText ?? '🧈 beurre > ');
    }

    return new Promise<string>((resolve) => {
      let state = createInitialEditorState(options.initialValue ?? '', this.history.length);
      let renderedLinesCount = 0;

      const stdin = process.stdin;
      const stdout = process.stdout;

      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();

      // Enable bracketed paste mode
      stdout.write('\x1b[?2004h');

      const cleanup = () => {
        // Disable bracketed paste mode
        stdout.write('\x1b[?2004l');
        stdin.removeListener('data', onData);
        if (!wasRaw) {
          stdin.setRawMode(false);
        }
      };

      const render = () => {
        const cols = Math.min(stdout.columns || 80, 80);

        // Clear previous render
        if (renderedLinesCount > 0) {
          for (let i = 0; i < renderedLinesCount; i++) {
            stdout.write('\x1b[2K\r');
            if (i < renderedLinesCount - 1) {
              stdout.write('\x1b[1A');
            }
          }
        }

        const lines = state.buffer.split('\n');
        const coords = getBuffer2DCoords(state.buffer, state.cursor);

        // Calculate ghost completion text on line 0 if command matching
        let ghostText = '';
        if (state.buffer.startsWith('/') && state.autocompleteMatches.length > 0 && coords.lineIdx === 0) {
          const topMatch = state.autocompleteMatches[state.selectedAutocompleteIdx]?.command ?? '';
          if (topMatch.startsWith(lines[0]) && topMatch.length > lines[0].length) {
            ghostText = topMatch.slice(lines[0].length);
          }
        }

        // Build box header with model and git status
        const modelBadge = options.model ? ` [${options.model}]` : '';
        const git = getGitStatus(options.cwd ?? process.cwd());
        const gitTag = git.branch ? ` (${git.branch}${git.isDirty ? '*' : ''})` : '';
        const headerTitle = ` 🧈 beurre${modelBadge}${gitTag} `;
        const topBorderFill = Math.max(0, cols - headerTitle.length - 3);

        const drawnLines: string[] = [];
        drawnLines.push(
          `${colors.butterMelt}╭──${colors.bold}${colors.butterGold}${headerTitle}${colors.reset}${colors.butterMelt}${'─'.repeat(topBorderFill)}╮${colors.reset}`
        );

        // Render buffer lines
        lines.forEach((l, idx) => {
          const prefix = idx === 0 ? `${colors.butterGold}>${colors.reset} ` : `${colors.dim}…${colors.reset} `;
          const ghost = idx === 0 ? `${colors.dim}${ghostText}${colors.reset}` : '';
          const lineContent = `${prefix}${l}${ghost}`;

          // Visual width padding
          const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
          const visualLen = stripAnsi(lineContent).length;
          const pad = Math.max(0, cols - visualLen - 3);

          drawnLines.push(
            `${colors.butterMelt}│${colors.reset} ${lineContent}${' '.repeat(pad)}${colors.butterMelt}│${colors.reset}`
          );
        });

        // Autocomplete popup if matches exist
        if (state.autocompleteMatches.length > 0) {
          const maxDisplay = 5;
          const visibleMatches = state.autocompleteMatches.slice(0, maxDisplay);
          const popupHeader = `├── Commands (↑/↓ select, Tab complete, Esc dismiss) `;
          const fillLen = Math.max(0, cols - popupHeader.length - 1);
          drawnLines.push(`${colors.butterMelt}${popupHeader}${'─'.repeat(fillLen)}┤${colors.reset}`);

          visibleMatches.forEach((m, idx) => {
            const isSelected = idx === state.selectedAutocompleteIdx;
            const pointer = isSelected ? `${colors.butterGold}🧈 >${colors.reset}` : '    ';
            const hint = m.argsHint ? ` ${colors.dim}${m.argsHint}${colors.reset}` : '';
            const cmdText = isSelected
              ? `${colors.bgButterGold}${colors.bold} ${m.command} ${colors.reset}${hint}`
              : `${colors.bold}${colors.butterCream}${m.command}${colors.reset}${hint}`;

            const descText = `${colors.gray}• ${m.description}${colors.reset}`;
            const lineContent = `  ${pointer} ${cmdText.padEnd(28, ' ')} ${descText}`;

            const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
            const visualLen = stripAnsi(lineContent).length;
            const pad = Math.max(0, cols - visualLen - 3);

            drawnLines.push(
              `${colors.butterMelt}│${colors.reset}${lineContent}${' '.repeat(pad)}${colors.butterMelt}│${colors.reset}`
            );
          });

          if (state.autocompleteMatches.length > maxDisplay) {
            const remaining = state.autocompleteMatches.length - maxDisplay;
            const moreLine = `  ${colors.dim}... and ${remaining} more commands${colors.reset}`;
            const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
            const visualLen = stripAnsi(moreLine).length;
            const pad = Math.max(0, cols - visualLen - 3);
            drawnLines.push(
              `${colors.butterMelt}│${colors.reset}${moreLine}${' '.repeat(pad)}${colors.butterMelt}│${colors.reset}`
            );
          }
        }

        // Bottom border with status & shortcut hints
        const turnsInfo = options.turns !== undefined ? `${options.turns}t ` : '';
        const tokInfo = options.tokens !== undefined ? `~${Math.round(options.tokens / 1000)}k tok ` : '';
        const stats = `${turnsInfo}${tokInfo}`.trim();
        const statsStr = stats ? `[${stats}] ` : '';
        const footerTitle = ` ${statsStr}Enter send • Alt+Enter newline • Tab complete • /menu `;
        const bottomFill = Math.max(0, cols - footerTitle.length - 3);
        drawnLines.push(
          `${colors.butterMelt}╰──${colors.dim}${footerTitle}${colors.reset}${colors.butterMelt}${'─'.repeat(bottomFill)}╯${colors.reset}`
        );

        // Write all lines
        stdout.write(drawnLines.join('\n') + '\n');
        renderedLinesCount = drawnLines.length;

        // Position cursor exactly at lineIdx and colIdx
        // Header line is index 0. Buffer line 0 is index 1. Buffer line lineIdx is (1 + lineIdx).
        const targetRow = 1 + coords.lineIdx;
        const linesToMoveUp = renderedLinesCount - targetRow;
        if (linesToMoveUp > 0) {
          stdout.write(`\x1b[${linesToMoveUp}A`);
        }

        // Target col: '│ > ' is 4 columns wide
        const targetCol = 4 + coords.colIdx;
        stdout.write(`\x1b[${targetCol}G`);
      };

      render();

      const onData = (chunk: Buffer) => {
        const str = chunk.toString('utf-8');
        const res = handleKeyStroke(state, str, this.history);
        state = res.state;

        if (res.action === 'submit') {
          cleanup();
          // Move cursor to bottom of rendered box before submitting
          const coords = getBuffer2DCoords(state.buffer, state.cursor);
          const targetRow = 1 + coords.lineIdx;
          const linesToMoveDown = renderedLinesCount - targetRow;
          if (linesToMoveDown > 0) {
            stdout.write(`\x1b[${linesToMoveDown}B`);
          }
          stdout.write('\r\n');
          this.addHistory(res.submittedValue ?? state.buffer);
          resolve(res.submittedValue ?? state.buffer);
          return;
        }

        if (res.action === 'exit' || res.action === 'abort') {
          cleanup();
          stdout.write('\r\n');
          options.onAbort?.();
          resolve('/exit');
          return;
        }

        render();
      };

      stdin.on('data', onData);
    });
  }

  private readPromptFallback(promptText: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(promptText, (ans) => {
        rl.close();
        const trimmed = ans.trim();
        this.addHistory(trimmed);
        resolve(trimmed);
      });
    });
  }
}
