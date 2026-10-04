import { describe, expect, it } from 'bun:test';
import { BeurreAgent } from '../src/agent.ts';
import { compactMessages } from '../src/compact.ts';

describe('Loop Compaction Cycle Simulation', () => {
  it('should maintain stable message length over 10 simulated loop iterations', () => {
    const agent = new BeurreAgent({ autoSync: false });
    const recurringPrompt = 'Run verification and refactor';

    for (let iter = 1; iter <= 10; iter++) {
      // Simulate turns added during this iteration
      const current = agent.getMessages();
      current.push({ role: 'user', content: recurringPrompt });
      current.push({
        role: 'assistant',
        content: `Iteration ${iter} done. Added feature #${iter}.`,
        tool_calls: [
          {
            id: `call_${iter}`,
            type: 'function',
            function: {
              name: 'write',
              arguments: JSON.stringify({ path: `src/mod_${iter}.ts`, content: 'export default 1;' }),
            },
          },
        ],
      });
      current.push({
        role: 'tool',
        name: 'write',
        tool_call_id: `call_${iter}`,
        content: `Wrote src/mod_${iter}.ts`,
      });

      // Compactor runs
      const compacted = compactMessages(current, { iteration: iter, prompt: recurringPrompt });
      agent.setMessages(compacted);

      // Context size should stay strictly bounded (2 messages: system + compacted user prompt)
      expect(compacted.length).toBe(2);
      expect(compacted[1].content).toContain(`mod_${iter}.ts`);
    }

    const finalMessages = agent.getMessages();
    expect(finalMessages.length).toBe(2);
    expect(finalMessages[0].role).toBe('system');
    expect(finalMessages[1].role).toBe('user');
    expect(finalMessages[1].content).toContain('BEURRE CONTEXT MELT');
  });
});
