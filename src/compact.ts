import type { ChatMessage } from './relay.ts';

export interface CompactOptions {
  iteration: number;
  prompt: string;
}

export function compactMessages(messages: ChatMessage[], options: CompactOptions): ChatMessage[] {
  if (messages.length <= 3) {
    return messages;
  }

  const systemMsg = messages.find((m) => m.role === 'system');

  // Track operations from history
  const filesModified = new Set<string>();
  const filesRead = new Set<string>();
  const bashCommands: string[] = [];
  const subagentNotes: string[] = [];
  const assistantSummaries: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          try {
            const args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;

            if (tc.function.name === 'write' || tc.function.name === 'edit') {
              if (args.path) filesModified.add(args.path);
            } else if (tc.function.name === 'read') {
              if (args.path) filesRead.add(args.path);
            } else if (tc.function.name === 'bash') {
              if (args.command) bashCommands.push(args.command.slice(0, 100));
            } else if (tc.function.name === 'subagent_run') {
              if (args.subagent) subagentNotes.push(`${args.subagent}: ${args.task?.slice(0, 80)}`);
            }
          } catch {
            // ignore parse failure
          }
        }
      }
      if (msg.content && msg.content.trim()) {
        // Take the last sentence or first 200 chars of assistant thought
        const trimmed = msg.content.trim();
        const snippet = trimmed.length > 250 ? `${trimmed.slice(0, 250)}...` : trimmed;
        assistantSummaries.push(snippet);
      }
    }
  }

  const recentSummaries = assistantSummaries.slice(-3);
  const recentCommands = bashCommands.slice(-4);

  const lines: string[] = [
    `🧈 [BEURRE CONTEXT MELT — COMPACTION ROLLUP FOR ITERATION #${options.iteration}]`,
    `Previous loop iteration #${options.iteration} finished. Context has been compacted to preserve memory.`,
  ];

  if (filesModified.size > 0) {
    lines.push(`• Files Modified: ${Array.from(filesModified).join(', ')}`);
  }
  if (filesRead.size > 0) {
    lines.push(`• Files Inspected: ${Array.from(filesRead).join(', ')}`);
  }
  if (recentCommands.length > 0) {
    lines.push(`• Recent Commands Run:\n  - ${recentCommands.join('\n  - ')}`);
  }
  if (subagentNotes.length > 0) {
    lines.push(`• Subagents Dispatched:\n  - ${subagentNotes.join('\n  - ')}`);
  }
  if (recentSummaries.length > 0) {
    lines.push(`• Progress Summary from Previous Turn:\n${recentSummaries.map((s) => `  > ${s}`).join('\n')}`);
  }

  const compactedText = lines.join('\n');

  const newMessages: ChatMessage[] = [];
  if (systemMsg) {
    newMessages.push(systemMsg);
  }

  newMessages.push({
    role: 'user',
    content: `${compactedText}\n\n[Recurring Prompt for Loop Iteration #${options.iteration + 1}]:\n${options.prompt}`,
  });

  return newMessages;
}
