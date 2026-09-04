'use client';

import * as React from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { Home, RefreshCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * The 500 page (Phase 12.10).
 *
 * Next 16 passes `retry`, not `reset`: it re-fetches and re-renders the
 * segment's children, so a transient API failure genuinely recovers rather than
 * re-running a render over the same stale data.
 *
 * `error.digest` is the only thing that connects what the shopper saw to the
 * stack trace in Sentry - a server component's real message is deliberately not
 * sent to the browser. It is shown, quietly, because a support conversation
 * that starts with the digest is a short one.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  React.useEffect(() => {
    // The server side of this error is already reported by `onRequestError` in
    // instrumentation.ts. This catches the client-side half - a render that
    // threw during hydration never reaches the server at all.
    Sentry.captureException(error);
  }, [error]);

  return (
    <main
      id="main"
      className="grid min-h-dvh place-items-center bg-background px-4 py-16 text-center"
    >
      <div className="max-w-md space-y-6">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="size-7" aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            Something went wrong at our end
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            This is a fault on the server, not anything you did. It has been reported
            automatically. Trying again often works - the cause is usually brief.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => retry()}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="size-4" />
              Back to the store
            </Link>
          </Button>
        </div>

        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            Reference: <span className="numeric">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </main>
  );
}
