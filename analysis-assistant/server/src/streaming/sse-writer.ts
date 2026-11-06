import type { Response } from 'express';
import type { RunEventBody } from '../../../shared/api-contract';
import { LlmProviderError } from '../llm/llm-provider';

function toRunFailure(error: unknown): RunEventBody {
  if (error instanceof LlmProviderError) {
    return {
      type: 'run.failed',
      payload: { code: error.code, message: error.message, retryable: error.retryable },
    };
  }
  console.error('SSE stream producer failed.');
  return {
    type: 'run.failed',
    payload: { code: 'internal_error', message: 'The server could not finish this request.', retryable: true },
  };
}

export async function streamRun(
  res: Response,
  runId: string,
  produce: (signal: AbortSignal) => AsyncGenerator<RunEventBody>,
): Promise<void> {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  let seq = 0;
  let terminalSent = false;
  const write = (event: RunEventBody) => {
    if (controller.signal.aborted || res.destroyed || res.writableEnded) return false;
    seq += 1;
    res.write(`data: ${JSON.stringify({ runId, seq, ...event })}\n\n`);
    terminalSent = event.type === 'run.completed' || event.type === 'run.failed';
    return true;
  };

  try {
    for await (const event of produce(controller.signal)) {
      if (!write(event)) return;
      if (event.type === 'run.completed' || event.type === 'run.failed') return;
    }
    if (!terminalSent) {
      write({
        type: 'run.failed',
        payload: {
          code: 'missing_terminal_event',
          message: 'The request ended before it could complete.',
          retryable: true,
        },
      });
    }
  } catch (error) {
    if (!controller.signal.aborted && !res.destroyed && !res.writableEnded) write(toRunFailure(error));
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}
