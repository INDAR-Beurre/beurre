/**
 * Beurre's seam onto the omp engine (`@oh-my-pi/pi-ai`).
 *
 * Only two transports are used, both pointed at the Relay Gateway: the
 * `openai-completions` chat path and the `openai-images` generation path.
 * The rest of pi-ai (provider registry, OAuth flows, other vendors) is never
 * called, so only the modules these two paths need are pulled in.
 */
import { generateImage, streamSimple, type AssistantMessage, type Context, type Message, type Tool } from '@oh-my-pi/pi-ai';
import { buildModel } from '@oh-my-pi/pi-catalog/build';
import type { Effort } from '@oh-my-pi/pi-catalog/effort';
import type { Model } from '@oh-my-pi/pi-catalog/types';
import type { ChatMessage, ToolCallItem, ToolSchema } from './relay.ts';

export const RELAY_PROVIDER = 'relay';

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** A relay chat model. The id stays provider-qualified (`yjs/glm-5-3-flash`); pi-ai sends it verbatim. */
export function buildRelayChatModel(id: string, baseUrl: string, headers: Record<string, string>): Model<'openai-completions'> {
  return buildModel({
    id,
    name: id,
    api: 'openai-completions',
    provider: RELAY_PROVIDER,
    baseUrl,
    headers,
    reasoning: true,
    input: ['text'],
    cost: ZERO_COST,
    contextWindow: null,
    maxTokens: null,
  });
}

/** A relay image model served through the OpenAI-compatible `/images/generations` route. */
export function buildRelayImageModel(id: string, baseUrl: string, headers: Record<string, string>): Model<'openai-images'> {
  return buildModel({
    id,
    name: id,
    api: 'openai-images',
    provider: RELAY_PROVIDER,
    baseUrl,
    headers,
    reasoning: false,
    input: ['text'],
    cost: ZERO_COST,
    contextWindow: null,
    maxTokens: null,
  });
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { raw };
  } catch {
    return { raw };
  }
}

function toPiTool(tool: ToolSchema): Tool {
  return {
    name: tool.function.name,
    description: tool.function.description ?? '',
    // Boundary cast: beurre tool schemas are plain JSON Schema objects, which is what pi-ai's TSchema carries at runtime.
    parameters: tool.function.parameters as Tool['parameters'],
  };
}

/** Convert beurre's OpenAI-shaped history into a pi-ai context. */
export function toPiContext(messages: ChatMessage[], tools?: ToolSchema[]): Context {
  const system: string[] = [];
  const out: Message[] = [];
  const toolNames = new Map<string, string>();
  const now = Date.now();

  for (const message of messages) {
    if (message.role === 'system') {
      system.push(message.content);
      continue;
    }
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.content, timestamp: now });
      continue;
    }
    if (message.role === 'assistant') {
      const content: AssistantMessage['content'] = [];
      if (message.content) {
        content.push({ type: 'text', text: message.content });
      }
      for (const call of message.tool_calls ?? []) {
        toolNames.set(call.id, call.function.name);
        content.push({
          type: 'toolCall',
          id: call.id,
          name: call.function.name,
          arguments: parseToolArgs(call.function.arguments),
        });
      }
      out.push({
        role: 'assistant',
        content,
        api: 'openai-completions',
        provider: RELAY_PROVIDER,
        model: '',
        usage: EMPTY_USAGE,
        stopReason: message.tool_calls?.length ? 'toolUse' : 'stop',
        timestamp: now,
      });
      continue;
    }
    // Tool results.
    const toolCallId = message.tool_call_id ?? '';
    out.push({
      role: 'toolResult',
      toolCallId,
      toolName: message.name ?? toolNames.get(toolCallId) ?? 'tool',
      content: [{ type: 'text', text: message.content }],
      isError: false,
      timestamp: now,
    });
  }

  return {
    systemPrompt: system.length > 0 ? system : undefined,
    messages: out,
    tools: tools?.map(toPiTool),
  };
}

export interface RelayStreamOptions {
  model: Model<'openai-completions'>;
  context: Context;
  apiKey: string;
  signal?: AbortSignal;
  effort?: string;
  onToken?: (token: string) => void;
  onReasoning?: (reasoning: string) => void;
}

export interface RelayStreamResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCallItem[];
}

/** Run one streamed chat turn and collect its text, reasoning and native tool calls. Throws on provider error. */
export async function streamRelayCompletion(options: RelayStreamOptions): Promise<RelayStreamResult> {
  const stream = streamSimple(options.model, options.context, {
    apiKey: options.apiKey || undefined,
    signal: options.signal,
    reasoning: options.effort as Effort | undefined,
  });

  let content = '';
  let reasoning = '';
  const toolCalls: ToolCallItem[] = [];

  for await (const event of stream) {
    switch (event.type) {
      case 'text_delta':
        content += event.delta;
        options.onToken?.(event.delta);
        break;
      case 'thinking_delta':
        reasoning += event.delta;
        options.onReasoning?.(event.delta);
        break;
      case 'toolcall_end':
        toolCalls.push({
          id: event.toolCall.id,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
          rawArguments: JSON.stringify(event.toolCall.arguments),
        });
        break;
      case 'error':
        throw new Error(event.error.errorMessage || 'Relay stream failed');
    }
  }

  const final = await stream.result();
  if (final.stopReason === 'aborted') {
    throw new Error('Operation aborted');
  }
  return { content, reasoning, toolCalls };
}

export interface RelayImageOptions {
  model: Model<'openai-images'>;
  prompt: string;
  size: string;
  apiKey: string;
  signal?: AbortSignal;
}

/** Generate one image through pi-ai. Returns base64 data and its MIME type, or null when the provider returned none. */
export async function generateRelayImage(options: RelayImageOptions): Promise<{ b64: string; mimeType: string } | null> {
  const result = await generateImage(
    options.model,
    { prompt: options.prompt, imageSize: options.size, count: 1 },
    { apiKey: options.apiKey, signal: options.signal },
  );
  const first = result.images[0];
  return first ? { b64: first.data, mimeType: first.mimeType } : null;
}
