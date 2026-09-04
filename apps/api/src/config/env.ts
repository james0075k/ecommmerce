import { z } from 'zod';

/**
 * Environment contract for the API.
 *
 * D1/D4: secrets never have defaults that would work in production - the process
 * refuses to boot rather than run with a placeholder JWT secret. Development
 * conveniences (ports, CORS origin) do get defaults.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_GLOBAL_PREFIX: z.string().default('api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  MEILI_HOST: z.string().url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),

  // AI is optional infrastructure: without a key the /ai routes answer 503 and
  // the rest of the store carries on. Failing to boot over a feature that only
  // writes marketing copy would be the wrong trade.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to ConfigModule as `validate`. Throwing here aborts bootstrap with a
 * readable list of what is missing instead of a runtime failure hours later.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return parsed.data;
}
