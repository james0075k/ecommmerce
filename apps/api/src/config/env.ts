import { z } from 'zod';

/**
 * `FOO=""` in a .env file is not an absent value - it is an empty string, and
 * `z.string().url()` rejects it. Every optional URL below is a variable that
 * ships commented-in-but-blank in `.env.example`, so treat blank as unset
 * rather than making a fresh checkout fail to boot (Phase 12).
 */
const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

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
  /**
   * Phase 12: the analytics dashboard runs aggregate scans over orders and
   * page views. Pointed at a replica, those never contend with checkout on the
   * primary. Unset means every query goes to the primary, which is correct -
   * just slower under load.
   */
  DATABASE_REPLICA_URL: optionalUrl,

  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  MEILI_HOST: optionalUrl,
  MEILI_MASTER_KEY: optionalString,

  // AI is optional infrastructure: without a key the /ai routes answer 503 and
  // the rest of the store carries on. Failing to boot over a feature that only
  // writes marketing copy would be the wrong trade.
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  /* --- Phase 12: delivery, observability, hardening --------------------- */

  /** CloudFront origin for uploaded media. Also an allowed `img-src` in the CSP. */
  CDN_URL: optionalUrl,

  /**
   * The public origin of the storefront. Used for the CSP `frame-ancestors`
   * and for links in operational emails. Distinct from CORS_ORIGIN, which may
   * list several origins (previews, admin).
   */
  WEB_PUBLIC_URL: optionalUrl,

  SENTRY_DSN: optionalUrl,
  /** Defaults to NODE_ENV. Set explicitly to separate `staging` from `production`. */
  SENTRY_ENVIRONMENT: optionalString,
  /**
   * Fraction of requests traced. 1.0 in staging is affordable and useful; in
   * production it is a bill. 10% is enough to see a latency regression.
   */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  /**
   * Ties an error, a metric and a deploy together. Railway and GitHub Actions
   * both expose the commit SHA; the deploy workflow passes it through.
   */
  RELEASE_VERSION: optionalString,

  /**
   * Bearer token Prometheus must present to `GET /metrics`. Unset leaves the
   * endpoint open, which is fine on a private network and wrong on a public
   * one - the deploy checklist requires it in production.
   */
  METRICS_TOKEN: optionalString,

  /**
   * How many reverse proxies sit in front of the API. Railway adds one; a CDN
   * in front of Railway adds another. Rate limiting keys on the client IP, and
   * the wrong number here either trusts a spoofed `X-Forwarded-For` or throttles
   * every user in the world as one.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
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
