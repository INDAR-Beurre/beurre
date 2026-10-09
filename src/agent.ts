import { loadConfig } from './config.ts';
import { relay, extractToolCallsFromContent, type ChatMessage } from './relay.ts';
import { createOmpTools } from './tools.ts';
import { runHook } from './features2.ts';
import { Agent as OmpAgent, type AgentEvent, type AgentMessage, type AgentToolResult } from '@oh-my-pi/pi-agent-core';
import type { AssistantMessage, Effort, Message, Model } from '@oh-my-pi/pi-ai';

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is { type: 'text'; text: string } => {
      return Boolean(block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string');
    })
    .map((block) => block.text)
    .join('');
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toOmpMessage(message: ChatMessage, model: Model): Message | null {
  const timestamp = Date.now();
  if (message.role === 'system') return null;
  if (message.role === 'user') {
    return { role: 'user', content: message.content, timestamp };
  }
  if (message.role === 'tool') {
    return {
      role: 'toolResult',
      toolCallId: message.tool_call_id || `legacy_${timestamp}`,
      toolName: message.name || 'tool',
      content: [{ type: 'text', text: message.content }],
      isError: false,
      timestamp,
    };
  }

  const content: AssistantMessage['content'] = [];
  if (message.content) content.push({ type: 'text', text: message.content });
  for (const call of message.tool_calls || []) {
    content.push({
      type: 'toolCall',
      id: call.id,
      name: call.function.name,
      arguments: parseToolArguments(call.function.arguments),
    });
  }
  return {
    role: 'assistant',
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: EMPTY_USAGE,
    stopReason: message.tool_calls?.length ? 'toolUse' : 'stop',
    timestamp,
  };
}

function toChatMessage(message: AgentMessage): ChatMessage | null {
  if (message.role === 'user') {
    return { role: 'user', content: textFromContent(message.content) };
  }
  if (message.role === 'assistant') {
    const text = textFromContent(message.content);
    const toolCalls = message.content
      .filter((block): block is Extract<AssistantMessage['content'][number], { type: 'toolCall' }> => block.type === 'toolCall')
      .map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      }));
    return {
      role: 'assistant',
      content: text,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
  }
  if (message.role === 'toolResult') {
    return {
      role: 'tool',
      name: message.toolName,
      tool_call_id: message.toolCallId,
      content: textFromContent(message.content),
    };
  }
  // Developer messages are an OMP-internal compatibility detail. They are
  // already present in the embedded agent's context and do not belong in the
  // legacy cloud/session projection.
  return null;
}

export interface AgentCallbacks {
  onToken?: (token: string) => void;
  onReasoning?: (reasoning: string) => void;
  onToolStart?: (name: string, args: Record<string, any>) => void;
  onToolOutput?: (chunk: string) => void;
  onToolEnd?: (name: string, output: string, isError?: boolean, diff?: string) => void;
  onStatus?: (status: string) => void;
}

export interface AgentOptions {
  model?: string;
  effort?: string;
  cwd?: string;
  sessionId?: string;
  autoSync?: boolean;
}

export class BeurreAgent {
  private config = loadConfig();
  private cwd: string;
  private currentModel: string;
  private effort: string = 'high';
  private sessionId: string;
  private autoSync: boolean;
  private steeringQueue: string[] = [];
  private isRunningTurn: boolean = false;
  private readonly ompAgent: OmpAgent;
  private activeCallbacks: AgentCallbacks | null = null;
  private activeResponse = '';
  private activeError: string | null = null;
  private readonly systemPrompt: string;

  constructor(options: AgentOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.currentModel = options.model || this.config.defaultModel;
    if (options.effort) {
      this.effort = options.effort;
    } else if (this.currentModel.includes(':')) {
      this.effort = this.currentModel.split(':')[1];
    }
    this.sessionId = options.sessionId || `beurre_${Date.now()}`;
    this.autoSync = options.autoSync ?? this.config.autoSync;

    const systemPrompt = `You are Beurre (🧈), an autonomous agentic AI coding assistant running locally on the user's computer.
You are directly integrated with the local machine, filesystem, and Cloudflare Relay Gateway.

CRITICAL DIRECT ACTION & FILESYSTEM CAPABILITY:
- You have DIRECT, FULL write and execution access to the user's filesystem and shell via your tools!
- NEVER say "I cannot save files to your computer", "I cannot create files", or tell the user to manually copy/paste code!
- Whenever the user asks you to save, create, write, or download anything (e.g. index.html, scripts, configs, documentation), YOU MUST IMMEDIATELY INVOKE THE "write" OR "edit" TOOL TO SAVE THE FILE DIRECTLY TO DISK!
- Example: If the user says "can u save it to my computer?", do NOT output conversational apologies. Instead, output the tool call to save the file right away!

MULTIMODAL & IMAGE MODEL ADVANTAGE:
When planning implementations, building user interfaces, or addressing design and visual tasks, you should actively leverage image and vision models to your advantage:
1. Generating Visual Assets: You have access to the "generate_image" tool and the "Visionary" subagent. Use them to generate logos, UI mockups, icons, banners, textures, game assets, and marketing graphics directly saved to disk (e.g. assets/logo.png).
2. Code-First Visuals: When vector or component rendering is preferred, you can generate clean, high-performance SVGs, HTML5 canvas graphics, CSS art, and Mermaid diagrams directly in code.
3. Multimodal Analysis: When analyzing mockups, screenshots, wireframes, or complex visual layouts, delegate to vision models (GPT-4o, Claude 3.7 Sonnet, Gemini 2.5 Pro) via the "Visionary" subagent to interpret pixel layouts and translate them into production-ready code.

Available tools:
- read(path: string, offset?: number, limit?: number): Inspect file content with line numbers.
- write(path: string, content: string): Create new files or completely overwrite existing files.
- edit(path: string, oldText: string, newText: string): Make precise surgical text replacements (oldText -> newText).
- bash(command: string): Execute shell commands, tests, and build scripts.
- web_search(query: string): Search the live web via Relay for documentation, packages, and troubleshooting.
- generate_image(prompt: string, outputPath?: string, size?: string): Generate images via AI image models and save them locally.
- subagent_run(subagent: string, task: string): Delegate specialized tasks to named subagents (Architect, CodeCraft, Reviewer, BugHunter, Scout, Visionary).

TOOL INVOCATION FORMAT:
If native function calling is available, use it.
If you are operating as a chat model without native function calling support (e.g. Claude Opus 5.5 proxy, GPT-6 Astra proxy), you MUST invoke tools using XML or code blocks:

Format A (XML):
<tool_call>
<name>tool_name</name>
<arguments>
{"param1": "value1"}
</arguments>
</tool_call>

Format B (Anthropic Invoke):
<invoke name="tool_name">
<parameter name="param1">value1</parameter>
</invoke>

Format C (Markdown Block):
\`\`\`tool_call
{"name": "tool_name", "arguments": {"param1": "value1"}}
\`\`\`

Guidelines:
- When asked to save or create files, ALWAYS call the "write" tool immediately.
- Inspect files with "read" before making edits.
- Use "edit" with unique target blocks for safe modifications.
- Test your changes using "bash" before concluding.
- Delegate complex subproblems to named subagents using "subagent_run" with their specific model capabilities.
- Be concise, direct, and pragmatic.

CRITICAL AGENT CHANGE-TRACKING PROTOCOL (HIGHEST PRIORITY):
- AGENTS.md at the project root is the living source of truth for all AI models & coding agents working on Beurre.
- WHENEVER you make any code modifications, bug fixes, feature additions, or architectural changes to the codebase, YOU MUST ALSO UPDATE/APPEND that change information to AGENTS.md (under the "## 📝 Changelog & Code Modifications" section).
- Record the exact files touched, the substance and rationale of the changes, and verification test outcomes.
- This ensures all future models, tools, and subagents reading AGENTS.md will instantly know what changes were made and how the codebase currently works!`;

    this.systemPrompt = systemPrompt;
    this.ompAgent = new OmpAgent({
      initialState: {
        systemPrompt: [systemPrompt],
        model: relay.buildChatModel(this.currentModel),
        tools: createOmpTools(this.cwd, () => ({
          onOutput: (chunk) => this.activeCallbacks?.onToolOutput?.(chunk),
        })),
      },
      cwd: this.cwd,
      sessionId: this.sessionId,
      getApiKey: () => relay.getApiKey() || undefined,
      beforeToolCall: (context) => {
        const pre = runHook('pre-tool', context.tool.name, { tool_input: context.args });
        return pre.denied ? { block: true, reason: pre.reason || 'blocked by a pre-tool hook' } : undefined;
      },
      afterToolCall: (context) => this.decorateToolResult(context.toolCall.name, context.result, context.args),
      transformAssistantMessage: (message) => this.recoverTextToolCalls(message),
    });
    this.ompAgent.setThinkingLevel(this.effort as Effort);
    this.ompAgent.subscribe((event) => this.handleOmpEvent(event));
  }

  getMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (this.ompAgent.state.systemPrompt.length > 0) {
      messages.push({ role: 'system', content: this.ompAgent.state.systemPrompt.join('\n\n') });
    }
    for (const message of this.ompAgent.state.messages) {
      const projected = toChatMessage(message);
      if (projected) messages.push(projected);
    }
    return messages;
  }

  setMessages(messages: ChatMessage[]) {
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content);
    if (system.length > 0) this.ompAgent.setSystemPrompt(system);
    const model = this.ompAgent.state.model;
    const converted = messages
      .filter((message) => message.role !== 'system')
      .map((message) => toOmpMessage(message, model))
      .filter((message): message is Message => message !== null);
    this.ompAgent.clearAllQueues();
    this.ompAgent.replaceMessages(converted);
  }

  getModel(): string {
    return this.currentModel;
  }

  setModel(modelId: string) {
    this.currentModel = modelId;
    if (modelId.includes(':')) {
      this.effort = modelId.split(':')[1];
    }
    this.ompAgent.setModel(relay.buildChatModel(modelId));
    this.ompAgent.setThinkingLevel(this.effort as Effort);
  }

  getEffort(): string {
    return this.effort;
  }

  setEffort(effort: string) {
    this.effort = effort;
    this.ompAgent.setThinkingLevel(effort as Effort);
  }

  getCwd(): string {
    return this.cwd;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
    this.ompAgent.sessionId = id;
  }

  resetSession(newModel?: string): string {
    this.sessionId = `beurre_${Date.now()}`;
    if (newModel) {
      this.setModel(newModel);
    }
    this.ompAgent.reset();
    this.ompAgent.setSystemPrompt([this.systemPrompt]);
    this.ompAgent.sessionId = this.sessionId;
    this.steeringQueue = [];
    return this.sessionId;
  }

  steer(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    this.steeringQueue.push(trimmed);
    this.ompAgent.steer({ role: 'user', content: trimmed, steering: true, timestamp: Date.now() });
  }

  getSteeringQueue(): string[] {
    return [...this.steeringQueue];
  }

  isTurnRunning(): boolean {
    return this.isRunningTurn || this.ompAgent.state.isStreaming;
  }

  async runTurn(prompt: string, callbacks: AgentCallbacks = {}, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return '';

    this.isRunningTurn = true;
    this.activeCallbacks = callbacks;
    this.activeResponse = '';
    this.activeError = null;
    callbacks.onStatus?.('🧈 Whipping up solution...');

    const onAbort = () => this.ompAgent.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      await this.ompAgent.prompt(prompt);
      if (this.activeError && !signal?.aborted) {
        throw new Error(this.activeError);
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      this.isRunningTurn = false;
      this.activeCallbacks = null;
    }

    if (this.autoSync) {
      void relay.syncSessionToWeb({
        id: this.sessionId,
        title: prompt.slice(0, 50),
        history: this.getMessages(),
      });
    }

    return this.activeResponse;
  }

  private handleOmpEvent(event: AgentEvent): void {
    const callbacks = this.activeCallbacks;
    if (!callbacks) return;

    switch (event.type) {
      case 'agent_start':
        callbacks.onStatus?.('🧈 Whipping up solution...');
        break;
      case 'message_start':
      case 'message_end':
        if (event.message.role === 'user' && event.message.steering) {
          const text = textFromContent(event.message.content).trim();
          const index = this.steeringQueue.indexOf(text);
          if (index >= 0) this.steeringQueue.splice(index, 1);
        }
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          const text = textFromContent(event.message.content);
          if (text) this.activeResponse = text;
          if (event.message.stopReason === 'error') {
            this.activeError = event.message.errorMessage || 'Relay model request failed';
          }
        }
        break;
      case 'message_update': {
        const streamed = event.assistantMessageEvent;
        if (streamed.type === 'text_delta') {
          this.activeResponse += streamed.delta;
          callbacks.onToken?.(streamed.delta);
        } else if (streamed.type === 'thinking_delta') {
          callbacks.onReasoning?.(streamed.delta);
        }
        break;
      }
      case 'tool_execution_start':
        callbacks.onToolStart?.(event.toolName, event.args || {});
        break;
      case 'tool_execution_update': {
        const text = textFromContent(event.partialResult?.content);
        if (text) callbacks.onToolOutput?.(text);
        break;
      }
      case 'tool_execution_end': {
        const output = textFromContent(event.result?.content);
        const diff = event.result?.details?.diff;
        callbacks.onToolEnd?.(event.toolName, output, event.isError || event.result?.isError, diff);
        break;
      }
      case 'turn_end':
        if (event.message.role === 'assistant' && event.message.stopReason === 'error') {
          this.activeError = event.message.errorMessage || 'Relay model request failed';
        }
        break;
      case 'agent_end':
        callbacks.onStatus?.('Task complete.');
        break;
    }
  }

  private recoverTextToolCalls(message: AssistantMessage): void {
    const text = textFromContent(message.content);
    if (!text) return;
    const parsed = extractToolCallsFromContent(text);
    if (parsed.toolCalls.length === 0) return;

    const preserved = message.content.filter((block) => block.type !== 'text');
    if (parsed.cleanedContent) preserved.unshift({ type: 'text', text: parsed.cleanedContent });
    for (const call of parsed.toolCalls) {
      preserved.push({ type: 'toolCall', id: call.id, name: call.name, arguments: call.arguments });
    }
    message.content = preserved;
    message.stopReason = 'toolUse';
  }

  private decorateToolResult(
    toolName: string,
    result: AgentToolResult,
    args: Record<string, unknown>,
  ): { content?: AgentToolResult['content']; details?: unknown; isError?: boolean } | undefined {
    const output = textFromContent(result.content);
    let extra = '';
    if (!result.isError && (toolName === 'write' || toolName === 'edit')) {
      const targetPath = typeof args.path === 'string' ? args.path : '';
      if (!targetPath.endsWith('AGENTS.md') && !targetPath.endsWith('CLAUDE.md') && !targetPath.endsWith('PROJECT.md')) {
        extra += '\n\n[PROTOCOL REMINDER: You modified project code. You must also update AGENTS.md (under ## 📝 Changelog & Code Modifications) with the details of your changes before completing your task!]';
      }
    }

    const post = runHook('post-tool', toolName, { tool_input: args, is_error: result.isError });
    if (post.output.trim()) extra += `\n\n[hook] ${post.output.trim()}`;
    if (!extra) return undefined;

    return {
      content: [{ type: 'text', text: `${output}${extra}` }],
      details: result.details,
      isError: result.isError,
    };
  }
}
