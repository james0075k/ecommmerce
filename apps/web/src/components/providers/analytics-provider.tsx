'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { API_BASE_URL, getAccessToken } from '@/lib/api';

const SESSION_KEY = 'bz-analytics-session';

/**
 * The storefront's page-view beacon (Phase 8).
 *
 * First-party and deliberately minimal: a random session id in `sessionStorage`,
 * the path, and the referrer. No cookie, no fingerprint, no third-party script.
 * The id dies with the tab, which is exactly the lifetime "a visit" should have
 * and is why this needs no consent banner to be honest about.
 *
 * Admin routes are excluded. An operator refreshing the dashboard forty times
 * would otherwise show up as forty visitors and quietly ruin the conversion
 * rate the dashboard is reporting.
 */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The referrer for the *first* page of the session is the external one that
  // matters. Captured once on mount, because after a client-side navigation
  // `document.referrer` still reports whatever brought them to the app, and
  // sending it on every hit would count one Google visit as six.
  const landingReferrer = React.useRef<string | null>(null);
  const sent = React.useRef<string | null>(null);

  React.useEffect(() => {
    landingReferrer.current = document.referrer || null;
  }, []);

  React.useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;

    // React runs effects twice in development Strict Mode, and a page-view
    // counter that double-counts is worse than no counter.
    const key = `${pathname}?${searchParams.toString()}`;
    if (sent.current === key) return;
    sent.current = key;

    const sessionId = readSessionId();
    if (!sessionId) return;

    const isFirstHit = landingReferrer.current !== null && sent.current === key;

    void fetch(`${API_BASE_URL}/analytics/track`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(getAccessToken() && { Authorization: `Bearer ${getAccessToken()}` }),
      },
      body: JSON.stringify({
        sessionId,
        pagePath: pathname,
        referrer: isFirstHit ? landingReferrer.current : null,
      }),
      // Analytics must never delay or block the page it is measuring.
      keepalive: true,
    }).catch(() => {
      // A failed beacon is a missing row, not an error worth surfacing.
    });

    // Only the landing hit carries the external referrer.
    landingReferrer.current = null;
  }, [pathname, searchParams]);

  return null;
}

/**
 * A per-tab random id.
 *
 * Wrapped because `sessionStorage` throws outright in some privacy modes rather
 * than returning null - and a shopper with storage disabled should still be
 * able to use the store, just not be counted.
 */
function readSessionId(): string | null {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const id = `s-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return null;
  }
}
