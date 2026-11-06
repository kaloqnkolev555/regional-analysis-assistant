import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmProviderError } from './llm-provider';
import { createOpenAiCompatibleProvider } from './openai-compatible.provider';

const config = {
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: 'server-only-test-key',
  model: 'gemini-test-model',
};

async function collect(provider = createOpenAiCompatibleProvider(config)) {
  const chunks: string[] = [];
  for await (const chunk of provider.streamText({
    messages: [
      { role: 'system', content: 'System instructions' },
      { role: 'user', content: 'Generate recommendations' },
    ],
    signal: new AbortController().signal,
  })) {
    chunks.push(chunk);
  }
  return chunks;
}

function sseResponse(...events: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const event of events) controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('OpenAI-compatible Gemini provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the configured model and messages with server-side authorization and parses streamed text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse(
        JSON.stringify({ choices: [{ delta: { content: 'Recommendations ' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'complete.' } }] }),
        '[DONE]',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = createOpenAiCompatibleProvider(config);

    await expect(collect(provider)).resolves.toEqual(['Recommendations ', 'complete.']);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer server-only-test-key');
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'gemini-test-model',
      messages: [
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Generate recommendations' },
      ],
      stream: true,
    });
  });

  it.each([
    [401, 'provider_auth_failed'],
    [403, 'provider_auth_failed'],
    [429, 'provider_rate_limited'],
    [404, 'provider_model_unavailable'],
    [503, 'provider_unavailable'],
    [400, 'provider_error'],
  ] as const)('maps provider HTTP %i to %s without forwarding the response body', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server-only-test-key', { status })));

    let caught: unknown;
    try {
      await collect();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LlmProviderError);
    expect(caught).toMatchObject({ code });
    expect(caught).toBeInstanceOf(Error);
    if (caught instanceof Error) expect(caught.message).not.toContain(config.apiKey);
  });

  it('explains how to correct an unavailable configured model or endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(collect()).rejects.toMatchObject({
      code: 'provider_model_unavailable',
      retryable: false,
      message: expect.stringContaining('GEMINI_MODEL'),
    });
  });

  it('maps network failures to a safe retryable provider error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(config.apiKey)));

    await expect(collect()).rejects.toMatchObject({
      name: 'LlmProviderError',
      code: 'provider_unavailable',
      retryable: true,
      message: 'The language model could not be reached.',
    });
  });

  it('rejects malformed stream JSON and unexpected chunks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse('{bad json')));
    await expect(collect()).rejects.toMatchObject({ code: 'malformed_stream' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(JSON.stringify({ choices: [{ delta: { content: 3 } }] }))),
    );
    await expect(collect()).rejects.toMatchObject({ code: 'malformed_stream' });
  });

  it('rejects a successful provider response without a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    await expect(collect()).rejects.toMatchObject({
      name: 'LlmProviderError',
      code: 'provider_unavailable',
    });
  });

  it('preserves abort errors rather than reporting them as provider failures', async () => {
    const controller = new AbortController();
    const aborted = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (_url: URL, init: RequestInit) => {
        expect(init.signal).toBe(controller.signal);
        controller.abort();
        throw aborted;
      }),
    );
    const provider = createOpenAiCompatibleProvider(config);

    await expect(
      provider.streamText({
        messages: [{ role: 'user', content: 'Generate recommendations' }],
        signal: controller.signal,
      }).next(),
    ).rejects.toBe(aborted);
  });

  it('does not expose API credentials in provider errors', () => {
    const error = new LlmProviderError('provider_auth_failed', 'The language model rejected the API key.', false);
    expect(error.message).not.toContain(config.apiKey);
  });
});
