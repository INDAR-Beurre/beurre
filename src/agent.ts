import { loadConfig } from './config.ts';
import { relay, type ChatMessage } from './relay.ts';
import { BEURRE_TOOLS, executeTool, type ToolResult } from './tools.ts';
import { b, colors } from './theme.ts';

export interface AgentCallbacks {
  onToken?: (token: string) => void;
  onReasoning?: (reasoning: string) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onToolEnd?: (name: string, output: string, isError?: boolean, diff?: string) => void;
  onStatus?: (status: string) => void;
}

export interface AgentOptions {
  model?: string;
  cwd?: string;
  sessionId?: string;
  autoSync?: boolean;
}

export class BeurreAgent {
  private config = loadConfig();
  private messages: ChatMessage[] = [];
  private cwd: string;
  private currentModel: string;
  private sessionId: string;
  private autoSync: boolean;

  constructor(options: AgentOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.currentModel = options.model || this.config.defaultModel;
    this.sessionId = options.sessionId || `beurre_${Date.now()}`;
    this.autoSync = options.autoSync ?? this.config.autoSync;

    const systemPrompt = `You are Beurre (🧈), a buttery-smooth, highly capable autonomous agentic coding assistant.
You are directly integrated with the Model Aggregator and Cloudflare Relay Gateway.
Available tools:
- read: Inspect file content with line numbers.
- write: Create new files or completely overwrite existing files.
- edit: Make precise surgical text replacements (oldText -> newText).
- bash: Execute shell commands, tests, and build scripts.
- web_search: Search the live web via Relay for documentation, packages, and troubleshooting.
- subagent_run: Delegate specialized tasks to named subagents (Architect, CodeCraft, Reviewer, BugHunter, Scout).

Guidelines:
- Inspect files with "read" before making edits.
- Use "edit" with unique target blocks for safe modifications.
- Test your changes using "bash" before concluding.
- Delegate complex subproblems to named subagents using "subagent_run" with their specific model capabilities.
- Be concise, direct, and pragmatic.`;

    this.messages.push({ role: 'system', content: systemPrompt });
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  setMessages(messages: ChatMessage[]) {
    this.messages = messages;
  }

  getModel(): string {
    return this.currentModel;
  }

  setModel(modelId: string) {
    this.currentModel = modelId;
  }

  getCwd(): string {
    return this.cwd;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async runTurn(prompt: string, callbacks: AgentCallbacks = {}, signal?: AbortSignal): Promise<string> {
    this.messages.push({ role: 'user', content: prompt });

    let finalResponse = '';
    let turnCount = 0;
    const maxTurns = 25;

    while (turnCount < maxTurns) {
      turnCount++;
      if (signal?.aborted) break;

      callbacks.onStatus?.('🧈 Whipping up solution...');

      let assistantContent = '';
      const result = await relay.streamChatCompletion({
        model: this.currentModel,
        messages: this.messages,
        tools: BEURRE_TOOLS,
        signal,
        onToken: (tok) => {
          assistantContent += tok;
          callbacks.onToken?.(tok);
        },
        onReasoning: (res) => {
          callbacks.onReasoning?.(res);
        },
      });

      finalResponse = assistantContent || result.content;

      if (!result.toolCalls || result.toolCalls.length === 0) {
        // Model concluded turn without further tool calls
        this.messages.push({
          role: 'assistant',
          content: finalResponse,
        });
        break;
      }

      // Record assistant message with tool calls
      this.messages.push({
        role: 'assistant',
        content: finalResponse,
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.rawArguments,
          },
        })),
      });

      // Execute tool calls
      for (const tc of result.toolCalls) {
        if (signal?.aborted) break;

        callbacks.onToolStart?.(tc.name, tc.arguments);

        const toolRes = await executeTool(tc.id, tc.name, tc.arguments, {
          cwd: this.cwd,
          signal,
          onOutput: (chunk) => {
            // live tool streaming if needed
          },
        });

        callbacks.onToolEnd?.(tc.name, toolRes.output, toolRes.isError, toolRes.diff);

        this.messages.push({
          role: 'tool',
          name: tc.name,
          tool_call_id: tc.id,
          content: toolRes.output,
        });
      }
    }

    // Auto-sync session to Model Aggregator web app in background
    if (this.autoSync) {
      void relay.syncSessionToWeb({
        id: this.sessionId,
        title: prompt.slice(0, 50),
        history: this.messages,
      });
    }

    return finalResponse;
  }
}
