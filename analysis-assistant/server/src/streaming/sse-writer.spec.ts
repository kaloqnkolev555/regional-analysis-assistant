import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '../llm/llm-provider';
import { createApp } from '../app';
import { streamRun } from './sse-writer';
import { runEventSchema, type RunEvent, type RunEventBody } from '../../../shared/api-contract';

const provider: LlmProvider = {
  async *streamText(_request) {
    yield 'unused';
  },
};

function parseEvents(body: string): RunEvent[] {
  return runEventSchema.array().parse(
    body
      .trim()
      .split('\n\n')
      .map((frame) => JSON.parse(frame.replace(/^data: /, '')) as unknown),
  );
}

describe('SSE streaming infrastructure', () => {
  let app: ReturnType<typeof createApp>;
  let server: Server | undefined;
  let baseUrl: string;
  let abortObserved: Promise<void>;
  let observeAbort!: () => void;

  beforeAll(async () => {
    app = createApp({ provider, clientDistDir: process.cwd() });
    abortObserved = new Promise((resolve) => {
      observeAbort = resolve;
    });
    app.post('/test-disconnect', (_req, res) => {
      void streamRun(res, 'disconnect-run', async function* (signal) {
        yield { type: 'response.delta', payload: { text: 'Waiting' } };
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });
        observeAbort();
      });
    });
    app.post('/test-terminal', (_req, res) => {
      void streamRun(res, 'terminal-run', async function* (): AsyncGenerator<RunEventBody> {
        yield { type: 'run.completed', payload: {} };
        yield { type: 'response.delta', payload: { text: 'Must not be sent' } };
      });
    });
    app.post('/test-incomplete', (_req, res) => {
      void streamRun(res, 'incomplete-run', async function* (): AsyncGenerator<RunEventBody> {
        yield { type: 'response.delta', payload: { text: 'Started' } };
      });
    });
    app.post('/test-error', (_req, res) => {
      void streamRun(res, 'error-run', async function* (): AsyncGenerator<RunEventBody> {
        yield { type: 'response.delta', payload: { text: 'Started' } };
        throw new Error('internal-secret-marker');
      });
    });
    const testServer = app.listen(0, '127.0.0.1');
    server = testServer;
    await new Promise<void>((resolve, reject) => {
      testServer.once('listening', resolve);
      testServer.once('error', reject);
    });
    const address = testServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    const testServer = server;
    if (!testServer) return;
    await new Promise<void>((resolve, reject) => {
      testServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('rejects invalid generate payloads before streaming', async () => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: 'generate-test-run',
        briefing: 'A valid briefing',
        priorities: [],
        messages: [{ role: 'system', content: 'bad role' }],
      }),
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(response.headers.get('content-type')).not.toContain('text/event-stream');
  });

  it('streams generated text and a terminal event through the generate route', async () => {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: 'generate-integration-run',
        briefing: 'A practical regional briefing',
        priorities: [{ id: 'employment', text: 'Support youth skills' }],
        messages: [{ role: 'user', content: 'Give practical recommendations.' }],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const events = parseEvents(await response.text());
    expect(events).toEqual([
      {
        runId: 'generate-integration-run',
        seq: 1,
        type: 'response.delta',
        payload: { text: 'unused' },
      },
      {
        runId: 'generate-integration-run',
        seq: 2,
        type: 'run.completed',
        payload: {},
      },
    ]);
  });

  it('does not expose the retired analyze endpoint', async () => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: 'analysis-test-run', briefing: 'A valid briefing' }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).not.toContain('text/event-stream');
  });

  it('does not send events after a terminal event and fails producers that omit one', async () => {
    const terminalResponse = await fetch(`${baseUrl}/test-terminal`, { method: 'POST' });
    expect(terminalResponse.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(terminalResponse.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(terminalResponse.headers.get('connection')).toBe('keep-alive');
    expect(terminalResponse.headers.get('x-accel-buffering')).toBe('no');
    const terminalEvents = parseEvents(await terminalResponse.text());
    expect(terminalEvents.map(({ type }) => type)).toEqual(['run.completed']);
    expect(terminalEvents.map(({ runId, seq }) => [runId, seq])).toEqual([['terminal-run', 1]]);

    const incompleteResponse = await fetch(`${baseUrl}/test-incomplete`, { method: 'POST' });
    const incompleteEvents = parseEvents(await incompleteResponse.text());
    expect(incompleteEvents.map(({ type }) => type)).toEqual(['response.delta', 'run.failed']);
    expect(incompleteEvents.map(({ seq }) => seq)).toEqual([1, 2]);
    expect(incompleteEvents.filter(({ type }) => type === 'run.completed' || type === 'run.failed')).toHaveLength(1);
    expect(incompleteEvents.at(-1)).toMatchObject({
      runId: 'incomplete-run',
      type: 'run.failed',
      payload: {
        code: 'missing_terminal_event',
        retryable: true,
      },
    });
  });

  it('returns a safe run.failed event for producer exceptions after streaming starts', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await fetch(`${baseUrl}/test-error`, { method: 'POST' });
      const events = parseEvents(await response.text());
      const terminal = events.at(-1);
      expect(events.map(({ type }) => type)).toEqual(['response.delta', 'run.failed']);
      expect(events.filter(({ type }) => type === 'run.completed' || type === 'run.failed')).toHaveLength(1);
      expect(terminal).toMatchObject({
        runId: 'error-run',
        type: 'run.failed',
        payload: {
          code: 'internal_error',
          message: 'The server could not finish this request.',
          retryable: true,
        },
      });
      expect(JSON.stringify(events)).not.toContain('internal-secret-marker');
      expect(log).toHaveBeenCalledWith('SSE stream producer failed.');
    } finally {
      log.mockRestore();
    }
  });

  it('propagates a client disconnect to the stream producer without writing after close', async () => {
    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/test-disconnect`, { method: 'POST', signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader!.read();
    controller.abort();
    await reader!.cancel().catch(() => undefined);
    await expect(
      Promise.race([
        abortObserved,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Disconnect was not observed.')), 1000)),
      ]),
    ).resolves.toBeUndefined();
  });
});
