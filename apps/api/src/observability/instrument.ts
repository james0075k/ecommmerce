import * as Sentry from '@sentry/nestjs';

/**
 * Sentry has to be initialised before anything it instruments is imported, so
 * this file is the very first import in `main.ts` and must stay there. Moving
 * it below the AppModule import silently loses HTTP and Prisma spans - nothing
 * errors, the traces are just empty.
 *
 * It reads `process.env` directly rather than ConfigService: at this point the
 * Nest container does not exist. Every host injects real environment variables
 * (Railway, Vercel, GitHub Actions), so the only case that loses out is a local
 * `.env`, which ConfigModule loads later - and running a laptop's errors into
 * the production Sentry project was never wanted anyway.
 *
 * No DSN means no initialisation at all, which is the local default.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.RELEASE_VERSION,

    // Performance monitoring (Phase 12.8). Sampled, because a trace per request
    // at Bazaar's traffic is a bill rather than a signal. 10% still surfaces a
    // p95 regression within minutes.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    // D1: the refresh token lives in a cookie and the Authorization header
    // carries a JWT. Neither belongs in an error report, and `sendDefaultPii`
    // defaults to false precisely so they are not attached - stated here so
    // nobody turns it on without reading this comment.
    sendDefaultPii: false,

    beforeSend(event) {
      // Belt and braces: scrub the headers that carry credentials even if a
      // future integration starts attaching request data.
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-api-key'];
      }
      return event;
    },
  });
}

/** True when errors are actually being reported. Used by the health report. */
export const sentryEnabled = Boolean(dsn);
