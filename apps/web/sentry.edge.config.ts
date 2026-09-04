import * as Sentry from '@sentry/nextjs';

/**
 * Sentry for the Edge runtime (Phase 12.8).
 *
 * `proxy.ts` runs here: it verifies the session cookie on every protected
 * route, and it fails closed. A bug there logs everyone out rather than
 * throwing a visible error, so edge errors are exactly the ones that would
 * otherwise go unnoticed.
 *
 * The edge runtime has no Node APIs, so this is a separate, smaller
 * initialisation - it cannot share the server config.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_RELEASE_VERSION,

  // Middleware runs on every matched request, so a full trace rate here is a
  // large bill for very little signal.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

  sendDefaultPii: false,
});
