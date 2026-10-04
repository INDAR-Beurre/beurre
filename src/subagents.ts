import { loadConfig, type SubagentConfig } from './config.ts';
import { relay, type ChatMessage } from './relay.ts';
import { BEURRE_TOOLS, executeTool } from './tools.ts';
import { b, colors } from './theme.ts';

export interface SubagentExecutionResult {
  subagentName: string;
  modelId: string;
  summary: string;
  turns: number;
}

export function listSubagents(): SubagentConfig[] {
  const config = loadConfig();
  return Object.values(config.subagents);
}

export function getSubagent(name: string): SubagentConfig | null {
  const config = loadConfig();
  const found = Object.values(config.subagents).find(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  );
  return found || null;
}

export async function runNamedSubagent(
  name: string,
  task: string,
  cwd: string,
  signal?: AbortSignal
): Promise<SubagentExecutionResult> {
  const subagent = getSubagent(name);
  if (!subagent) {
    const available = listSubagents().map((s) => s.name).join(', ');
    throw new Error(`Subagent "${name}" not found. Available subagents: ${available}`);
  }

  const modelId = subagent.modelId;

  // The system prompt explicitly embeds the subagent's name and model ID
  const systemPrompt = `You are "${subagent.name}", a specialized AI subagent.
Role: ${subagent.role}
Designated Model ID: ${modelId}
Capabilities: ${subagent.description}

You have been dispatched to solve a subtask by the primary Beurre agent.
Act decisively, execute necessary tools, and conclude with a crisp, actionable summary.
Do not invoke other subagents recursively.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ];

  // Subagents have access to core tools except recursive subagents
  const subagentTools = BEURRE_TOOLS.filter((t) => t.function.name !== 'subagent_run');

  let turns = 0;
  const maxTurns = 8;
  let finalSummary = '';

  while (turns < maxTurns) {
    turns++;
    if (signal?.aborted) break;

    const res = await relay.streamChatCompletion({
      model: modelId,
      messages,
      tools: subagentTools,
      signal,
    });

    if (res.content) {
      finalSummary = res.content;
    }

    if (!res.toolCalls || res.toolCalls.length === 0) {
      // Completed response without tools
      break;
    }

    // Execute tool calls
    messages.push({
      role: 'assistant',
      content: res.content || '',
      tool_calls: res.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.rawArguments,
        },
      })),
    });

    for (const tc of res.toolCalls) {
      const toolRes = await executeTool(tc.id, tc.name, tc.arguments, { cwd, signal });
      messages.push({
        role: 'tool',
        name: tc.name,
        tool_call_id: tc.id,
        content: toolRes.output,
      });
    }
  }

  return {
    subagentName: subagent.name,
    modelId,
    summary: finalSummary.trim() || `Subagent ${subagent.name} completed execution in ${turns} turns.`,
    turns,
  };
}
