import * as Sentry from '@sentry/nextjs';

/**
 * Sentry for the Node.js runtime - server components, route handlers and the
 * data fetching behind them (Phase 12.8). Loaded by `src/instrumentation.ts`.
 *
 * No DSN means no initialisation, which is the local default: a laptop's
 * errors do not belong in the production issue feed.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_RELEASE_VERSION,

  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

  // D1: the session cookie and the Authorization header are on every
  // authenticated server request. `sendDefaultPii: false` is the default and is
  // stated here so nobody flips it without reading this line.
  sendDefaultPii: false,

  // Sentry's own console breadcrumbs would otherwise echo every server log line
  // into every event, which is noise on a Vercel function that logs a lot.
  debug: false,
});
