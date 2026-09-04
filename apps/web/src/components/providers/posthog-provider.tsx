'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { useAnalyticsConsent } from '@/lib/hooks/use-consent';

/**
 * PostHog: product analytics, feature flags and session replay (Phase 12.8).
 *
 * Two things make this different from the first-party beacon next to it:
 *
 *  1. It loads nothing until consent is granted. `posthog-js` is imported
 *     dynamically inside the effect, so a visitor who declines never downloads
 *     it - the bundle cost is zero, not merely unused. That also keeps it off
 *     the first-load graph Phase 11 fought for.
 *  2. Withdrawing consent calls `opt_out_capturing()` and stops the recorder,
 *     rather than only hiding the banner. A consent UI that does not actually
 *     stop the tracking is worse than no consent UI.
 *
 * Admin routes are excluded for the same reason the first-party beacon excludes
 * them: an operator refreshing the dashboard is not a shopper.
 */
export function PostHogProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const granted = useAnalyticsConsent();

  const clientRef = React.useRef<typeof import('posthog-js').default | null>(null);

  React.useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    if (!granted) {
      // Consent withdrawn after it was given: stop capturing and stop the
      // recorder on the client that has already loaded. Nothing to do if it
      // never loaded, which is the common case.
      clientRef.current?.opt_out_capturing();
      return;
    }

    let cancelled = false;

    void import('posthog-js').then(({ default: posthog }) => {
      if (cancelled) return;

      if (!clientRef.current) {
        posthog.init(key, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
          // Pageviews are sent by the effect below instead. PostHog's automatic
          // capture listens for full page loads, and the App Router does client
          // navigations - half the journey would be missing.
          capture_pageview: false,
          capture_pageleave: true,
          persistence: 'localStorage+cookie',
          person_profiles: 'identified_only',
          // Replay is the reason PostHog needs consent at all. Inputs are
          // masked; an unmasked replay of a checkout form is a recording of
          // someone's address.
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '[data-private]',
          },
        });
        clientRef.current = posthog;
      }

      posthog.opt_in_capturing();
    });

    return () => {
      cancelled = true;
    };
  }, [granted]);

  // One capture per navigation, including client-side ones.
  React.useEffect(() => {
    if (!granted || !pathname || pathname.startsWith('/admin')) return;

    const query = searchParams.toString();
    clientRef.current?.capture('$pageview', {
      $current_url: `${window.location.origin}${pathname}${query ? `?${query}` : ''}`,
    });
  }, [granted, pathname, searchParams]);

  return null;
}
