import type { GenerateRequest, RunEventBody } from '../../../shared/api-contract';
import { LlmProviderError, type LlmProvider } from '../llm/llm-provider';
import { buildGenerationMessages } from '../llm/prompt-builder';

export async function* generateRecommendations(
  request: GenerateRequest,
  provider: LlmProvider,
  signal: AbortSignal,
): AsyncGenerator<RunEventBody> {
  let hasContent = false;
  for await (const text of provider.streamText({ messages: buildGenerationMessages(request), signal })) {
    if (text.trim().length > 0) hasContent = true;
    yield { type: 'response.delta', payload: { text } };
  }

  if (!hasContent) {
    throw new LlmProviderError('empty_response', 'The language model returned no text.', true);
  }
  yield { type: 'run.completed', payload: {} };
}
