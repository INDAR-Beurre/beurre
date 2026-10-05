import { describe, expect, it } from 'bun:test';
import { extractToolCallsFromContent, getModelDisplayName } from '../src/relay.ts';
import { BEURRE_TOOLS } from '../src/tools.ts';
import { getSubagent } from '../src/subagents.ts';
import { colors, formatUserMessageCard, formatAgentHeader, formatToolCall } from '../src/theme.ts';

describe('Tool Prompting & Chat-Proxied Response Parsing Engine', () => {
  it('should parse XML <tool_call> tags and strip them from content', () => {
    const raw = `I will read the file now.\n<tool_call>\n<name>read</name>\n<arguments>{"path":"src/index.ts"}</arguments>\n</tool_call>\nDone reading.`;
    const { toolCalls, cleanedContent } = extractToolCallsFromContent(raw);

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('read');
    expect(toolCalls[0].arguments.path).toBe('src/index.ts');
    expect(cleanedContent).not.toContain('<tool_call>');
    expect(cleanedContent).toContain('I will read the file now.');
    expect(cleanedContent).toContain('Done reading.');
  });

  it('should parse Anthropic <invoke> tags with parameters', () => {
    const raw = `Let me run the test suite.\n<invoke name="bash">\n<parameter name="command">bun test</parameter>\n</invoke>`;
    const { toolCalls, cleanedContent } = extractToolCallsFromContent(raw);

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('bash');
    expect(toolCalls[0].arguments.command).toBe('bun test');
    expect(cleanedContent).not.toContain('<invoke');
  });

  it('should parse Markdown ```tool_call code blocks', () => {
    const raw = 'Calling subagent:\n```tool_call\n{"name": "subagent_run", "arguments": {"subagent": "Architect", "task": "Plan db schema"}}\n```';
    const { toolCalls, cleanedContent } = extractToolCallsFromContent(raw);

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].name).toBe('subagent_run');
    expect(toolCalls[0].arguments.subagent).toBe('Architect');
    expect(cleanedContent).not.toContain('```tool_call');
  });

  it('should return human-friendly display names for models', () => {
    expect(getModelDisplayName('claude-opus-5-5')).toBe('Claude Opus 5.5');
    expect(getModelDisplayName('glm-5-3-flash')).toBe('GLM 5.3 Flash');
    expect(getModelDisplayName('gpt-6-astra')).toBe('GPT-6 Astra');
    expect(getModelDisplayName('kimi-k3:max')).toBe('Kimi K3 (Max)');
  });

  it('should include generate_image tool in BEURRE_TOOLS', () => {
    const imgTool = BEURRE_TOOLS.find((t) => t.function.name === 'generate_image');
    expect(imgTool).toBeDefined();
    expect(imgTool?.function.parameters.properties.prompt).toBeDefined();
  });

  it('should include Visionary subagent specializing in image & vision models', () => {
    const visionary = getSubagent('Visionary');
    expect(visionary).toBeDefined();
    expect(visionary?.name).toBe('Visionary');
    expect(visionary?.modelId).toBe('gpt-4o');
    expect(visionary?.role).toContain('Multimodal');
  });

  it('should render distinct high-contrast user message cards and agent headers', () => {
    const userCard = formatUserMessageCard('Can you design the dashboard?');
    expect(userCard).toContain(`${colors.dim}YOU${colors.reset}`);
    expect(userCard).toContain('Can you design the dashboard?');

    const agentHeader = formatAgentHeader('claude-opus-5-5', 'high');
    expect(agentHeader).toContain('Claude Opus 5.5');
    expect(agentHeader).toContain('BEURRE');
    expect(agentHeader).toContain('high');
  });

  it('should render tool names with distinct colours and no leading icons', () => {
    for (const [name, label, color] of [
      ['bash', 'Bash', colors.toolBash],
      ['read', 'Read', colors.toolRead],
      ['write', 'Write', colors.toolWrite],
      ['edit', 'Edit', colors.toolEdit],
      ['web_search', 'Search', colors.toolSearch],
      ['subagent_run', 'Subagent', colors.toolSubagent],
      ['generate_image', 'ImageGen', colors.toolImage],
    ]) {
      const call = formatToolCall(name, {});
      expect(call.startsWith(`${colors.bold}${color}${label}${colors.reset}(`)).toBe(true);
    }
  });
});
