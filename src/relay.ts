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
  reasoning_efforts?: string[];
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

// Mirrors ToolDefinition's wire shape. Declared here rather than imported
// because tools.ts already imports this module, and a back-import closes a cycle.
export interface ToolSchema {
  type: 'function';
  function: { name: string; description?: string; parameters: Record<string, unknown> };
}

export interface ChatCompletionOptions {
  model?: string;
  effort?: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
  onReasoning?: (reasoning: string) => void;
}

export interface ToolCallItem {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  rawArguments: string;
}

export interface ChatCompletionResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCallItem[];
  model: string;
  finishReason?: string;
}

const KNOWN_MODEL_NAMES: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-opus-5': 'Claude Opus 5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-fable-5-1': 'Claude Fable 5.1',
  'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku': 'Claude 3.5 Haiku',
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-6-luna': 'GPT-6 Luna',
  'gpt-5-5': 'GPT-5.5',
  'gpt-5-6-sol': 'GPT-5.6 Sol',
  'gpt-4o': 'GPT-4o Omnimodal',
  'glm-5-3-flash': 'GLM 5.3 Flash',
  'glm-5-3': 'GLM 5.3',
  'kimi-k3': 'Kimi K3',
  'kimi-k3:max': 'Kimi K3 (Max)',
  'o3-mini': 'o3-mini',
  'o1': 'o1',
  'deepseek-v4-1-flash': 'DeepSeek v4.1 Flash',
  'deepseek-r1': 'DeepSeek R1',
  'deepseek-v3': 'DeepSeek V3',
  'gemini-3-8-flash': 'Gemini 3.8 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'qwen3-8-flash': 'Qwen 3.8 Flash',
  'qwen3-8-max': 'Qwen 3.8 Max',
  'mimo-v2-6-pro': 'Mimo v2.6 Pro',
  'atria-dawn': 'Atria Dawn',
};

export function getModelDisplayName(modelId: string, modelList?: RelayModel[]): string {
  const cleanId = modelId.split(':')[0];
  if (modelList) {
    const found = modelList.find((m) => m.id === modelId || m.id === cleanId);
    if (found?.name) return found.name;
  }
  if (KNOWN_MODEL_NAMES[modelId]) return KNOWN_MODEL_NAMES[modelId];
  if (KNOWN_MODEL_NAMES[cleanId]) return KNOWN_MODEL_NAMES[cleanId];

  // Ids are provider-qualified now ("yjs/glm-5-3-flash"). Title-casing the
  // whole string would read as "Yjs/glm 5 3 Flash", so drop the leading
  // provider segment first — it is already shown in its own column.
  const bare = cleanId.includes('/') ? cleanId.slice(cleanId.indexOf('/') + 1) : cleanId;
  if (KNOWN_MODEL_NAMES[bare]) return KNOWN_MODEL_NAMES[bare];

  return bare
    .split('-')
    .map((word) => {
      if (/^\d+(\.\d+)?$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/** One row of GET /v1/models?view=raw: an OpenAI model object whose richer
 * per-channel metadata (context, output cap, effort ladder) sits under `relay`. */
export interface RawRelayRow {
  id?: string;
  owned_by?: string;
  name?: string;
  context_length?: number;
  max_completion_tokens?: number;
  reasoning?: boolean;
  reasoning_efforts?: string[];
  relay?: {
    provider?: string;
    id?: string;
    name?: string;
    context?: number | null;
    max_output?: number | null;
    reasoning?: boolean;
    reasoning_efforts?: string[];
    input?: string[] | null;
    output?: string[] | null;
  };
}

/**
 * Map one raw catalog row to the picker's RelayModel. The id stays
 * provider-qualified so a pick routes to exactly that channel, and the
 * context / output cap / effort ladder come from the relay block so the
 * displayed limits stay accurate per provider.
 */
export function toRelayModel(row: RawRelayRow): RelayModel | null {
  const relay = row.relay || {};
  const provider = relay.provider || row.owned_by || '';
  const rawId = relay.id || row.id || '';
  const bare = provider && rawId.startsWith(`${provider}/`) ? rawId.slice(provider.length + 1) : rawId;
  if (!bare) return null;
  return {
    id: provider ? `${provider}/${bare}` : bare,
    name: relay.name || (row.name && row.name !== row.id ? row.name : undefined),
    owned_by: provider || undefined,
    context_length: typeof relay.context === 'number' ? relay.context : row.context_length,
    max_completion_tokens: typeof relay.max_output === 'number' ? relay.max_output : row.max_completion_tokens,
    reasoning: relay.reasoning ?? row.reasoning,
    reasoning_efforts: relay.reasoning_efforts ?? row.reasoning_efforts,
    input_modalities: relay.input ?? undefined,
    output_modalities: relay.output ?? undefined,
  };
}

export function extractToolCallsFromContent(content: string): {
  toolCalls: ToolCallItem[];
  cleanedContent: string;
} {
  const toolCalls: ToolCallItem[] = [];
  let cleaned = content;

  // 1. Match XML <tool_call> ... </tool_call>
  const xmlToolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = xmlToolCallRegex.exec(content)) !== null) {
    const block = match[1].trim();
    cleaned = cleaned.replace(match[0], '');

    const nameMatch = block.match(/<name>([a-zA-Z0-9_-]+)<\/name>/i);
    const argsMatch = block.match(/<arguments>([\s\S]*?)<\/arguments>/i);

    if (nameMatch) {
      const toolName = nameMatch[1].trim();
      const rawArgs = argsMatch ? argsMatch[1].trim() : '{}';
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch {
        parsedArgs = { raw: rawArgs };
      }
      toolCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 9)}`,
        name: toolName,
        arguments: parsedArgs,
        rawArguments: rawArgs,
      });
      continue;
    }

    try {
      const parsed = JSON.parse(block);
      const name = parsed.name || parsed.tool || parsed.action;
      const args = parsed.arguments || parsed.parameters || parsed.action_input || parsed.args || {};
      if (name) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          name,
          arguments: typeof args === 'string' ? JSON.parse(args) : args,
          rawArguments: JSON.stringify(args),
        });
      }
    } catch {
      // ignore
    }
  }

  // 2. Match Markdown code block ```tool_call ... ```
  const mdToolCallRegex = /```(?:tool_call|tool-call|tool_calls|json:tool)\s*\n([\s\S]*?)```/gi;
  while ((match = mdToolCallRegex.exec(content)) !== null) {
    const block = match[1].trim();
    cleaned = cleaned.replace(match[0], '');
    try {
      const parsed = JSON.parse(block);
      const name = parsed.name || parsed.tool || parsed.action;
      const args = parsed.arguments || parsed.parameters || parsed.action_input || parsed.args || {};
      if (name) {
        toolCalls.push({
          id: `call_${Math.random().toString(36).slice(2, 9)}`,
          name,
          arguments: typeof args === 'string' ? JSON.parse(args) : args,
          rawArguments: JSON.stringify(args),
        });
      }
    } catch {
      // ignore
    }
  }

  // 3. Match Anthropic style <invoke name="..."> ... </invoke>
  const invokeRegex = /<invoke\s+name="([a-zA-Z0-9_-]+)"\s*>([\s\S]*?)<\/invoke>/gi;
  while ((match = invokeRegex.exec(content)) !== null) {
    const name = match[1].trim();
    const body = match[2].trim();
    cleaned = cleaned.replace(match[0], '');

    const args: Record<string, any> = {};
    const paramRegex = /<parameter\s+name="([a-zA-Z0-9_-]+)"\s*>([\s\S]*?)<\/parameter>/gi;
    let paramMatch: RegExpExecArray | null;
    let foundParams = false;
    while ((paramMatch = paramRegex.exec(body)) !== null) {
      foundParams = true;
      const pName = paramMatch[1].trim();
      const pVal = paramMatch[2].trim();
      try {
        args[pName] = JSON.parse(pVal);
      } catch {
        args[pName] = pVal;
      }
    }
    if (!foundParams && body) {
      try {
        Object.assign(args, JSON.parse(body));
      } catch {
        args.raw = body;
      }
    }
    toolCalls.push({
      id: `call_${Math.random().toString(36).slice(2, 9)}`,
      name,
      arguments: args,
      rawArguments: JSON.stringify(args),
    });
  }

  cleaned = cleaned.replace(/<function_calls>|<\/function_calls>/gi, '').trim();

  // 4. Fallback: single JSON block with tool/action
  if (toolCalls.length === 0) {
    const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*"(tool|name|action)"\s*:\s*"([a-zA-Z0-9_-]+)"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const toolName = parsed.tool || parsed.name || parsed.action;
        const toolArgs = parsed.arguments || parsed.parameters || parsed.action_input || parsed.args || {};
        if (toolName) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 9)}`,
            name: toolName,
            arguments: typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs,
            rawArguments: JSON.stringify(toolArgs),
          });
          cleaned = cleaned.replace(jsonMatch[0], '').trim();
        }
      } catch {
        // ignore
      }
    }
  }

  return { toolCalls, cleanedContent: cleaned.trim() };
}

export const DEFAULT_FALLBACK_MODELS: RelayModel[] = [
  { id: 'yjs/glm-5.3-flash', name: 'GLM 5.3 Flash', owned_by: 'yjs', reasoning: true, context_length: 1049000 },
  { id: 'crax/kimi-k3', name: 'Kimi K3', owned_by: 'crax', reasoning: true, context_length: 1049000 },
  { id: 'crax/gpt-6-astra', name: 'GPT-6 Astra', owned_by: 'crax', reasoning: true, context_length: 1050000 },
  { id: 'crax/claude-opus-5', name: 'Claude Opus 5', owned_by: 'crax', reasoning: true, context_length: 1000000 },
  { id: 'kilgore/claude-opus-5-5', name: 'Claude Opus 5.5', owned_by: 'kilgore', reasoning: true, context_length: 1000000 },
  { id: 'kilgore/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', owned_by: 'kilgore', reasoning: true, context_length: 1000000 },
  { id: 'nextrouter/gpt-5.5', name: 'GPT-5.5', owned_by: 'nextrouter', reasoning: true, context_length: 1050000 },
  { id: 'crax/gemini-3-8-flash', name: 'Gemini 3.8 Flash', owned_by: 'crax', reasoning: true, context_length: 1049000 },
  { id: 'hybra/qwen3-8-flash', name: 'Qwen 3.8 Flash', owned_by: 'hybra', reasoning: true, context_length: 1000000 },
  { id: 'vsllm/deepseek-v4.1-flash', name: 'DeepSeek v4.1 Flash', owned_by: 'vsllm', reasoning: true, context_length: 128000 },
  { id: 'glm-5-3-flash', name: 'GLM 5.3 Flash', owned_by: 'zhipu', reasoning: true, context_length: 1049000 },
  { id: 'kimi-k3:max', name: 'Kimi K3 (Max)', owned_by: 'moonshot', reasoning: true, context_length: 1049000 },
  { id: 'gpt-6-astra:high', name: 'GPT-6 Astra (High)', owned_by: 'openai', reasoning: true, context_length: 1050000 },
  { id: 'o3-mini', name: 'o3-mini', owned_by: 'openai', reasoning: true, context_length: 200000 },
  { id: 'gpt-4o', name: 'GPT-4o', owned_by: 'openai', reasoning: false, context_length: 128000 },
];

export function loadFallbackCatalog(): RelayModel[] {
  const models = [...DEFAULT_FALLBACK_MODELS];
  try {
    const staticPath = path.join(os.homedir(), 'model-aggregator', 'src', 'static-models.json');
    if (fs.existsSync(staticPath)) {
      const raw = JSON.parse(fs.readFileSync(staticPath, 'utf-8'));
      if (raw && typeof raw === 'object') {
        for (const [provider, list] of Object.entries(raw)) {
          if (Array.isArray(list)) {
            for (const item of list) {
              if (item && item.id) {
                const fullId = `${provider}/${item.id}`;
                if (!models.some((m) => m.id === fullId || m.id === item.id)) {
                  models.push({
                    id: fullId,
                    name: item.name || item.id,
                    owned_by: provider,
                    reasoning: true,
                    context_length: 128000,
                  });
                }
              }
            }
          }
        }
      }
    }
  } catch {}
  return models;
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
    // Send both credentials. They were mutually exclusive here, so a stale
    // cookie silently overrode a perfectly good API key and every call came
    // back 401 "Missing or invalid gateway token".
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }
    const cookie = extractCookie(this.config.cookieFile);
    if (cookie) {
      headers.Cookie = cookie;
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
        // view=raw keeps every provider/model route as its own entry. The
        // default canonical view folds a model served by many upstreams onto
        // ONE merged id, which hid the provider and made a pick fail over
        // instead of routing to the channel the user chose.
        const res = await fetch(`${baseUrl}/models?view=raw`, {
          headers: this.getAuthHeaders(),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        const data = (await res.json()) as RawRelayRow[] | { data?: RawRelayRow[] };
        const rows: RawRelayRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
            ? data.data
            : [];
        const list: RelayModel[] = rows
          .map(toRelayModel)
          .filter((m): m is RelayModel => m !== null);

        if (list.length > 0) {
          this.modelsCache = list;
          this.cacheExpiry = now + this.CACHE_TTL_MS;
          return list;
        }
      } catch (err: unknown) {
        lastError = err as Error;
      }
    }

    if (this.modelsCache && this.modelsCache.length > 0) {
      return this.modelsCache; // Return stale cache if network failed
    }
    // Offline resilience: return fallback catalog so Beurre never crashes or hangs when offline
    const fallback = loadFallbackCatalog();
    if (fallback.length > 0) {
      this.modelsCache = fallback;
      this.cacheExpiry = now + 60000;
      return fallback;
    }
    throw new Error(`Failed to fetch live models from relay: ${lastError?.message}`);
  }

  async fetchProviders(): Promise<RelayProvider[]> {
    const endpoints = [this.config.relayUrl, this.config.relayFallbackUrl].filter(Boolean);
    for (const baseUrl of endpoints) {
      try {
        const res = await fetch(`${baseUrl}/providers`, {
          headers: this.getAuthHeaders(),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const data = (await res.json()) as { providers?: unknown[] } | unknown[];
          if (Array.isArray(data.providers) && data.providers.length > 0) return data.providers;
          if (Array.isArray(data) && data.length > 0) return data;
        }
      } catch {
        // try fallback
      }
    }
    return [
      { id: 'yjs', name: 'YJS Direct', live: true, models: 12 },
      { id: 'crax', name: 'Crax Relay', live: true, models: 18 },
      { id: 'kilgore', name: 'Kilgore Cloud', live: true, models: 10 },
      { id: 'omnirush', name: 'Omnirush AI', live: true, models: 8 },
      { id: 'directrouter', name: 'DirectRouter', live: true, models: 5 },
    ];
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
          if (Array.isArray(data)) {
            return data.map((item, i) => `${i + 1}. [${item.title || item.name || 'Result'}](${item.url || ''})\n   ${item.snippet || item.description || item.content || ''}`).join('\n\n');
          }
          if (data && typeof data === 'object') {
            const results = (data as any).results || (data as any).data || (data as any).organic;
            if (Array.isArray(results) && results.length > 0) {
              return results.map((item: any, i: number) => `${i + 1}. [${item.title || item.name || 'Result'}](${item.url || ''})\n   ${item.snippet || item.description || item.content || ''}`).join('\n\n');
            }
          }
          return JSON.stringify(data, null, 2);
        }
      } catch {
        // fallback
      }
    }
    return `[Relay web search unavailable or timed out for query: "${query}"]`;
  }

  async generateImage(
    prompt: string,
    options: { size?: string; model?: string } = {}
  ): Promise<{ url?: string; b64?: string; error?: string }> {
    const endpoints = [this.config.relayUrl, this.config.relayFallbackUrl].filter(Boolean);
    const model = options.model || 'dall-e-3';
    const size = options.size || '1024x1024';

    for (const baseUrl of endpoints) {
      try {
        const res = await fetch(`${baseUrl}/images/generations`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            prompt,
            model,
            n: 1,
            size,
            response_format: 'b64_json',
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (res.ok) {
          // OpenAI-shaped image response; asserted once at this boundary.
          const data = (await res.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
          const item = data.data?.[0];
          if (item) {
            return {
              url: item.url,
              b64: item.b64_json,
            };
          }
        }
      } catch {
        // try fallback
      }
    }
    return {
      error: 'Image generation endpoint unavailable or timed out on relay gateway',
    };
  }

  async syncSessionToWeb(sessionData: {
    id: string;
    title: string;
    history: ChatMessage[];
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
    let lastError: unknown = null;

    for (const baseUrl of endpoints) {
      try {
        const payload: Record<string, any> = {
          model,
          messages: options.messages,
          stream: true,
        };

        // Reasoning effort handling
        const effort = options.effort || (model.includes(':') ? model.split(':')[1] : undefined);
        if (effort) {
          payload.reasoning_effort = effort;
          const lowerModel = model.toLowerCase();
          if (lowerModel.includes('claude') || lowerModel.includes('opus') || lowerModel.includes('sonnet')) {
            const budgetMap: Record<string, number> = {
              max: 64000,
              xhigh: 32000,
              high: 16000,
              medium: 8000,
              low: 2000,
            };
            const budget = budgetMap[effort.toLowerCase()] || 8000;
            payload.thinking = { type: 'enabled', budget_tokens: budget };
          }
        }

        if (options.tools && options.tools.length > 0) {
          payload.tools = options.tools;
          payload.tool_choice = 'auto';
        }

        // Only include temperature if not a reasoning model
        const isReasoning = model.includes('o1') || model.includes('o3') || model.includes('reasoning');
        if (!isReasoning && options.temperature !== undefined) {
          payload.temperature = options.temperature;
        }

        let res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: JSON.stringify(payload),
          signal: options.signal,
        });

        // Transient error retry (429 rate limit or 503/502 gateway blip)
        if (!res.ok && (res.status === 429 || res.status === 503 || res.status === 502) && !options.signal?.aborted) {
          await new Promise((r) => setTimeout(r, 600));
          if (!options.signal?.aborted) {
            const retryAttempt = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: this.getAuthHeaders(),
              body: JSON.stringify(payload),
              signal: options.signal,
            }).catch(() => null);
            if (retryAttempt && retryAttempt.ok) {
              res = retryAttempt;
            }
          }
        }

        // Chat-proxied fallback: if upstream returns 400 Bad Request and tools were present,
        // retry without tools because web-chat proxies (e.g. claude-opus-5-5) often reject OpenAI tools schema
        if (!res.ok && res.status === 400 && payload.tools) {
          const fallbackPayload: Record<string, any> = { ...payload };
          delete fallbackPayload.tools;
          delete fallbackPayload.tool_choice;
          if (fallbackPayload.messages && Array.isArray(fallbackPayload.messages)) {
            fallbackPayload.messages = fallbackPayload.messages.map((m: ChatMessage) => {
              if (m.role === 'tool') {
                return {
                  role: 'user',
                  content: `<tool_response name="${m.name || 'tool'}">\n${m.content}\n</tool_response>`,
                };
              }
              return m;
            });
          }
          const retryRes = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify(fallbackPayload),
            signal: options.signal,
          });
          if (retryRes.ok) {
            res = retryRes;
          }
        }

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
        let thinkTagBuffer = '';

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

                // Main content & inline think tags handling (chunk-split resilient)
                if (delta.content) {
                  let text = thinkTagBuffer + delta.content;
                  thinkTagBuffer = '';

                  while (text.length > 0) {
                    if (!inThinkTag) {
                      const openMatch = /<(?:think|thought|reasoning)>/i.exec(text);
                      if (openMatch) {
                        const before = text.slice(0, openMatch.index);
                        if (before) {
                          content += before;
                          options.onToken?.(before);
                        }
                        inThinkTag = true;
                        text = text.slice(openMatch.index + openMatch[0].length);
                      } else {
                        const trailingPartial = /<(?:\/?(?:t(?:h(?:i(?:n(?:k)?)?)?)?|r(?:e(?:a(?:s(?:o(?:n)?)?)?)?)?))?$/i.exec(text);
                        if (trailingPartial && trailingPartial.index < text.length) {
                          const safe = text.slice(0, trailingPartial.index);
                          if (safe) {
                            content += safe;
                            options.onToken?.(safe);
                          }
                          thinkTagBuffer = text.slice(trailingPartial.index);
                          text = '';
                        } else {
                          content += text;
                          options.onToken?.(text);
                          text = '';
                        }
                      }
                    } else {
                      const closeMatch = /<\/(?:think|thought|reasoning)>/i.exec(text);
                      if (closeMatch) {
                        const before = text.slice(0, closeMatch.index);
                        if (before) {
                          reasoning += before;
                          options.onReasoning?.(before);
                        }
                        inThinkTag = false;
                        text = text.slice(closeMatch.index + closeMatch[0].length);
                      } else {
                        const trailingPartial = /<\/(?:t(?:h(?:i(?:n(?:k)?)?)?)?|r(?:e(?:a(?:s(?:o(?:n)?)?)?)?)?)?$/i.exec(text);
                        if (trailingPartial && trailingPartial.index < text.length) {
                          const safe = text.slice(0, trailingPartial.index);
                          if (safe) {
                            reasoning += safe;
                            options.onReasoning?.(safe);
                          }
                          thinkTagBuffer = text.slice(trailingPartial.index);
                          text = '';
                        } else {
                          reasoning += text;
                          options.onReasoning?.(text);
                          text = '';
                        }
                      }
                    }
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

        if (buffer.trim()) {
          const trailingLines = buffer.split('\n');
          for (const rawLine of trailingLines) {
            const line = rawLine.trim();
            if (!line || line.startsWith(':') || line === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                const choice = parsed.choices?.[0];
                if (choice?.delta) {
                  const delta = choice.delta;
                  const reasonDelta = delta.reasoning_content || delta.reasoning || delta.think;
                  if (reasonDelta) {
                    reasoning += reasonDelta;
                    options.onReasoning?.(reasonDelta);
                  }
                  if (delta.content) {
                    content += delta.content;
                    options.onToken?.(delta.content);
                  }
                }
              } catch {}
            }
          }
          buffer = '';
        }

        if (thinkTagBuffer) {
          if (inThinkTag) {
            reasoning += thinkTagBuffer;
            options.onReasoning?.(thinkTagBuffer);
          } else {
            content += thinkTagBuffer;
            options.onToken?.(thinkTagBuffer);
          }
          thinkTagBuffer = '';
        }

        if (!content.trim() && reasoning.trim() && toolCallsMap.size === 0) {
          content = reasoning;
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

        // Tool-call parsing fallback: If no native tool_calls were emitted, extract from content
        // This handles chat-proxied models (e.g. claude-opus-5-5, claude-opus-4-8) that emit XML or JSON tool calls
        if (toolCalls.length === 0 && content) {
          const { toolCalls: extracted, cleanedContent } = extractToolCallsFromContent(content);
          if (extracted.length > 0) {
            toolCalls.push(...extracted);
            content = cleanedContent;
          }
        }

        return {
          content,
          reasoning,
          toolCalls,
          model,
          finishReason,
        };
      } catch (err: unknown) {
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
