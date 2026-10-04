import { describe, expect, it } from 'bun:test';
import { listSubagents, getSubagent } from '../src/subagents.ts';

describe('Native Named Subagents', () => {
  it('should list all predefined named subagents', () => {
    const subagents = listSubagents();
    expect(subagents.length).toBeGreaterThanOrEqual(4);
    const names = subagents.map((s) => s.name);
    expect(names).toContain('Architect');
    expect(names).toContain('CodeCraft');
    expect(names).toContain('Reviewer');
    expect(names).toContain('BugHunter');
    expect(names).toContain('Scout');
  });

  it('should get subagent by name case-insensitively', () => {
    const architect = getSubagent('architect');
    expect(architect).not.toBeNull();
    expect(architect?.name).toBe('Architect');
    expect(architect?.modelId).toBe('kimi-k3:max');
    expect(architect?.role).toContain('Architect');

    const coder = getSubagent('CodeCraft');
    expect(coder?.modelId).toBe('glm-5-3-flash');
  });
});
