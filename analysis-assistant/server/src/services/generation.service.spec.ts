import { describe, expect, it, vi } from 'vitest';
import { generateRequestSchema, type RunEventBody } from '../../../shared/api-contract';
import type { LlmProvider } from '../llm/llm-provider';
import { LlmProviderError } from '../llm/llm-provider';
import { generateRecommendations } from './generation.service';

const request = generateRequestSchema.parse({
  runId: 'generation-test-run',
  briefing: 'Youth unemployment is high; transport and seasonal flooding are concerns.',
  priorities: [{ id: 'employment', text: 'Support youth skills and apprenticeships.' }],
  messages: [
    { role: 'user', content: 'Consider local business partnerships.' },
    { role: 'assistant', content: 'I will assess practical partnership options.' },
    { role: 'user', content: 'Give me practical recommendations.' },
  ],
});

describe('generateRecommendations', () => {
  it('passes the briefing, approved priorities, reference notes, and conversation context to the provider', async () => {
    const streamText = vi.fn<LlmProvider['streamText']>(async function* (_request) {
      yield 'Start ';
      yield 'a pilot.';
    });
    const provider: LlmProvider = { streamText };
    const events: RunEventBody[] = [];
    for await (const event of generateRecommendations(request, provider, new AbortController().signal)) {
      events.push(event);
    }

    expect(streamText).toHaveBeenCalledOnce();
    const providerRequest = streamText.mock.calls[0]?.[0];
    expect(providerRequest).toBeDefined();
    expect(providerRequest.messages[0]).toMatchObject({ role: 'system' });
    expect(providerRequest.messages[0].content).toContain(request.briefing);
    expect(providerRequest.messages[0].content).toContain(request.priorities[0].text);
    expect(providerRequest.messages[0].content).toContain('reference_notes');
    expect(providerRequest.messages[0].content).toContain(
      'Account for limited funding and local delivery capacity as constraints across recommendations',
    );
    expect(providerRequest.messages.slice(1)).toEqual(request.messages);
    expect(providerRequest.signal).toBeInstanceOf(AbortSignal);
    expect(events).toEqual([
      { type: 'response.delta', payload: { text: 'Start ' } },
      { type: 'response.delta', payload: { text: 'a pilot.' } },
      { type: 'run.completed', payload: {} },
    ]);
  });

  it.each([{ chunks: [] }, { chunks: [''] }, { chunks: ['  ', '\n\t'] }])(
    'fails rather than completing with no non-whitespace output (%j)',
    async ({ chunks }) => {
    const provider: LlmProvider = {
      async *streamText() {
        yield* chunks;
      },
    };
    const events: RunEventBody[] = [];

    await expect(async () => {
      for await (const event of generateRecommendations(request, provider, new AbortController().signal)) {
        events.push(event);
      }
    }).rejects.toMatchObject({
      name: 'LlmProviderError',
      code: 'empty_response',
    });
    expect(events.some((event) => event.type === 'run.completed')).toBe(false);
    },
  );

  it('preserves provider errors for safe SSE failure mapping', async () => {
    const provider: LlmProvider = {
      async *streamText() {
        throw new LlmProviderError('provider_rate_limited', 'The language model rate limit was reached.', true);
      },
    };
    const events = generateRecommendations(request, provider, new AbortController().signal);

    await expect(events.next()).rejects.toMatchObject({
      code: 'provider_rate_limited',
      retryable: true,
    });
  });
});
