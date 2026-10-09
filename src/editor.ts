import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { colors, b, getGitStatus, banner } from './theme.ts';
import { SLASH_COMMANDS, getPredictiveMatches, type SlashCommandInfo } from './predictive.ts';
import { getModelDisplayName } from './relay.ts';
import { columns, fit, padTo, stringWidth, truncate } from './layout.ts';
import { BEURRE_VERSION } from './config.ts';

export interface EditorPromptOptions {
  promptText?: string;
  model?: string;
  cwd?: string;
  turns?: number;
  tokens?: number;
  effort?: string;
  quotaText?: string;
  user?: string;
  history?: string[];
  initialValue?: string;
  onCycleEffort?: (newEffort: string) => void;
  onAbort?: () => void;
  signal?: AbortSignal;
  cols?: number;
}

export interface EditorCoords {
  lineIdx: number;
  colIdx: number;
  lines: string[];
}

export interface FileMatchInfo {
  path: string;
  isDir?: boolean;
}

const workspaceFilesCache = new Map<string, { files: string[]; timestamp: number }>();

/** Render the compact prompt footer without cutting a hint in the middle. */
export function formatPromptFooter(options: {
  cols: number;
  model?: string;
  effort?: string;
  quotaText?: string;
  user?: string;
}): string {
  const width = Math.max(20, options.cols);
  const modelName = options.model ? getModelDisplayName(options.model) : 'Beurre';
  const effortTag = (options.effort || 'high').toLowerCase();
  const rightStatus = [options.user, modelName, effortTag, options.quotaText]
    .filter(Boolean)
    .join(` ${colors.dim}·${colors.reset} `);
  const candidates = [
    ['esc to cancel', 'tab complete', 'shift+tab effort'],
    ['esc', 'tab complete', 'shift+tab'],
    ['esc', 'tab', 'shift+tab'],
    ['esc', 'tab'],
    ['esc'],
  ];

  for (const parts of candidates) {
    const left = parts.join('  •  ');
    if (stringWidth(left) + stringWidth(rightStatus) + 2 <= width) {
      return columns(`${colors.dim}${left}${colors.reset}`, rightStatus, width);
    }
  }
  return columns(`${colors.dim}esc${colors.reset}`, rightStatus, width);
}

export function getWorkspaceFiles(cwd = process.cwd()): string[] {
  const now = Date.now();
  const cached = workspaceFilesCache.get(cwd);
  if (cached && now - cached.timestamp < 5000) {
    return cached.files;
  }
  const fileSet = new Set<string>();
  try {
    const gitFiles = execSync('git ls-files --cached --others --exclude-standard 2>/dev/null', { cwd, encoding: 'utf-8', timeout: 800 }).split('\n');
    for (const f of gitFiles) {
      const trimmed = f.trim();
      if (trimmed && !trimmed.startsWith('.git/')) {
        fileSet.add(trimmed);
        // Discover directory prefixes
        const parts = trimmed.split('/');
        for (let i = 1; i < parts.length; i++) {
          fileSet.add(parts.slice(0, i).join('/') + '/');
        }
      }
    }
  } catch {}

  if (fileSet.size === 0) {
    const walk = (dir: string, depth: number) => {
      if (depth > 3) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'target') continue;
          const rel = path.relative(cwd, path.join(dir, e.name));
          if (e.isDirectory()) {
            fileSet.add(rel + '/');
            walk(path.join(dir, e.name), depth + 1);
          } else {
            fileSet.add(rel);
          }
        }
      } catch {}
    };
    walk(cwd, 0);
  }

  const files = Array.from(fileSet);
  workspaceFilesCache.set(cwd, { files, timestamp: now });
  return files;
}

export function getFileMatches(query: string, cwd = process.cwd()): FileMatchInfo[] {
  const files = getWorkspaceFiles(cwd);
  const q = query.toLowerCase().trim();
  if (!q) {
    return files.slice(0, 10).map((f) => ({ path: f, isDir: f.endsWith('/') }));
  }
  const prefixMatches: string[] = [];
  const subMatches: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.startsWith(q)) {
      prefixMatches.push(f);
    } else if (lower.includes(q)) {
      subMatches.push(f);
    }
  }
  return [...prefixMatches, ...subMatches]
    .slice(0, 10)
    .map((f) => ({ path: f, isDir: f.endsWith('/') }));
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
  fileMatches?: FileMatchInfo[];
  selectedFileIdx?: number;
  isSearchingHistory?: boolean;
  historySearchQuery?: string;
  historySearchMatches?: string[];
  historySearchMatchIdx?: number;
  inPasteMode: boolean;
  pasteBuffer: string;
}

export function syncSuggestions(s: EditorState): void {
  if (s.buffer.startsWith('/')) {
    s.autocompleteMatches = getPredictiveMatches(s.buffer);
    s.fileMatches = undefined;
    s.selectedFileIdx = 0;
    return;
  }
  s.autocompleteMatches = [];

  // Check for @ file mentions
  const beforeCursor = s.buffer.slice(0, s.cursor);
  const atIdx = beforeCursor.lastIndexOf('@');
  if (atIdx >= 0) {
    if (atIdx === 0 || /\s/.test(beforeCursor[atIdx - 1])) {
      const query = beforeCursor.slice(atIdx + 1);
      if (!/\s/.test(query)) {
        const matches = getFileMatches(query);
        if (matches.length > 0) {
          s.fileMatches = matches;
          if (s.selectedFileIdx === undefined || s.selectedFileIdx >= matches.length) {
            s.selectedFileIdx = 0;
          }
          return;
        }
      }
    }
  }
  s.fileMatches = undefined;
  s.selectedFileIdx = 0;
}

export function createInitialEditorState(initialValue = '', historyLength = 0): EditorState {
  const s: EditorState = {
    buffer: initialValue,
    cursor: initialValue.length,
    historyPos: historyLength,
    savedDraft: initialValue,
    autocompleteMatches: [],
    selectedAutocompleteIdx: 0,
    inPasteMode: false,
    pasteBuffer: '',
  };
  syncSuggestions(s);
  return s;
}

export interface KeyResult {
  state: EditorState;
  action: 'none' | 'submit' | 'abort' | 'exit' | 'effort_cycle' | 'clear_screen';
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
      syncSuggestions(s);
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
      syncSuggestions(s);
      return { state: s, action: 'none' };
    } else {
      s.pasteBuffer += keyStr;
      return { state: s, action: 'none' };
    }
  }

  // History search mode (Ctrl+R interactive reverse-i-search)
  if (s.isSearchingHistory) {
    if (keyStr === '\x12') {
      // Ctrl+R again: cycle to next matching history item
      const matches = s.historySearchMatches || [];
      if (matches.length > 0) {
        s.historySearchMatchIdx = ((s.historySearchMatchIdx ?? 0) + 1) % matches.length;
      }
      return { state: s, action: 'none' };
    }
    if (keyStr === '\x1b[A') {
      // Up arrow: previous match
      const matches = s.historySearchMatches || [];
      if (matches.length > 0) {
        s.historySearchMatchIdx = (s.historySearchMatchIdx ?? 0) <= 0 ? matches.length - 1 : (s.historySearchMatchIdx ?? 0) - 1;
      }
      return { state: s, action: 'none' };
    }
    if (keyStr === '\x1b[B') {
      // Down arrow: next match
      const matches = s.historySearchMatches || [];
      if (matches.length > 0) {
        s.historySearchMatchIdx = ((s.historySearchMatchIdx ?? 0) + 1) % matches.length;
      }
      return { state: s, action: 'none' };
    }
    if (keyStr === '\x1b[D' || keyStr === '\x1b[C') {
      // Left/Right arrow: accept match and place cursor for editing
      const match = s.historySearchMatches?.[s.historySearchMatchIdx ?? 0];
      if (match) {
        s.buffer = match;
        s.cursor = keyStr === '\x1b[D' ? Math.max(0, match.length - 1) : match.length;
      } else {
        s.buffer = s.savedDraft;
        s.cursor = s.savedDraft.length;
      }
      s.isSearchingHistory = false;
      s.historySearchMatches = undefined;
      syncSuggestions(s);
      return { state: s, action: 'none' };
    }
    if (keyStr === '\r' || keyStr === '\n' || keyStr === '\t') {
      // Enter or Tab: accept selected history match (or restore draft if none)
      const match = s.historySearchMatches?.[s.historySearchMatchIdx ?? 0];
      if (match) {
        s.buffer = match;
        s.cursor = match.length;
      } else {
        s.buffer = s.savedDraft;
        s.cursor = s.savedDraft.length;
      }
      s.isSearchingHistory = false;
      s.historySearchMatches = undefined;
      syncSuggestions(s);
      return { state: s, action: 'none' };
    }
    if (keyStr === '\x1b' || keyStr === '\x07' || keyStr === '\x03') {
      // Esc, Ctrl+G, or Ctrl+C: cancel search and restore draft
      s.buffer = s.savedDraft;
      s.cursor = s.savedDraft.length;
      s.isSearchingHistory = false;
      s.historySearchMatches = undefined;
      syncSuggestions(s);
      return { state: s, action: 'none' };
    }
    if (keyStr === '\x7f' || keyStr === '\x08') {
      // Backspace in search
      const curQ = s.historySearchQuery || '';
      s.historySearchQuery = curQ.slice(0, -1);
      const q = s.historySearchQuery.toLowerCase();
      s.historySearchMatches = history.filter((h) => h.toLowerCase().includes(q)).reverse();
      s.historySearchMatchIdx = 0;
      return { state: s, action: 'none' };
    }
    if (!keyStr.startsWith('\x1b') && keyStr.length >= 1 && keyStr.charCodeAt(0) >= 32) {
      s.historySearchQuery = (s.historySearchQuery || '') + keyStr;
      const q = s.historySearchQuery.toLowerCase();
      s.historySearchMatches = history.filter((h) => h.toLowerCase().includes(q)).reverse();
      s.historySearchMatchIdx = 0;
      return { state: s, action: 'none' };
    }
    return { state: s, action: 'none' };
  }

  // Ctrl+R trigger
  if (keyStr === '\x12') {
    s.isSearchingHistory = true;
    s.savedDraft = s.buffer;
    s.historySearchQuery = '';
    s.historySearchMatches = [...history].reverse().filter((h) => h.trim().length > 0);
    s.historySearchMatchIdx = 0;
    return { state: s, action: 'none' };
  }

  // Ctrl+L: clear screen
  if (keyStr === '\x0c') {
    return { state: s, action: 'clear_screen' };
  }

  // Alt+D: delete word right
  if (keyStr === '\x1bd') {
    const nextBoundary = findWordBoundaryRight(s.buffer, s.cursor);
    s.buffer = s.buffer.slice(0, s.cursor) + s.buffer.slice(nextBoundary);
    syncSuggestions(s);
    return { state: s, action: 'none' };
  }

  // Ctrl+T: transpose characters
  if (keyStr === '\x14') {
    if (s.cursor >= 2) {
      const c1 = s.buffer[s.cursor - 2];
      const c2 = s.buffer[s.cursor - 1];
      s.buffer = s.buffer.slice(0, s.cursor - 2) + c2 + c1 + s.buffer.slice(s.cursor);
      syncSuggestions(s);
    }
    return { state: s, action: 'none' };
  }

  // Shift+Tab effort slider (\x1b[Z backtab, \x1b[27;2;9~, \x1b[9;2u)
  if (keyStr === '\x1b[Z' || keyStr === '\x1b[27;2;9~' || keyStr === '\x1b[9;2u') {
    return { state: s, action: 'effort_cycle' };
  }

  // Ctrl+C
  if (keyStr === '\x03') {
    if (s.fileMatches && s.fileMatches.length > 0) {
      s.fileMatches = undefined;
      return { state: s, action: 'none' };
    }
    if (s.autocompleteMatches.length > 0) {
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }
    if (s.buffer.length > 0) {
      s.buffer = '';
      s.cursor = 0;
      s.autocompleteMatches = [];
      s.fileMatches = undefined;
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
      syncSuggestions(s);
    }
    return { state: s, action: 'none' };
  }

  // Alt+Enter (\x1b\r or \x1b\n) or Shift+Enter (\x1b[13;2u, \x1b[27;2;13~) or Ctrl+J (\x0a)
  const isAltEnter = keyStr === '\x1b\r' || keyStr === '\x1b\n' || keyStr === '\x1b[13;2u' || keyStr === '\x1b[27;2;13~' || keyStr === '\x0a';
  if (isAltEnter) {
    s.buffer = s.buffer.slice(0, s.cursor) + '\n' + s.buffer.slice(s.cursor);
    s.cursor++;
    s.autocompleteMatches = [];
    s.fileMatches = undefined;
    return { state: s, action: 'none' };
  }

  // Standard Enter (\r or \n)
  if (keyStr === '\r' || keyStr === '\n') {
    // If selecting file mention
    if (s.fileMatches && s.fileMatches.length > 0) {
      const chosen = s.fileMatches[s.selectedFileIdx ?? 0];
      if (chosen) {
        const atIdx = s.buffer.lastIndexOf('@', s.cursor - 1);
        if (atIdx >= 0) {
          const isDir = chosen.isDir || chosen.path.endsWith('/');
          const suffix = isDir ? '' : ' ';
          s.buffer = s.buffer.slice(0, atIdx) + '@' + chosen.path + suffix + s.buffer.slice(s.cursor);
          s.cursor = atIdx + 1 + chosen.path.length + suffix.length;
          if (isDir) {
            syncSuggestions(s);
          } else {
            s.fileMatches = undefined;
          }
          return { state: s, action: 'none' };
        }
      }
    }

    // If user ended line with backslash '\', turn it into a newline
    if (s.cursor > 0 && s.buffer[s.cursor - 1] === '\\') {
      s.buffer = s.buffer.slice(0, s.cursor - 1) + '\n' + s.buffer.slice(s.cursor);
      s.autocompleteMatches = [];
      s.fileMatches = undefined;
      return { state: s, action: 'none' };
    }

    // Complete on Enter. A prefix with exactly one match fills in
    // the command and keeps the prompt open — the command may still
    // take arguments the user has not typed yet. A prefix with
    // several matches submits what was typed: silently running
    // /think because you typed /t (or an alias named /t) is worse
    // than no match. A command that already has arguments typed
    // submits verbatim: completing here would silently discard
    // everything after the command name.
    if (s.autocompleteMatches.length === 1 && s.selectedAutocompleteIdx === 0) {
      const selected = s.autocompleteMatches[0];
      if (s.buffer === selected.command || s.buffer.includes(' ')) {
        s.autocompleteMatches = [];
        return { state: s, action: 'submit', submittedValue: s.buffer };
      }
      // Prefix only: complete to the command and stay in the prompt,
      // because the command may take arguments not typed yet.
      s.buffer = selected.command + ' ';
      s.cursor = s.buffer.length;
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }

    return { state: s, action: 'submit', submittedValue: s.buffer };
  }

  // Space key: If user typed slash command prefix, auto-correct to the selected
  // match. Guarded on "no args typed yet" — otherwise `/grep foo bar` loses
  // `foo` the moment a space is pressed after it.
  if (keyStr === ' ' && s.buffer.startsWith('/') && !s.buffer.includes(' ') && s.autocompleteMatches.length > 0 && s.selectedAutocompleteIdx >= 0) {
    const selected = s.autocompleteMatches[s.selectedAutocompleteIdx];
    if (selected) {
      s.buffer = selected.command + ' ';
      s.cursor = s.buffer.length;
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }
  }

  // Tab
  if (keyStr === '\t') {
    // If selecting file mention
    if (s.fileMatches && s.fileMatches.length > 0) {
      const chosen = s.fileMatches[s.selectedFileIdx ?? 0];
      if (chosen) {
        const atIdx = s.buffer.lastIndexOf('@', s.cursor - 1);
        if (atIdx >= 0) {
          const isDir = chosen.isDir || chosen.path.endsWith('/');
          const suffix = isDir ? '' : ' ';
          s.buffer = s.buffer.slice(0, atIdx) + '@' + chosen.path + suffix + s.buffer.slice(s.cursor);
          s.cursor = atIdx + 1 + chosen.path.length + suffix.length;
          if (isDir) {
            syncSuggestions(s);
          } else {
            s.fileMatches = undefined;
          }
          return { state: s, action: 'none' };
        }
      }
    }

    // Same guard as Enter/Space: never clobber arguments already typed.
    if (!s.buffer.includes(' ') && s.autocompleteMatches.length > 0 && s.selectedAutocompleteIdx >= 0) {
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
    if (s.fileMatches && s.fileMatches.length > 0) {
      s.fileMatches = undefined;
      return { state: s, action: 'none' };
    }
    if (s.autocompleteMatches.length > 0) {
      s.autocompleteMatches = [];
      return { state: s, action: 'none' };
    }
    s.buffer = '';
    s.cursor = 0;
    s.autocompleteMatches = [];
    return { state: s, action: 'none' };
  }

  // Up arrow: \x1b[A or \x1bOA
  if (keyStr === '\x1b[A' || keyStr === '\x1bOA') {
    if (s.fileMatches && s.fileMatches.length > 0) {
      s.selectedFileIdx = (s.selectedFileIdx ?? 0) <= 0
        ? s.fileMatches.length - 1
        : (s.selectedFileIdx ?? 0) - 1;
      return { state: s, action: 'none' };
    }

    if (s.autocompleteMatches.length > 0) {
      s.selectedAutocompleteIdx =
        s.selectedAutocompleteIdx <= 0
          ? s.autocompleteMatches.length - 1
          : s.selectedAutocompleteIdx - 1;
      return { state: s, action: 'none' };
    }

    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    if (coords.lineIdx > 0) {
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
      syncSuggestions(s);
    }
    return { state: s, action: 'none' };
  }

  // PageUp in autocomplete: \x1b[5~
  if (keyStr === '\x1b[5~') {
    if (s.autocompleteMatches.length > 0) {
      s.selectedAutocompleteIdx = Math.max(0, s.selectedAutocompleteIdx - 8);
      return { state: s, action: 'none' };
    }
  }

  // PageDown in autocomplete: \x1b[6~
  if (keyStr === '\x1b[6~') {
    if (s.autocompleteMatches.length > 0) {
      s.selectedAutocompleteIdx = Math.min(s.autocompleteMatches.length - 1, s.selectedAutocompleteIdx + 8);
      return { state: s, action: 'none' };
    }
  }

  // Down arrow: \x1b[B or \x1bOB
  if (keyStr === '\x1b[B' || keyStr === '\x1bOB') {
    if (s.fileMatches && s.fileMatches.length > 0) {
      s.selectedFileIdx = ((s.selectedFileIdx ?? 0) + 1) % s.fileMatches.length;
      return { state: s, action: 'none' };
    }

    if (s.autocompleteMatches.length > 0) {
      s.selectedAutocompleteIdx =
        (s.selectedAutocompleteIdx + 1) % s.autocompleteMatches.length;
      return { state: s, action: 'none' };
    }

    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    if (coords.lineIdx < coords.lines.length - 1) {
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
      syncSuggestions(s);
    }
    return { state: s, action: 'none' };
  }

  // Left arrow: \x1b[D or \x1bOD
  if (keyStr === '\x1b[D' || keyStr === '\x1bOD') {
    if (s.cursor > 0) {
      s.cursor--;
    }
    return { state: s, action: 'none' };
  }

  // Right arrow: \x1b[C or \x1bOC
  if (keyStr === '\x1b[C' || keyStr === '\x1bOC') {
    if (s.cursor < s.buffer.length) {
      s.cursor++;
    } else if (s.autocompleteMatches.length > 0) {
      const selected = s.autocompleteMatches[s.selectedAutocompleteIdx];
      if (selected && selected.command.startsWith(s.buffer)) {
        s.buffer = selected.command + (selected.argsHint ? ' ' : '');
        s.cursor = s.buffer.length;
        s.autocompleteMatches = [];
      }
    }
    return { state: s, action: 'none' };
  }

  // Home: \x1b[H, \x1bOH, \x1b[1~, Ctrl+A (\x01)
  if (keyStr === '\x1b[H' || keyStr === '\x1bOH' || keyStr === '\x1b[1~' || keyStr === '\x01') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    if (coords.colIdx === 0) {
      s.cursor = 0;
    } else {
      s.cursor = getCursorFrom2DCoords(coords.lines, coords.lineIdx, 0);
    }
    return { state: s, action: 'none' };
  }

  // End: \x1b[F, \x1bOF, \x1b[4~, Ctrl+E (\x05)
  if (keyStr === '\x1b[F' || keyStr === '\x1bOF' || keyStr === '\x1b[4~' || keyStr === '\x05') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    const lineLen = coords.lines[coords.lineIdx]?.length ?? 0;
    if (coords.colIdx === lineLen) {
      s.cursor = s.buffer.length;
    } else {
      s.cursor = getCursorFrom2DCoords(coords.lines, coords.lineIdx, lineLen);
    }
    return { state: s, action: 'none' };
  }

  // Word left: Alt+Left (\x1b[1;3D, \x1b[1;5D, \x1bb)
  if (keyStr === '\x1b[1;3D' || keyStr === '\x1b[1;5D' || keyStr === '\x1bb') {
    s.cursor = findWordBoundaryLeft(s.buffer, s.cursor);
    return { state: s, action: 'none' };
  }

  // Word right: Alt+Right (\x1b[1;3C, \x1b[1;5C, \x1bf)
  if (keyStr === '\x1b[1;3C' || keyStr === '\x1b[1;5C' || keyStr === '\x1bf') {
    s.cursor = findWordBoundaryRight(s.buffer, s.cursor);
    return { state: s, action: 'none' };
  }

  // Alt+Backspace / Ctrl+W (\x17 or \x1b\x7f) - delete previous word
  if (keyStr === '\x17' || keyStr === '\x1b\x7f') {
    const newCursor = findWordBoundaryLeft(s.buffer, s.cursor);
    s.buffer = s.buffer.slice(0, newCursor) + s.buffer.slice(s.cursor);
    s.cursor = newCursor;
    syncSuggestions(s);
    return { state: s, action: 'none' };
  }

  // Ctrl+U (kill to beginning of line)
  if (keyStr === '\x15') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    const lineStart = getCursorFrom2DCoords(coords.lines, coords.lineIdx, 0);
    s.buffer = s.buffer.slice(0, lineStart) + s.buffer.slice(s.cursor);
    s.cursor = lineStart;
    syncSuggestions(s);
    return { state: s, action: 'none' };
  }

  // Ctrl+K (kill to end of line)
  if (keyStr === '\x0b') {
    const coords = getBuffer2DCoords(s.buffer, s.cursor);
    const lineLen = coords.lines[coords.lineIdx]?.length ?? 0;
    const lineEnd = getCursorFrom2DCoords(coords.lines, coords.lineIdx, lineLen);
    s.buffer = s.buffer.slice(0, s.cursor) + s.buffer.slice(lineEnd);
    syncSuggestions(s);
    return { state: s, action: 'none' };
  }

  // Backspace: \x7f or \x08
  if (keyStr === '\x7f' || keyStr === '\x08') {
    if (s.cursor > 0) {
      s.buffer = s.buffer.slice(0, s.cursor - 1) + s.buffer.slice(s.cursor);
      s.cursor--;
      syncSuggestions(s);
    }
    return { state: s, action: 'none' };
  }

  // Delete: \x1b[3~
  if (keyStr === '\x1b[3~') {
    if (s.cursor < s.buffer.length) {
      s.buffer = s.buffer.slice(0, s.cursor) + s.buffer.slice(s.cursor + 1);
      syncSuggestions(s);
    }
    return { state: s, action: 'none' };
  }

  // Multi-character raw paste
  if (!keyStr.startsWith('\x1b') && (keyStr.includes('\n') || keyStr.includes('\r'))) {
    const normalized = keyStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s.buffer = s.buffer.slice(0, s.cursor) + normalized + s.buffer.slice(s.cursor);
    s.cursor += normalized.length;
    syncSuggestions(s);
    return { state: s, action: 'none' };
  }

  // Normal typing (printable characters)
  if (!keyStr.startsWith('\x1b') && keyStr.length >= 1) {
    s.buffer = s.buffer.slice(0, s.cursor) + keyStr + s.buffer.slice(s.cursor);
    s.cursor += keyStr.length;
    syncSuggestions(s);
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
      return this.readPromptFallback(options.promptText ?? '> ');
    }

    return new Promise<string>((resolve) => {
      let state = createInitialEditorState(options.initialValue ?? '', this.history.length);
      let currentEffort = options.effort || 'high';
      let lastRenderedLinesCount = 0;
      let lastCursorRow = 0;

      const stdin = process.stdin;
      const stdout = process.stdout;

      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();

      // Enable bracketed paste mode
      stdout.write('\x1b[?2004h');

      const onResize = () => {
        render();
      };
      if (stdout.on) {
        stdout.on('resize', onResize);
      }

      const cleanup = () => {
        if (stdout.removeListener) {
          stdout.removeListener('resize', onResize);
        }
        stdout.write('\x1b[?2004l');
        stdin.removeListener('data', onData);
        if (!wasRaw) {
          stdin.setRawMode(false);
        }
      };

      const clearBox = () => {
        if (lastRenderedLinesCount > 0) {
          if (lastCursorRow > 0) {
            stdout.write(`\x1b[${lastCursorRow}A`);
          }
          stdout.write('\r');
          for (let i = 0; i < lastRenderedLinesCount; i++) {
            stdout.write('\x1b[2K');
            if (i < lastRenderedLinesCount - 1) {
              stdout.write('\x1b[1B');
            }
          }
          if (lastRenderedLinesCount > 1) {
            stdout.write(`\x1b[${lastRenderedLinesCount - 1}A`);
          }
          stdout.write('\r');
        }
      };

      const render = () => {
        const cols = options.cols || Math.max(20, stdout.columns || 80);
        const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

        clearBox();

        const lines = state.buffer.split('\n');
        const coords = getBuffer2DCoords(state.buffer, state.cursor);
        const isMultiLine = lines.length > 1;

        // One line of a box: fit to the inner width, pad, and frame. The old
        // version hand-rolled an ANSI-aware scanner to do this and used
        // stripAnsi().length, which miscounts wide characters.
        const formatBoxLine = (content: string, borderColor = colors.mutedBox): string => {
          const maxInner = Math.max(10, cols - 4);
          const text = fit(content, maxInner);
          return `${borderColor}│${colors.reset} ${text} ${borderColor}│${colors.reset}`;
        };

        // Ghost text for completion on line 0
        let ghostText = '';
        if (state.buffer.startsWith('/') && state.autocompleteMatches.length > 0 && coords.lineIdx === 0) {
          const topMatch = state.autocompleteMatches[state.selectedAutocompleteIdx]?.command ?? '';
          if (topMatch.startsWith(lines[0]) && topMatch.length > lines[0].length) {
            ghostText = topMatch.slice(lines[0].length);
          }
        }

        const drawnLines: string[] = [];
        let targetRow = 0;
        let targetCol = 1;

        if (state.isSearchingHistory) {
          drawnLines.push(`${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`);
          const q = state.historySearchQuery || '';
          const matches = state.historySearchMatches || [];
          const matchIdx = state.historySearchMatchIdx ?? 0;
          const currMatch = matches[matchIdx] ?? '';
          const countInfo = matches.length > 0 ? ` [${matchIdx + 1}/${matches.length}]` : ' [0/0]';
          const searchLine = `${colors.butterGold}(reverse-i-search)\`${colors.bold}${colors.white}${q}${colors.reset}${colors.butterGold}\`${colors.dim}${countInfo}:${colors.reset} ${colors.white}${currMatch}${colors.reset}`;
          drawnLines.push(truncate(searchLine, cols));
          drawnLines.push(`${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`);
          const modelName = options.model ? getModelDisplayName(options.model) : 'Beurre';
          const statusRow = columns(
            `${colors.dim}Enter/Tab accept  •  Ctrl+R next  •  Esc cancel${colors.reset}`,
            modelName,
            cols,
          );
          drawnLines.push(statusRow);
          targetRow = 1;
          targetCol = Math.min(cols, 19 + stringWidth(q));
        } else if (isMultiLine) {
          const maxLineNumDigits = lines.length.toString().length;
          const headerTitle = ` Multi-line Prompt (Shift+Enter newline • Enter send) `;
          const topFill = Math.max(0, cols - headerTitle.length - 3);
          drawnLines.push(
            `${colors.mutedBox}╭──${colors.dim}${headerTitle}${colors.reset}${colors.mutedBox}${'─'.repeat(topFill)}╮${colors.reset}`
          );

          lines.forEach((l, idx) => {
            const numStr = (idx + 1).toString().padStart(maxLineNumDigits, ' ');
            const arrow = idx === coords.lineIdx ? `${colors.butterGold}❯${colors.reset}` : ' ';
            const ghost = idx === 0 ? `${colors.dim}${ghostText}${colors.reset}` : '';
            const lineContent = `${colors.darkGray}${numStr} │${colors.reset} ${arrow} ${l}${ghost}`;
            drawnLines.push(formatBoxLine(lineContent, colors.mutedBox));
          });

          drawnLines.push(`${colors.mutedBox}╰${'─'.repeat(cols - 2)}╯${colors.reset}`);
          targetRow = 1 + coords.lineIdx;
          targetCol = 2 + maxLineNumDigits + 3 + 2 + stringWidth((lines[coords.lineIdx] ?? '').slice(0, coords.colIdx));
        } else {
          // OMP / Claude Code Prompt Bar with top line, input line, divider, and bottom status bar
          drawnLines.push(`${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`);

          const promptPrefix = `${colors.butterGold}${colors.bold}>${colors.reset} `;
          const isBufferEmpty = state.buffer === '';
          if (isBufferEmpty) {
            // Drop the parenthetical rather than truncating mid-word; the old
            // `cols >= 56` switch hard-cut to a different sentence instead.
            const avail = Math.max(4, cols - 3);
            const full = 'Type a prompt or / for commands (Shift+Enter newline)';
            const hint = stringWidth(full) <= avail ? full : 'Type a prompt or / for commands';
            const placeholder = `${colors.darkGray}${truncate(hint, avail)}${colors.reset}`;
            drawnLines.push(`${promptPrefix}${placeholder}`);
            targetRow = 1;
            targetCol = 3;
          } else {
            const maxTextCols = Math.max(5, cols - 4);
            const cur = Math.max(0, Math.min(coords.colIdx, state.buffer.length));
            const buf = state.buffer;
            let displayBuf = buf;
            let visualCol = stringWidth(buf.slice(0, cur));

            if (stringWidth(buf) > maxTextCols) {
              if (cur < maxTextCols - 1) {
                displayBuf = buf.slice(0, maxTextCols - 1) + '…';
                visualCol = stringWidth(buf.slice(0, cur));
              } else if (cur > buf.length - (maxTextCols - 1)) {
                const startIdx = buf.length - (maxTextCols - 1);
                displayBuf = '…' + buf.slice(startIdx);
                visualCol = 1 + stringWidth(buf.slice(startIdx, cur));
              } else {
                const windowSize = maxTextCols - 2;
                const startIdx = cur - Math.floor(windowSize / 2);
                const endIdx = startIdx + windowSize;
                displayBuf = '…' + buf.slice(startIdx, endIdx) + '…';
                visualCol = 1 + stringWidth(buf.slice(startIdx, cur));
              }
            }
            const ghost = stringWidth(buf) <= maxTextCols ? `${colors.dim}${ghostText}${colors.reset}` : '';
            drawnLines.push(truncate(`${promptPrefix}${colors.bold}${colors.white}${displayBuf}${colors.reset}${ghost}`, cols));
            targetRow = 1;
            targetCol = Math.max(3, Math.min(cols, 3 + visualCol));
          }

          drawnLines.push(`${colors.mutedBox}${'─'.repeat(cols)}${colors.reset}`);

          drawnLines.push(formatPromptFooter({
            cols,
            model: options.model,
            effort: currentEffort,
            quotaText: options.quotaText,
            user: options.user,
          }));

          // Autocomplete floating box with smooth scrolling
          if (state.autocompleteMatches.length > 0) {
            const maxDisplay = 8;
            const totalMatches = state.autocompleteMatches.length;

            let scrollOffset = 0;
            if (state.selectedAutocompleteIdx >= maxDisplay) {
              scrollOffset = state.selectedAutocompleteIdx - maxDisplay + 1;
            }
            if (scrollOffset > totalMatches - maxDisplay) {
              scrollOffset = Math.max(0, totalMatches - maxDisplay);
            }

            const visibleMatches = state.autocompleteMatches.slice(scrollOffset, scrollOffset + maxDisplay);
            // The box spans exactly the terminal width — the same
            // `cols` the prompt bars above use — so its borders
            // line up with them instead of stopping a column short.
            const inner = Math.max(12, cols - 2);
            const countTag = ` [${state.selectedAutocompleteIdx + 1}/${totalMatches}]`;
            const head = truncate(
              `${colors.mutedBox}╭─${colors.reset} ${colors.bold}Commands${colors.reset}${colors.dim}${countTag}${colors.reset}`,
              inner,
            );
            const headerRow = Math.max(0, inner - stringWidth(head) - 1);
            drawnLines.push(`${head} ${colors.mutedBox}${'─'.repeat(headerRow)}╮${colors.reset}`);
            // Reserve a fixed label column so descriptions form a clean left
            // edge; `columns()` right-aligns its second half, which ragged
            // every description at wide widths. The label takes at most
            // half the inner width, and the row's own gaps (`  ❯ `,
            // two spaces, plus the box's border and padding) eat six
            // columns, so the description never wraps mid-word.
            const labelCol = Math.min(
              Math.max(12, ...visibleMatches.map((m) => stringWidth(m.command) + (m.argsHint ? m.argsHint.length + 1 : 0))),
              Math.floor((inner - 2) / 2),
            );
            // The description budget: the row is `  ❯ ` + label
            // + two spaces + description, framed by the box border
            // and a padding space on each side. Truncate to what
            // actually remains so no row can overrun the right
            // border at any width.
            const descCol = Math.max(4, cols - 8 - labelCol);
            visibleMatches.forEach((m, idx) => {
              const actualIdx = scrollOffset + idx;
              const isSelected = actualIdx === state.selectedAutocompleteIdx;
              const pointer = isSelected ? `${colors.butterGold}❯${colors.reset}` : ' ';
              const hint = m.argsHint ? ` ${colors.dim}${m.argsHint}${colors.reset}` : '';
              const cmdText = isSelected
                ? `${colors.bold}${colors.butterGold}${m.command}${colors.reset}${hint}`
                : `${colors.bold}${colors.butterCream}${m.command}${colors.reset}${hint}`;
              const label = padTo(cmdText, labelCol);
              drawnLines.push(formatBoxLine(`  ${pointer} ${label}  ${truncate(m.description, descCol)}`, colors.mutedBox));
            });

            if (scrollOffset + maxDisplay < totalMatches) {
              const remaining = totalMatches - (scrollOffset + maxDisplay);
              drawnLines.push(formatBoxLine(truncate(`    ${colors.dim}▼ ${remaining} more below${colors.reset}`, inner), colors.mutedBox));
            }
            drawnLines.push(`${colors.mutedBox}╰${'─'.repeat(Math.max(0, cols - 2))}╯${colors.reset}`);
          } else if (state.fileMatches && state.fileMatches.length > 0) {
            const maxDisplay = 8;
            const totalFiles = state.fileMatches.length;
            let scrollOffset = 0;
            const selIdx = state.selectedFileIdx ?? 0;
            if (selIdx >= maxDisplay) {
              scrollOffset = selIdx - maxDisplay + 1;
            }
            if (scrollOffset > totalFiles - maxDisplay) {
              scrollOffset = Math.max(0, totalFiles - maxDisplay);
            }

            const visibleFiles = state.fileMatches.slice(scrollOffset, scrollOffset + maxDisplay);
            const inner = Math.max(12, cols - 2);
            const countTag = ` [${selIdx + 1}/${totalFiles}]`;
            const head = truncate(
              `${colors.mutedBox}╭─${colors.reset} ${colors.bold}Files${colors.reset}${colors.dim}${countTag}${colors.reset}`,
              inner,
            );
            const headerRow = Math.max(0, inner - stringWidth(head) - 1);
            drawnLines.push(`${head} ${colors.mutedBox}${'─'.repeat(headerRow)}╮${colors.reset}`);

            const labelCol = Math.min(
              Math.max(12, ...visibleFiles.map((f) => stringWidth(f.path) + 3)),
              Math.floor((inner - 2) / 2),
            );
            const descCol = Math.max(4, cols - 8 - labelCol);
            visibleFiles.forEach((f, idx) => {
              const actualIdx = scrollOffset + idx;
              const isSelected = actualIdx === selIdx;
              const pointer = isSelected ? `${colors.butterGold}❯${colors.reset}` : ' ';
              const icon = f.isDir ? '📁 ' : '📄 ';
              const text = isSelected
                ? `${colors.bold}${colors.butterGold}${f.path}${colors.reset}`
                : `${colors.butterCream}${f.path}${colors.reset}`;
              const label = padTo(`${icon}${text}`, labelCol);
              const tag = f.isDir ? `${colors.dim}directory${colors.reset}` : `${colors.dim}file${colors.reset}`;
              drawnLines.push(formatBoxLine(`  ${pointer} ${label}  ${truncate(tag, descCol)}`, colors.mutedBox));
            });

            if (scrollOffset + maxDisplay < totalFiles) {
              const remaining = totalFiles - (scrollOffset + maxDisplay);
              drawnLines.push(formatBoxLine(truncate(`    ${colors.dim}▼ ${remaining} more below${colors.reset}`, inner), colors.mutedBox));
            }
            drawnLines.push(`${colors.mutedBox}╰${'─'.repeat(Math.max(0, cols - 2))}╯${colors.reset}`);
          }
        }

        // Write all lines in ONE write. Two writes per frame let the
        // erase of the next render race the tail of this one: the
        // terminal can still be emitting the last line when the
        // move-up arrives, so the erase lands a line too low and the
        // line that was being written survives — the "same line shows
        // up twice" report. One write is atomic per chunk on the pty.
        stdout.write(drawnLines.join('\n'));
        lastRenderedLinesCount = drawnLines.length;

        // Position cursor exactly at targetRow and targetCol
        const linesToMoveUp = (drawnLines.length - 1) - targetRow;
        if (linesToMoveUp > 0) {
          stdout.write(`\x1b[${linesToMoveUp}A`);
        }
        stdout.write(`\x1b[${targetCol}G`);
        lastCursorRow = targetRow;
      };

      render();

      const onData = (chunk: Buffer) => {
        const str = chunk.toString('utf-8');
        const res = handleKeyStroke(state, str, this.history);
        state = res.state;

        if (res.action === 'clear_screen') {
          stdout.write('\x1b[2J\x1b[H');
          stdout.write(banner(BEURRE_VERSION, options.model || 'glm-5-3-flash', process.cwd(), currentEffort) + '\n\n');
          lastRenderedLinesCount = 0;
          lastCursorRow = 0;
          render();
          return;
        }

        if (res.action === 'effort_cycle') {
          const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
          const curIdx = efforts.indexOf(currentEffort.toLowerCase());
          currentEffort = efforts[(curIdx + 1) % efforts.length];
          options.onCycleEffort?.(currentEffort);
          render();
          return;
        }

        if (res.action === 'submit') {
          cleanup();
          clearBox();
          this.addHistory(res.submittedValue ?? state.buffer);
          resolve(res.submittedValue ?? state.buffer);
          return;
        }

        if (res.action === 'exit' || res.action === 'abort') {
          cleanup();
          clearBox();
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
