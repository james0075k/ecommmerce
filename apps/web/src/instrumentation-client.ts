import * as Sentry from '@sentry/nextjs';

/**
 * Sentry in the browser (Phase 12.8). Next loads this before hydration, which
 * is what lets it catch an error thrown during the first render.
 *
 * Deliberately lean: no session replay and no `browserTracingIntegration` with
 * a full sample rate. Phase 11 fought for a 150KB first-load budget and the
 * replay bundle alone is around 50KB gzipped - it would eat a third of the
 * budget to record sessions nobody has asked to watch. PostHog already provides
 * replay behind consent (see components/providers/posthog-provider.tsx); this
 * is here to report crashes.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_RELEASE_VERSION,

  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

  sendDefaultPii: false,

  // Extensions and third-party scripts throw into the page's error handler.
  // Left unfiltered they are the single largest source of issues in any
  // browser SDK, and none of them are Bazaar's bugs.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
  ],

  beforeSend(event) {
    // The storefront puts order ids and reset tokens in query strings. The URL
    // is worth keeping; the values are not worth storing in a third-party
    // service.
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        for (const key of ['token', 'code', 'paymentId', 'next']) {
          if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
        }
        event.request.url = url.toString();
      } catch {
        // A malformed URL is not worth dropping the event over.
      }
    }

    return event;
  },
});

/**
 * Instruments client-side route changes so a navigation that errors is
 * attributed to the route it was going to, not the one it left.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
