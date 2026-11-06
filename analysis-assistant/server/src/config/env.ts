import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-3.8-flash'),
  GEMINI_BASE_URL: z
    .string()
    .refine(
      (value) => {
        try {
          return new URL(value).protocol === 'https:';
        } catch {
          return false;
        }
      },
      'GEMINI_BASE_URL must be a valid HTTPS URL.',
    )
    .default('https://generativelanguage.googleapis.com/v1beta/openai/'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration. ${problems.join('; ')}`);
  }
  return parsed.data;
}
