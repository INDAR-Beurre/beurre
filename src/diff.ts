import { colors, b } from './theme.ts';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface DiffResult {
  filePath: string;
  hasChanges: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  formatted: string;
}

// Simple and efficient LCS-based line differ
export function computeLineDiff(oldStr: string, newStr: string): Array<{ type: 'same' | 'add' | 'del'; line: string }> {
  const oldLines = oldStr ? oldStr.split(/\r?\n/) : [];
  const newLines = newStr ? newStr.split(/\r?\n/) : [];

  const n = oldLines.length;
  const m = newLines.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return newLines.map((line) => ({ type: 'add' as const, line }));
  if (m === 0) return oldLines.map((line) => ({ type: 'del' as const, line }));

  // Prefix trimming optimization
  let prefix = 0;
  while (prefix < n && prefix < m && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  // Suffix trimming optimization
  let suffix = 0;
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    oldLines[n - 1 - suffix] === newLines[m - 1 - suffix]
  ) {
    suffix++;
  }

  const trimmedOld = oldLines.slice(prefix, n - suffix);
  const trimmedNew = newLines.slice(prefix, m - suffix);

  const dp: number[][] = Array.from({ length: trimmedOld.length + 1 }, () =>
    new Array(trimmedNew.length + 1).fill(0)
  );

  for (let i = 0; i < trimmedOld.length; i++) {
    for (let j = 0; j < trimmedNew.length; j++) {
      if (trimmedOld[i] === trimmedNew[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const middleDiff: Array<{ type: 'same' | 'add' | 'del'; line: string }> = [];
  let i = trimmedOld.length;
  let j = trimmedNew.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && trimmedOld[i - 1] === trimmedNew[j - 1]) {
      middleDiff.unshift({ type: 'same', line: trimmedOld[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      middleDiff.unshift({ type: 'add', line: trimmedNew[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      middleDiff.unshift({ type: 'del', line: trimmedOld[i - 1] });
      i--;
    }
  }

  const result: Array<{ type: 'same' | 'add' | 'del'; line: string }> = [];
  for (let k = 0; k < prefix; k++) {
    result.push({ type: 'same', line: oldLines[k] });
  }
  result.push(...middleDiff);
  for (let k = n - suffix; k < n; k++) {
    result.push({ type: 'same', line: oldLines[k] });
  }

  return result;
}

export function generateDiffCard(
  oldContent: string,
  newContent: string,
  filePath: string,
  maxContext = 3
): DiffResult {
  const lineDiffs = computeLineDiff(oldContent, newContent);

  let additions = 0;
  let deletions = 0;
  for (const d of lineDiffs) {
    if (d.type === 'add') additions++;
    if (d.type === 'del') deletions++;
  }

  const hasChanges = additions > 0 || deletions > 0;
  if (!hasChanges) {
    return {
      filePath,
      hasChanges: false,
      additions: 0,
      deletions: 0,
      hunks: [],
      formatted: `${colors.dim}No changes detected in ${filePath}${colors.reset}`,
    };
  }

  const isNewFile = !oldContent && newContent.length > 0;
  const isDeletedFile = oldContent.length > 0 && !newContent;

  const hunks: DiffHunk[] = [];
  let currentHunk: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
    trailingSameCount: number;
  } | null = null;

  let oldLineNum = 1;
  let newLineNum = 1;

  const finalizeHunk = (hunk: typeof currentHunk) => {
    if (!hunk) return;
    // Trim trailing same lines beyond maxContext
    while (hunk.trailingSameCount > maxContext && hunk.lines.length > 0) {
      const last = hunk.lines[hunk.lines.length - 1];
      if (last.startsWith(' ')) {
        hunk.lines.pop();
        hunk.oldLines--;
        hunk.newLines--;
        hunk.trailingSameCount--;
      } else {
        break;
      }
    }
    hunks.push({
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      lines: hunk.lines,
    });
  };

  for (let idx = 0; idx < lineDiffs.length; idx++) {
    const item = lineDiffs[idx];

    if (item.type === 'same') {
      if (currentHunk) {
        currentHunk.lines.push(` ${item.line}`);
        currentHunk.oldLines++;
        currentHunk.newLines++;
        currentHunk.trailingSameCount++;

        // Close hunk if context exceeds maxContext
        if (currentHunk.trailingSameCount > maxContext * 2) {
          finalizeHunk(currentHunk);
          currentHunk = null;
        }
      }
      oldLineNum++;
      newLineNum++;
    } else if (item.type === 'del') {
      if (!currentHunk) {
        const contextStart = Math.max(0, idx - maxContext);
        const leadingContext = lineDiffs.slice(contextStart, idx).map((c) => ` ${c.line}`);
        currentHunk = {
          oldStart: isNewFile ? 0 : Math.max(1, oldLineNum - leadingContext.length),
          oldLines: leadingContext.length,
          newStart: isDeletedFile ? 0 : Math.max(1, newLineNum - leadingContext.length),
          newLines: leadingContext.length,
          lines: [...leadingContext],
          trailingSameCount: 0,
        };
      }
      currentHunk.lines.push(`-${item.line}`);
      currentHunk.oldLines++;
      currentHunk.trailingSameCount = 0;
      oldLineNum++;
    } else if (item.type === 'add') {
      if (!currentHunk) {
        const contextStart = Math.max(0, idx - maxContext);
        const leadingContext = lineDiffs.slice(contextStart, idx).map((c) => ` ${c.line}`);
        currentHunk = {
          oldStart: isNewFile ? 0 : Math.max(1, oldLineNum - leadingContext.length),
          oldLines: isNewFile ? 0 : leadingContext.length,
          newStart: Math.max(1, newLineNum - leadingContext.length),
          newLines: leadingContext.length,
          lines: [...leadingContext],
          trailingSameCount: 0,
        };
      }
      currentHunk.lines.push(`+${item.line}`);
      currentHunk.newLines++;
      currentHunk.trailingSameCount = 0;
      newLineNum++;
    }
  }

  if (currentHunk) {
    finalizeHunk(currentHunk);
  }

  // Format into a beautiful card
  const cols = Math.min(process.stdout.columns || 80, 80);
  const title = ` 📝 Diff: ${filePath} (+${additions}/-${deletions}) `;
  const borderLen = Math.max(0, cols - title.length - 3);

  const cardLines: string[] = [];
  cardLines.push(`${colors.butterMelt}╭──${colors.bold}${colors.butterGold}${title}${colors.reset}${colors.butterMelt}${'─'.repeat(borderLen)}╮${colors.reset}`);

  for (const hunk of hunks) {
    const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    cardLines.push(`${colors.butterMelt}│${colors.reset} ${colors.cyan}${hunkHeader}${colors.reset}`);

    for (const l of hunk.lines) {
      let formattedLine = '';
      if (l.startsWith('+')) {
        formattedLine = `${colors.green}${l}${colors.reset}`;
      } else if (l.startsWith('-')) {
        formattedLine = `${colors.red}${l}${colors.reset}`;
      } else {
        formattedLine = `${colors.dim}${l}${colors.reset}`;
      }
      cardLines.push(`${colors.butterMelt}│${colors.reset} ${formattedLine}`);
    }
  }

  cardLines.push(`${colors.butterMelt}╰${'─'.repeat(cols - 2)}╯${colors.reset}`);

  return {
    filePath,
    hasChanges: true,
    additions,
    deletions,
    hunks,
    formatted: cardLines.join('\n'),
  };
}
