import { Router } from 'express';
import { generateRequestSchema } from '../../../shared/api-contract';
import type { LlmProvider } from '../llm/llm-provider';
import { generateRecommendations } from '../services/generation.service';
import { streamRun } from '../streaming/sse-writer';
import { sendInvalidRequest } from './http-errors';

export function createGenerateRouter(provider: LlmProvider): Router {
  const router = Router();

  router.post('/generate', (req, res) => {
    const parsed = generateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendInvalidRequest(res, parsed.error);
      return;
    }
    const request = parsed.data;
    void streamRun(res, request.runId, (signal) => generateRecommendations(request, provider, signal));
  });

  return router;
}
