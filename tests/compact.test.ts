import { describe, expect, it } from 'bun:test';
import { compactMessages } from '../src/compact.ts';
import type { ChatMessage } from '../src/relay.ts';

describe('Butter Melt Context Compactor', () => {
  it('should compact multi-turn history into a structured summary', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are Beurre.' },
      { role: 'user', content: 'Create index.ts and run test' },
      {
        role: 'assistant',
        content: 'I will write the file.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'write',
              arguments: JSON.stringify({ path: 'src/index.ts', content: 'console.log("hi");' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        name: 'write',
        tool_call_id: 'call_1',
        content: 'Successfully wrote to src/index.ts',
      },
      {
        role: 'assistant',
        content: 'Now running tests.',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'bash',
              arguments: JSON.stringify({ command: 'bun test' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        name: 'bash',
        tool_call_id: 'call_2',
        content: '5 passing',
      },
      {
        role: 'assistant',
        content: 'All tests passed cleanly.',
      },
    ];

    const prompt = 'Repeat check and improve coverage.';
    const compacted = compactMessages(messages, { iteration: 1, prompt });

    // Should contain system message + user compacted message
    expect(compacted.length).toBe(2);
    expect(compacted[0].role).toBe('system');
    expect(compacted[1].role).toBe('user');

    const content = compacted[1].content;
    expect(content).toContain('BEURRE CONTEXT MELT');
    expect(content).toContain('src/index.ts');
    expect(content).toContain('bun test');
    expect(content).toContain('Repeat check and improve coverage.');
  });

  it('should format clean summary without loop iteration header in interactive REPL mode', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are Beurre.' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'what is 2+2?' },
      { role: 'assistant', content: '4' },
    ];
    const compacted = compactMessages(messages, { isLoop: false });
    expect(compacted.length).toBe(2);
    expect(compacted[1].content).toContain('Active Session Compacted');
    expect(compacted[1].content).not.toContain('Recurring Prompt for Loop');
  });
});
