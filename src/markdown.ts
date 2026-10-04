import { colors, b } from './theme.ts';
import { highlightCode, Markdown, getMarkdownTheme } from '@oh-my-pi/pi-tui';

export interface MarkdownOptions {
  columns?: number;
}

// Custom code syntax highlighting with warm butter tones
export function highlightCodeBlock(code: string, lang = ''): string[] {
  const language = lang.trim().toLowerCase();
  try {
    // Attempt pi-tui highlightCode
    const highlighted = highlightCode(code, language);
    if (highlighted && highlighted.length > 0) {
      return highlighted;
    }
  } catch {
    // fallback to regex highlighter
  }

  // Fallback keyword and literal regex highlighter in butter palette
  const lines = code.split('\n');
  return lines.map((line) => {
    let out = line;
    // Comments
    if (out.trim().startsWith('//') || out.trim().startsWith('#')) {
      return `${colors.darkGray}${out}${colors.reset}`;
    }
    // Keywords
    out = out.replace(
      /\b(import|export|from|const|let|var|function|class|return|if|else|switch|case|default|for|while|await|async|try|catch|finally|throw|new|typeof|interface|type)\b/g,
      `${colors.butterGold}$1${colors.reset}`
    );
    // Strings
    out = out.replace(
      /(["'`])(?:(?=(\\?))\2.)*?\1/g,
      `${colors.butterCream}$&${colors.reset}`
    );
    // Numbers
    out = out.replace(/\b(\d+)\b/g, `${colors.butterMelt}$1${colors.reset}`);
    // Booleans / null / undefined
    out = out.replace(/\b(true|false|null|undefined)\b/g, `${colors.cyan}$1${colors.reset}`);
    return out;
  });
}

export function renderMarkdownBlock(text: string, options: MarkdownOptions = {}): string {
  const cols = options.columns || Math.min(process.stdout.columns || 80, 80);

  // If text contains code fences, render code blocks with butter headers
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match;
  let lastIndex = 0;
  const parts: string[] = [];

  while ((match = fenceRegex.exec(text)) !== null) {
    const preText = text.slice(lastIndex, match.index);
    if (preText.trim()) {
      try {
        const md = new Markdown(preText.trim(), 0, 0, getMarkdownTheme());
        parts.push(md.render(cols).join('\n'));
      } catch {
        parts.push(preText.trim());
      }
    }

    const lang = match[1] || 'code';
    const code = match[2];
    const highlightedLines = highlightCodeBlock(code, lang);

    const title = ` 💻 ${lang} `;
    const borderLen = Math.max(0, cols - title.length - 3);

    parts.push(`${colors.butterCrust}╭──${colors.bold}${colors.butterGold}${title}${colors.reset}${colors.butterCrust}${'─'.repeat(borderLen)}╮${colors.reset}`);
    for (const hLine of highlightedLines) {
      parts.push(`${colors.butterCrust}│${colors.reset} ${hLine}`);
    }
    parts.push(`${colors.butterCrust}╰${'─'.repeat(cols - 2)}╯${colors.reset}`);

    lastIndex = fenceRegex.lastIndex;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) {
    try {
      const md = new Markdown(remaining.trim(), 0, 0, getMarkdownTheme());
      parts.push(md.render(cols).join('\n'));
    } catch {
      parts.push(remaining.trim());
    }
  }

  return parts.join('\n\n');
}

export function formatThinkingBlock(thinking: string, isCollapsed = false, cols?: number): string {
  const width = cols || Math.min(process.stdout.columns || 80, 80);
  const trimmed = thinking.trim();
  if (!trimmed) return '';

  const charsCount = trimmed.length;
  const tokenEst = Math.round(charsCount / 4);

  if (isCollapsed) {
    const firstLine = trimmed.split('\n')[0].slice(0, 60);
    return `${colors.butterPale}🧠 ${colors.bold}Thinking${colors.reset} ${colors.dim}(~${tokenEst} tokens): ${firstLine}... [type /think to expand]${colors.reset}`;
  }

  const title = ` 🧠 Thinking (~${tokenEst} tokens) `;
  const borderLen = Math.max(0, width - title.length - 3);

  const lines: string[] = [
    `${colors.butterCrust}╭──${colors.bold}${colors.butterPale}${title}${colors.reset}${colors.butterCrust}${'─'.repeat(borderLen)}╮${colors.reset}`,
  ];

  // Wrap thinking lines nicely
  const rawLines = trimmed.split('\n');
  for (const line of rawLines) {
    const maxLine = width - 4;
    let curr = line;
    if (!curr) {
      lines.push(`${colors.butterCrust}│${colors.reset}`);
      continue;
    }
    while (curr.length > maxLine) {
      lines.push(`${colors.butterCrust}│${colors.reset} ${colors.dim}${curr.slice(0, maxLine)}${colors.reset}`);
      curr = curr.slice(maxLine);
    }
    lines.push(`${colors.butterCrust}│${colors.reset} ${colors.dim}${curr}${colors.reset}`);
  }

  lines.push(`${colors.butterCrust}╰${'─'.repeat(width - 2)}╯${colors.reset}`);
  return lines.join('\n');
}

export class StreamingMarkdownHighlighter {
  private buffer = '';
  private inCodeBlock = false;
  private currentLang = '';
  private cols: number;
  private onWrite: (chunk: string) => void;

  constructor(options: { columns?: number; onWrite?: (chunk: string) => void } = {}) {
    this.cols = options.columns || Math.min(process.stdout.columns || 80, 80);
    this.onWrite = options.onWrite || ((chunk: string) => process.stdout.write(chunk));
  }

  feed(token: string): void {
    this.buffer += token;

    while (this.buffer.includes('\n')) {
      const newlineIdx = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, newlineIdx);
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!this.inCodeBlock) {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('```')) {
          this.inCodeBlock = true;
          this.currentLang = trimmed.slice(3).trim() || 'code';
          const title = ` 💻 ${this.currentLang} `;
          const borderLen = Math.max(0, this.cols - title.length - 3);
          this.onWrite(
            `\n${colors.butterCrust}╭──${colors.bold}${colors.butterGold}${title}${colors.reset}${colors.butterCrust}${'─'.repeat(borderLen)}╮${colors.reset}\n`
          );
        } else {
          this.onWrite(line + '\n');
        }
      } else {
        const trimmed = line.trim();
        if (trimmed.startsWith('```')) {
          this.inCodeBlock = false;
          this.currentLang = '';
          this.onWrite(`${colors.butterCrust}╰${'─'.repeat(this.cols - 2)}╯${colors.reset}\n`);
        } else {
          const highlighted = highlightCodeBlock(line, this.currentLang);
          this.onWrite(`${colors.butterCrust}│${colors.reset} ${highlighted[0] ?? line}\n`);
        }
      }
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      if (this.inCodeBlock) {
        if (this.buffer.trim().startsWith('```')) {
          this.onWrite(`${colors.butterCrust}╰${'─'.repeat(this.cols - 2)}╯${colors.reset}\n`);
        } else {
          const highlighted = highlightCodeBlock(this.buffer, this.currentLang);
          this.onWrite(`${colors.butterCrust}│${colors.reset} ${highlighted[0] ?? this.buffer}\n`);
          this.onWrite(`${colors.butterCrust}╰${'─'.repeat(this.cols - 2)}╯${colors.reset}\n`);
        }
        this.inCodeBlock = false;
      } else {
        this.onWrite(this.buffer);
      }
      this.buffer = '';
    } else if (this.inCodeBlock) {
      this.onWrite(`${colors.butterCrust}╰${'─'.repeat(this.cols - 2)}╯${colors.reset}\n`);
      this.inCodeBlock = false;
    }
  }
}
