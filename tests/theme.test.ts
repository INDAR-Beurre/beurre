import { describe, expect, it } from 'bun:test';
import {
  statusBar,
  renderErrorCard,
  renderToast,
  formatClaudeToolCall,
  formatClaudeToolResult,
  getGitStatus,
  formatWorkingPromptBar,
  BeurreWorkingBar,
} from '../src/theme.ts';

describe('Butter Theme & Status Rendering', () => {
  it('should render a complete status bar with model and git info', () => {
    const bar = statusBar({
      model: 'glm-5-3-flash',
      cwd: process.cwd(),
      turns: 5,
      tokens: 12000,
    });

    expect(bar).toContain('glm-5-3-flash');
    expect(bar).toContain('Turns: 5');
    expect(bar).toContain('tok');
    expect(bar).toContain('LIVE');
  });

  it('should format error card with red border', () => {
    const card = renderErrorCard('Connection Timeout', 'Failed to reach Relay gateway after 10s.');
    expect(card).toContain('Connection Timeout');
    expect(card).toContain('Failed to reach Relay');
  });

  it('should format toasts for success and failure', () => {
    const successToast = renderToast('Model switched', true);
    expect(successToast).toContain('Model switched');
    expect(successToast).toContain('✔');

    const failToast = renderToast('Action cancelled', false);
    expect(failToast).toContain('Action cancelled');
    expect(failToast).toContain('✖');
  });

  it('should format tool calls with badges', () => {
    const bashCall = formatClaudeToolCall('bash', { command: 'bun test' });
    expect(bashCall).toContain('Bash');
    expect(bashCall).toContain('bun test');

    const subCall = formatClaudeToolCall('subagent_run', { subagent: 'Architect', task: 'design' });
    expect(subCall).toContain('Subagent');
    expect(subCall).toContain('Architect');
  });

  it('should format tool results with line indicators', () => {
    const singleLine = formatClaudeToolResult('Success', false);
    expect(singleLine).toContain('Success');

    const multiLine = formatClaudeToolResult('line 1\nline 2\nline 3', false);
    expect(multiLine).toContain('line 1');
    expect(multiLine).toContain('+2 more lines');
  });

  it('should format pinned working prompt bar with 4 distinct lines and metadata', () => {
    const lines = formatWorkingPromptBar({
      cols: 80,
      spinnerFrame: '🧈 ⠹',
      statusText: 'Whipping up solution...',
      model: 'glm-5-3-flash',
      effort: 'high',
      user: 'alex',
      quotaText: '12k / 50M',
    });

    expect(lines.length).toBe(4);
    // Line 0: top border
    expect(lines[0]).toContain('─');
    // Line 1: spinner + active status
    expect(lines[1]).toContain('🧈 ⠹');
    expect(lines[1]).toContain('Whipping up solution...');
    // Line 2: middle border
    expect(lines[2]).toContain('─');
    // Line 3: footer status
    expect(lines[3]).toContain('esc to interrupt');
    expect(lines[3]).toContain('GLM 5.3 Flash');
    expect(lines[3]).toContain('high');
    expect(lines[3]).toContain('alex');
    expect(lines[3]).toContain('12k / 50M');
  });

  it('should strip leading butter emoji in working prompt bar to prevent double butter', () => {
    const lines = formatWorkingPromptBar({
      cols: 80,
      spinnerFrame: '🧈 ⠹',
      statusText: '🧈 Whipping up solution...',
    });

    // Should only have single butter emoji from the spinner frame
    const butterMatches = lines[1].match(/🧈/g);
    expect(butterMatches?.length).toBe(1);
    expect(lines[1]).toContain('Whipping up solution...');
  });

  it('should truncate overly long status text cleanly without overflowing terminal width', () => {
    const longText = 'A'.repeat(150);
    const lines = formatWorkingPromptBar({
      cols: 60,
      statusText: longText,
    });

    expect(lines[1]).toContain('…');
    // Visual length should be within bounds
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripAnsi(lines[1]).length).toBeLessThanOrEqual(60);
  });

  it('should manage BeurreWorkingBar state, thinking, generating, and tool calls', () => {
    const bar = new BeurreWorkingBar({
      model: 'kimi-k3:max',
      effort: 'max',
      user: 'alex',
    });

    bar.update('Starting engine...');
    expect(bar.getStatusText()).toBe('Starting engine...');

    // Strips leading butter
    bar.update('🧈 Whipping up solution...');
    expect(bar.getStatusText()).toBe('Whipping up solution...');

    // Thinking mode
    bar.setThinking(120, 1.5);
    expect(bar.getStatusText()).toContain('Thinking (~120 tokens • 1.5s)');

    // Generating mode
    bar.setGenerating(200, 45.2, 3.0);
    expect(bar.getStatusText()).toContain('Generating (~200 tokens • 45.2 tok/s • 3.0s)');

    // Tool execution
    bar.setTool('bash', { command: 'bun test' }, 0.8);
    expect(bar.getStatusText()).toContain('bash: bun test (0.8s)');

    bar.setTool('read', { path: 'src/theme.ts' });
    expect(bar.getStatusText()).toContain('read: src/theme.ts');

    bar.setTool('edit', { path: 'src/repl.ts' });
    expect(bar.getStatusText()).toContain('edit: src/repl.ts');

    bar.setTool('web_search', { query: 'bun test docs' });
    expect(bar.getStatusText()).toContain('web search: "bun test docs"');

    bar.stop();
  });

  it('should guarantee no line in formatWorkingPromptBar exceeds cols in narrow terminals', () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

    for (const cols of [70, 60, 50, 40]) {
      const lines = formatWorkingPromptBar({
        cols,
        spinnerFrame: '🧈 ⠹',
        statusText: 'Executing bash: git commit -m "update promptbar"...',
        model: 'glm-5-3-flash',
        effort: 'high',
        user: 'alexander-developer',
        quotaText: '12k / 50M',
      });

      expect(lines.length).toBe(4);
      for (let i = 0; i < 4; i++) {
        const visualLen = stripAnsi(lines[i]).length;
        expect(visualLen).toBeLessThanOrEqual(cols);
      }
      expect(lines[3]).toContain('GLM 5.3 Flash');
    }
  });

  it('should format error card with exact border width matching columns', () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const card = renderErrorCard('Syntax Failure', 'Line 1: unexpected token');
    const lines = card.trim().split('\n');
    // Top border and bottom border should match width
    const topWidth = stripAnsi(lines[0]).length;
    const bottomWidth = stripAnsi(lines[lines.length - 1]).length;
    expect(topWidth).toBe(bottomWidth);
  });
});
