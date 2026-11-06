import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('requires a non-blank Gemini API key', () => {
    expect(() => loadEnv({})).toThrow(/GEMINI_API_KEY/);
    expect(() => loadEnv({ GEMINI_API_KEY: '   ' })).toThrow(/GEMINI_API_KEY/);
  });

  it('rejects invalid Gemini endpoint configuration without exposing values', () => {
    expect(() =>
      loadEnv({
        GEMINI_API_KEY: 'test-key',
        GEMINI_BASE_URL: 'not-a-url',
      }),
    ).toThrow(/Invalid environment configuration/);

    expect(() =>
      loadEnv({
        GEMINI_API_KEY: 'test-key',
        GEMINI_BASE_URL: 'http://generativelanguage.googleapis.com/v1beta/openai/',
      }),
    ).toThrow(/GEMINI_BASE_URL must be a valid HTTPS URL/);
  });

  it('loads the configured model and default Gemini endpoint', () => {
    const config = loadEnv({ GEMINI_API_KEY: 'test-key' });

    expect(config).toMatchObject({
      PORT: 3001,
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'gemini-3.8-flash',
      GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  });
});
