import { resolve } from 'node:path';
import { loadEnv } from './config/env';
import { createApp } from './app';
import { createOpenAiCompatibleProvider } from './llm/openai-compatible.provider';

const env = loadEnv();

const provider = createOpenAiCompatibleProvider({
  baseUrl: env.GEMINI_BASE_URL,
  apiKey: env.GEMINI_API_KEY,
  model: env.GEMINI_MODEL,
});

const app = createApp({
  provider,
  clientDistDir: resolve(process.cwd(), 'dist/analysis-assistant/browser'),
});

app.listen(env.PORT, () => {
  console.log(`Analysis Assistant listening on http://localhost:${env.PORT}`);
});
