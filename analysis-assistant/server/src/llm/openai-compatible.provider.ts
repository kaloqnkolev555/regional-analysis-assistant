import { createParser } from 'eventsource-parser';
import { z } from 'zod';
import { LlmProviderError, type LlmProvider, type LlmStreamRequest } from './llm-provider';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const chunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }) })),
});

function providerHttpError(status: number): LlmProviderError {
  if (status === 401 || status === 403) {
    return new LlmProviderError('provider_auth_failed', 'The language model rejected the API key.', false);
  }
  if (status === 429) {
    return new LlmProviderError('provider_rate_limited', 'The language model rate limit was reached.', true);
  }
  if (status === 404) {
    return new LlmProviderError(
      'provider_model_unavailable',
      'The configured Gemini model or endpoint was not found. Verify GEMINI_MODEL and GEMINI_BASE_URL.',
      false,
    );
  }
  if (status >= 500) {
    return new LlmProviderError('provider_unavailable', 'The language model is temporarily unavailable.', true);
  }
  return new LlmProviderError('provider_error', `The language model request failed with status ${status}.`, false);
}

function extractDelta(data: string): string | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    throw new LlmProviderError('malformed_stream', 'The language model sent an unreadable stream.', true);
  }
  const parsed = chunkSchema.safeParse(json);
  if (!parsed.success) {
    throw new LlmProviderError('malformed_stream', 'The language model sent an unexpected stream chunk.', true);
  }
  return parsed.data.choices[0]?.delta.content ?? null;
}

async function openStream(endpoint: URL, config: OpenAiCompatibleConfig, body: LlmStreamRequest): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, messages: body.messages, stream: true }),
      signal: body.signal,
    });
  } catch (error) {
    if (body.signal.aborted) throw error;
    throw new LlmProviderError('provider_unavailable', 'The language model could not be reached.', true);
  }

  if (!response.ok) {
    throw providerHttpError(response.status);
  }
  if (!response.body) {
    throw new LlmProviderError('provider_unavailable', 'The language model returned no stream.', true);
  }
  return response;
}

export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): LlmProvider {
  const endpoint = new URL('chat/completions', config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`);

  return {
    async *streamText(request: LlmStreamRequest) {
      const response = await openStream(endpoint, config, request);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      const pending: string[] = [];
      let finished = false;
      const parser = createParser({
        onEvent: (event) => {
          if (event.data === '[DONE]') {
            finished = true;
            return;
          }
          const text = extractDelta(event.data);
          if (text) pending.push(text);
        },
      });

      try {
        while (!finished) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
          for (let text = pending.shift(); text !== undefined; text = pending.shift()) {
            yield text;
          }
        }
        for (let text = pending.shift(); text !== undefined; text = pending.shift()) {
          yield text;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
    },
  };
}
