import dns from 'node:dns';
import { loadConfig, extractCookie } from './config.ts';

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

export interface RelayModel {
  id: string;
  name?: string;
  owned_by?: string;
  context_length?: number;
  max_completion_tokens?: number;
  reasoning?: boolean;
  capabilities?: string[];
  input_modalities?: string[];
  output_modalities?: string[];
}

export interface RelayProvider {
  id: string;
  name: string;
  has_key?: boolean;
  live?: boolean;
  models?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ChatCompletionOptions {
  model?: string;
  messages: ChatMessage[];
  tools?: any[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onReasoning?: (reasoning: string) => void;
}

export interface ChatCompletionResult {
  content: string;
  reasoning: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
    rawArguments: string;
  }>;
  model: string;
  finishReason?: string;
}

export class RelayClient {
  private config = loadConfig();
  private modelsCache: RelayModel[] | null = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 min TTL matching worker cron

  constructor() {
    this.config = loadConfig();
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const cookie = extractCookie(this.config.cookieFile);
    if (cookie) {
      headers.Cookie = cookie;
    } else if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  async fetchLiveModels(forceRefresh = false): Promise<RelayModel[]> {
    const now = Date.now();
    if (!forceRefresh && this.modelsCache && now < this.cacheExpiry) {
      return this.modelsCache;
    }

    const endpoints = [this.config.relayUrl, this.config.relayFallbackUrl].filter(Boolean);
    let lastError: Error | null = null;

    for (const baseUrl of endpoints) {
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: this.getAuthHeaders(),
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = (await res.json()) as any;
        const list: RelayModel[] = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
            ? data.data
            : [];

        if (list.length > 0) {
          this.modelsCache = list;
          this.cacheExpiry = now + this.CACHE_TTL_MS;
          return list;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (this.modelsCache) {
      return this.modelsCache; // Return stale cache if network failed
    }
    throw new Error(`Failed to fetch live models from relay: ${lastError?.message}`);
  }

  async fetchProviders(): Promise<RelayProvider[]> {
    const endpoints = [this.config.relayUrl, this.config.relayFallbackUrl].filter(Boolean);
    for (const baseUrl of endpoints) {
      try {
        const res = await fetch(`${baseUrl}/providers`, {
          headers: this.getAuthHeaders(),
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (Array.isArray(data.providers) && data.providers.length > 0) return data.providers;
          if (Array.isArray(data) && data.length > 0) return data;
        }
      } catch {
        // try fallback
      }
    }
    return [];
  }

  async webSearch(query: string): Promise<string> {
    const endpoints = [this.config.relayUrl, this.config.relayFallbackUrl];
    for (const baseUrl of endpoints) {
      try {
        const res = await fetch(`${baseUrl}/web_search`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          return JSON.stringify(data, null, 2);
        }
      } catch {
        // fallback
      }
    }
    return `[Relay web search unavailable or timed out for query: "${query}"]`;
  }

  async syncSessionToWeb(sessionData: {
    id: string;
    title: string;
    history: any[];
  }): Promise<boolean> {
    const cookie = extractCookie(this.config.cookieFile);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
    if (cookie) headers.Cookie = cookie;

    try {
      const res = await fetch(`${this.config.webUrl}/api/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessions: [
            {
              id: sessionData.id,
              title: sessionData.title,
              at: Date.now(),
              history: sessionData.history,
            },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async streamChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const model = options.model || this.config.defaultModel;
    const endpoints = [this.config.relayUrl, this.config.relayFallbackUrl];
    let lastError: any = null;

    for (const baseUrl of endpoints) {
      try {
        const payload: Record<string, any> = {
          model,
          messages: options.messages,
          stream: true,
        };

        if (options.tools && options.tools.length > 0) {
          payload.tools = options.tools;
          payload.tool_choice = 'auto';
        }

        // Only include temperature if not a reasoning model
        const isReasoning = model.includes('o1') || model.includes('o3') || model.includes('reasoning');
        if (!isReasoning && options.temperature !== undefined) {
          payload.temperature = options.temperature;
        }

        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(payload),
          signal: options.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Relay HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }

        if (!res.body) {
          throw new Error('No response body from relay stream');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let content = '';
        let reasoning = '';
        let finishReason: string | undefined;
        const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();

        let inThinkTag = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith(':')) continue;
            if (line === 'data: [DONE]') continue;

            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const choice = parsed.choices?.[0];
                if (!choice) continue;

                if (choice.finish_reason) {
                  finishReason = choice.finish_reason;
                }

                const delta = choice.delta;
                if (!delta) continue;

                // Reasoning tokens
                const reasonDelta = delta.reasoning_content || delta.reasoning || delta.think;
                if (reasonDelta) {
                  reasoning += reasonDelta;
                  options.onReasoning?.(reasonDelta);
                }

                // Main content & inline think tags handling
                if (delta.content) {
                  let chunk = delta.content;
                  if (!inThinkTag && (chunk.includes('<think>') || chunk.includes('<thought>'))) {
                    const tag = chunk.includes('<think>') ? '<think>' : '<thought>';
                    const parts = chunk.split(tag);
                    if (parts[0]) {
                      content += parts[0];
                      options.onToken?.(parts[0]);
                    }
                    inThinkTag = true;
                    chunk = parts.slice(1).join(tag);
                  }

                  if (inThinkTag) {
                    const closeTag = chunk.includes('</think>') ? '</think>' : chunk.includes('</thought>') ? '</thought>' : null;
                    if (closeTag) {
                      const parts = chunk.split(closeTag);
                      reasoning += parts[0];
                      options.onReasoning?.(parts[0]);
                      inThinkTag = false;
                      const rest = parts.slice(1).join(closeTag);
                      if (rest) {
                        content += rest;
                        options.onToken?.(rest);
                      }
                    } else {
                      reasoning += chunk;
                      options.onReasoning?.(chunk);
                    }
                  } else {
                    content += chunk;
                    options.onToken?.(chunk);
                  }
                }

                // Tool calls
                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    const existing = toolCallsMap.get(idx) || { id: '', name: '', args: '' };
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.name += tc.function.name;
                    if (tc.function?.arguments) existing.args += tc.function.arguments;
                    toolCallsMap.set(idx, existing);
                  }
                }
              } catch {
                // partial json or parse error
              }
            }
          }
        }

        const toolCalls = Array.from(toolCallsMap.values()).map((tc) => {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.args || '{}');
          } catch {
            parsedArgs = { raw: tc.args };
          }
          return {
            id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
            name: tc.name,
            arguments: parsedArgs,
            rawArguments: tc.args,
          };
        });

        // Fallback: If no native tool_calls were emitted, check if model output JSON tool call in content
        if (toolCalls.length === 0 && content) {
          const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
          const match = stripped.match(/\{[\s\S]*"(tool|name|action)"\s*:\s*"([a-zA-Z0-9_-]+)"[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]);
              const toolName = parsed.tool || parsed.name || parsed.action;
              const toolArgs = parsed.arguments || parsed.parameters || parsed.action_input || parsed.args || {};
              if (toolName) {
                toolCalls.push({
                  id: `call_${Math.random().toString(36).slice(2, 9)}`,
                  name: toolName,
                  arguments: toolArgs,
                  rawArguments: JSON.stringify(toolArgs),
                });
              }
            } catch {
              // ignore
            }
          }
        }

        return {
          content,
          reasoning,
          toolCalls,
          model,
          finishReason,
        };
      } catch (err: any) {
        lastError = err;
        if (options.signal?.aborted) {
          throw err;
        }
      }
    }

    throw lastError || new Error('Relay completions request failed');
  }
}

export const relay = new RelayClient();
