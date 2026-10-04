import { describe, expect, it } from 'bun:test';
import {
  statusBar,
  renderErrorCard,
  renderToast,
  formatClaudeToolCall,
  formatClaudeToolResult,
  getGitStatus,
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
});
