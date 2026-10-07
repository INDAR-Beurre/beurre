import { stripAnsi } from '../src/layout.ts';
import { describe, expect, it } from 'bun:test';
import {
  renderMarkdownBlock,
  formatThinkingBlock,
  highlightCodeBlock,
  StreamingMarkdownHighlighter,
} from '../src/markdown.ts';

describe('Markdown & Code Highlighting Engine', () => {
  it('should highlight code blocks with language headers', () => {
    const md = '```typescript\nconst message: string = "hello beurre";\n```';
    const rendered = renderMarkdownBlock(md);
    expect(rendered).toContain('typescript');
    expect(rendered).toContain('hello beurre');
  });

  it('should highlight keywords and strings in code syntax', () => {
    const lines = highlightCodeBlock('const port = 8080;\n// server port', 'javascript');
    expect(lines.length).toBe(2);
    // Should contain keyword highlighting and comment formatting
    expect(lines[0]).toContain('port');
    expect(stripAnsi(lines[1])).toContain('// server port');
  });

  it('should format thinking block in expanded mode', () => {
    const thinking = 'Planning the architecture of the TUI.\n1. Add editor\n2. Add status bar';
    const formatted = formatThinkingBlock(thinking, false);
    expect(formatted).toContain('Thinking');
    expect(formatted).toContain('Planning the architecture');
    expect(formatted).toContain('Add editor');
  });

  it('should format thinking block in collapsed mode', () => {
    const thinking = 'Short thought process for execution.';
    const formatted = formatThinkingBlock(thinking, true);
    expect(formatted).toContain('Thinking');
    expect(formatted).toContain('/think');
  });

  it('should stream code blocks and format borders with StreamingMarkdownHighlighter', () => {
    let output = '';
    const highlighter = new StreamingMarkdownHighlighter({
      onWrite: (chunk) => {
        output += chunk;
      },
    });

    highlighter.feed('Here is code:\n```ts\nconst x: number = 1;\n```\nDone.');
    highlighter.flush();

    // Strip ANSI first: syntax highlighting inserts escapes *inside* `const x`,
    // so asserting against the coloured string proves nothing.
    const plain = stripAnsi(output);
    expect(plain).toContain('ts');
    expect(plain).toContain('const x');
    expect(plain).toContain('Done.');
  });
});
