import { loadConfig } from './config.ts';
import { relay, type ChatCompletionResult, type ChatMessage } from './relay.ts';
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
  effort?: string;
  cwd?: string;
  sessionId?: string;
  autoSync?: boolean;
}

export class BeurreAgent {
  private config = loadConfig();
  private messages: ChatMessage[] = [];
  private cwd: string;
  private currentModel: string;
  private effort: string = 'high';
  private sessionId: string;
  private autoSync: boolean;
  private steeringQueue: string[] = [];
  private currentStepAbortController: AbortController | null = null;
  private isRunningTurn: boolean = false;

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
    if (modelId.includes(':')) {
      this.effort = modelId.split(':')[1];
    }
  }

  getEffort(): string {
    return this.effort;
  }

  setEffort(effort: string) {
    this.effort = effort;
  }

  getCwd(): string {
    return this.cwd;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
  }

  resetSession(newModel?: string): string {
    this.sessionId = `beurre_${Date.now()}`;
    if (newModel) {
      this.setModel(newModel);
    }
    const system = this.messages.find((m) => m.role === 'system');
    this.messages = system ? [system] : [];
    return this.sessionId;
  }

  steer(message: string): void {
    const trimmed = message.trim();
    if (!trimmed) return;
    this.steeringQueue.push(trimmed);
    if (this.currentStepAbortController) {
      this.currentStepAbortController.abort('steer');
    }
  }

  getSteeringQueue(): string[] {
    return [...this.steeringQueue];
  }

  isTurnRunning(): boolean {
    return this.isRunningTurn;
  }

  async runTurn(prompt: string, callbacks: AgentCallbacks = {}, signal?: AbortSignal): Promise<string> {
    this.messages.push({ role: 'user', content: prompt });
    this.isRunningTurn = true;

    let finalResponse = '';
    let turnCount = 0;
    const maxTurns = 25;

    try {
      while (turnCount < maxTurns) {
        turnCount++;
        if (signal?.aborted) break;

        // Drain any pending steering messages before starting completion
        const pendingSteer: string[] = [];
        while (this.steeringQueue.length > 0) {
          pendingSteer.push(this.steeringQueue.shift()!);
        }
        if (pendingSteer.length > 0) {
          callbacks.onStatus?.('Steering agent...');
          const combined = pendingSteer.join('\n\n');
          if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'user') {
            this.messages[this.messages.length - 1].content += '\n\n' + combined;
          } else {
            this.messages.push({ role: 'user', content: combined });
          }
        }

        callbacks.onStatus?.('🧈 Whipping up solution...');

        // Step abort controller chained to outer signal
        this.currentStepAbortController = new AbortController();
        const stepSignal = this.currentStepAbortController.signal;
        const onOuterAbort = () => this.currentStepAbortController?.abort();
        signal?.addEventListener('abort', onOuterAbort, { once: true });

        let assistantContent = '';
        let result: ChatCompletionResult | null = null;
        let wasSteered = false;

        try {
          result = await relay.streamChatCompletion({
            model: this.currentModel,
            effort: this.effort,
            messages: this.messages,
            tools: BEURRE_TOOLS,
            signal: stepSignal,
            onToken: (tok) => {
              assistantContent += tok;
              callbacks.onToken?.(tok);
            },
            onReasoning: (res) => {
              callbacks.onReasoning?.(res);
            },
          });
        } catch (err: unknown) {
          if (signal?.aborted) {
            throw err;
          }
          if (stepSignal.aborted && (this.steeringQueue.length > 0 || stepSignal.reason === 'steer')) {
            wasSteered = true;
          } else {
            throw err;
          }
        } finally {
          signal?.removeEventListener('abort', onOuterAbort);
          this.currentStepAbortController = null;
        }

        if (wasSteered || this.steeringQueue.length > 0) {
          if (assistantContent.trim()) {
            this.messages.push({
              role: 'assistant',
              content: assistantContent,
            });
          } else if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'user') {
            this.messages.push({
              role: 'assistant',
              content: '[Turn interrupted by user steering before response generation]',
            });
          }
          const steerMsgs: string[] = [];
          while (this.steeringQueue.length > 0) {
            steerMsgs.push(this.steeringQueue.shift()!);
          }
          if (steerMsgs.length > 0) {
            this.messages.push({ role: 'user', content: steerMsgs.join('\n\n') });
          }
          callbacks.onStatus?.('Steering agent...');
          continue;
        }

        if (!result) break;

        finalResponse = assistantContent || result.content;

        if (!result.toolCalls || result.toolCalls.length === 0) {
          // Model concluded turn without further tool calls
          this.messages.push({
            role: 'assistant',
            content: finalResponse,
          });

          // Check if user steered right at the end of turn
          if (this.steeringQueue.length > 0) {
            const steerMsgs: string[] = [];
            while (this.steeringQueue.length > 0) {
              steerMsgs.push(this.steeringQueue.shift()!);
            }
            if (steerMsgs.length > 0) {
              this.messages.push({ role: 'user', content: steerMsgs.join('\n\n') });
            }
            continue;
          }

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

          let toolMessageContent = toolRes.output;
          if (!toolRes.isError && (tc.name === 'write' || tc.name === 'edit')) {
            const targetPath = tc.arguments?.path || '';
            if (
              !targetPath.endsWith('AGENTS.md') &&
              !targetPath.endsWith('CLAUDE.md') &&
              !targetPath.endsWith('PROJECT.md')
            ) {
              toolMessageContent += '\n\n[PROTOCOL REMINDER: You modified project code. You must also update AGENTS.md (under ## 📝 Changelog & Code Modifications) with the details of your changes before completing your task!]';
            }
          }

          this.messages.push({
            role: 'tool',
            name: tc.name,
            tool_call_id: tc.id,
            content: toolMessageContent,
          });
        }

        // After tool calls, inject any steering messages queued during tool execution
        if (this.steeringQueue.length > 0) {
          const steerMsgs: string[] = [];
          while (this.steeringQueue.length > 0) {
            steerMsgs.push(this.steeringQueue.shift()!);
          }
          if (steerMsgs.length > 0) {
            this.messages.push({ role: 'user', content: steerMsgs.join('\n\n') });
          }
        }
      }
    } finally {
      this.isRunningTurn = false;
      this.currentStepAbortController = null;
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
