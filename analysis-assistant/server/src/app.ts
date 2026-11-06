import express from 'express';
import { join } from 'node:path';
import type { ErrorRequestHandler } from 'express';
import type { LlmProvider } from './llm/llm-provider';
import { createGenerateRouter } from './routes/generate.route';

export interface AppDependencies {
  provider: LlmProvider;
  clientDistDir: string;
}

export function createApp({ provider, clientDistDir }: AppDependencies) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.use('/api', createGenerateRouter(provider));

  app.use(express.static(clientDistDir));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(join(clientDistDir, 'index.html'));
  });

  const handleErrors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const type =
      typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
        ? error.type
        : '';
    if (type === 'entity.parse.failed') {
      res.status(400).json({ code: 'invalid_json', message: 'Request body must contain valid JSON.' });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ code: 'request_too_large', message: 'Request body exceeds the allowed size.' });
      return;
    }

    res.status(500).json({ code: 'internal_error', message: 'The server could not process this request.' });
  };
  app.use(handleErrors);

  return app;
}
