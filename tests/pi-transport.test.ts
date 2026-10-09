import { describe, expect, it } from 'bun:test';
import { buildRelayChatModel, generateRelayImage, buildRelayImageModel, streamRelayCompletion, toPiContext } from '../src/pi-transport.ts';

function sseResponse(payloads: string[]): Response {
  const body = payloads.map((p) => `data: ${p}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('pi-transport: beurre history to omp context', () => {
  it('maps system, user, assistant tool calls and tool results', () => {
    const ctx = toPiContext([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'read it' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read', arguments: '{"path":"a.txt"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'hello' },
    ]);

    expect(ctx.systemPrompt).toEqual(['be brief']);
    expect(ctx.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'toolResult']);

    const assistant = ctx.messages[1];
    expect(assistant.role === 'assistant' && assistant.content).toEqual([
      { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a.txt' } },
    ]);

    const result = ctx.messages[2];
    expect(result.role === 'toolResult' && result.toolName).toBe('read');
  });
});

describe('pi-transport: relay streaming', () => {
  it('posts to the relay chat route and collects reasoning, text and native tool calls', async () => {
    const original = globalThis.fetch;
    const seen: { url: string; body: unknown; auth: string | null } = { url: '', body: null, auth: null };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.url = String(input);
      seen.body = JSON.parse(String(init?.body));
      seen.auth = new Headers(init?.headers).get('authorization');
      return sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'Calling tool.' } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'read', arguments: '{"path":' } }] } }] }),
        JSON.stringify({
          choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }] }, finish_reason: 'tool_calls' }],
        }),
      ]);
    }) as typeof fetch;

    try {
      const tokens: string[] = [];
      const res = await streamRelayCompletion({
        model: buildRelayChatModel('agnes/agnes-3.0-flash', 'https://relay.test/v1', {}),
        context: toPiContext(
          [{ role: 'user', content: 'go' }],
          [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }],
        ),
        apiKey: 'sk-test',
        onToken: (t) => tokens.push(t),
      });

      expect(seen.url).toBe('https://relay.test/v1/chat/completions');
      expect(seen.auth).toBe('Bearer sk-test');
      expect((seen.body as { model: string }).model).toBe('agnes/agnes-3.0-flash');
      expect(res.toolCalls).toEqual([{ id: 'call_9', name: 'read', arguments: { path: 'a.txt' }, rawArguments: '{"path":"a.txt"}' }]);
      expect(tokens.join('')).toBe('Calling tool.');
      expect(res.reasoning).toBe('thinking');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('pi-transport: relay image generation', () => {
  it('requests /images/generations and returns the base64 image with its MIME type', async () => {
    const original = globalThis.fetch;
    const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    let url = '';
    globalThis.fetch = (async (input: string | URL | Request) => {
      url = String(input);
      return new Response(JSON.stringify({ data: [{ b64_json: png1x1 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const image = await generateRelayImage({
        model: buildRelayImageModel('dall-e-3', 'https://relay.test/v1', {}),
        prompt: 'a butter block',
        size: '1024x1024',
        apiKey: 'sk-test',
      });
      expect(url).toBe('https://relay.test/v1/images/generations');
      expect(image?.b64).toBe(png1x1);
      expect(image?.mimeType).toBe('image/png');
    } finally {
      globalThis.fetch = original;
    }
  });
});
