import * as Sentry from '@sentry/nextjs';

/**
 * Next's instrumentation hook. Runs once per runtime, before any request is
 * served (Phase 12.8).
 *
 * The two runtimes need separate SDK builds - the edge one has no Node APIs -
 * so the config is imported dynamically rather than at module scope. A static
 * import of the Node config would be bundled into the edge runtime and fail
 * there at build time.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

/**
 * Errors thrown while rendering a server component never reach a route
 * handler's try/catch and would otherwise appear only as a 500 in the Vercel
 * log. This is the hook that attributes them to a route.
 */
export const onRequestError = Sentry.captureRequestError;
