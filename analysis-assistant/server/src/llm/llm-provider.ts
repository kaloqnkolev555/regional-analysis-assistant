export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmStreamRequest {
  messages: LlmMessage[];
  signal: AbortSignal;
}

export interface LlmProvider {
  streamText(request: LlmStreamRequest): AsyncGenerator<string>;
}

export type LlmErrorCode =
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_model_unavailable'
  | 'provider_error'
  | 'malformed_stream'
  | 'empty_response';

export class LlmProviderError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
