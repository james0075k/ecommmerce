'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import type { Metric } from 'web-vitals';

import { API_BASE_URL } from '@/lib/api';

/** The metrics worth storing. Anything else the library grows is ignored. */
const REPORTED = new Set(['LCP', 'CLS', 'INP', 'FCP', 'TTFB', 'FID']);

const SESSION_KEY = 'bz-analytics-session';

/**
 * Reports Core Web Vitals from real page loads (Phase 11).
 *
 * Lighthouse measures one machine on one throttled connection. This measures
 * the phones people actually own on the networks they are actually on, which is
 * the number the J1 budget is really about - a build can pass a 95 in CI and
 * still have a p75 LCP of four seconds in the field.
 *
 * `useReportWebVitals` is Next's own hook, so this adds no library to the
 * bundle: the web-vitals code is already inside the framework runtime, and the
 * `Metric` import above is a type, erased at build. The hook fires once per
 * metric per page load, at the moment each one becomes final - LCP when the
 * largest paint has settled, CLS and INP only at page hide.
 *
 * Because of that timing the send is `sendBeacon`, not `fetch`: a `fetch`
 * started during `visibilitychange` is cancelled when the tab goes away, which
 * silently drops exactly the two metrics that are hardest to collect.
 *
 * FID is still accepted at the API even though the library has replaced it with
 * INP - a visitor on a cached older bundle can still be sending it, and dropping
 * their data would put a hole in the series.
 */
export function WebVitalsProvider() {
  const pathname = usePathname();

  // Read through a ref rather than closed over. Next re-invokes any *new*
  // callback with every metric collected so far, so a callback whose identity
  // changed on navigation would re-send the whole page load's metrics a second
  // time and double every count. The reference below never changes.
  //
  // Written in an effect, not during render: a render can be thrown away or
  // replayed, and a ref mutated on the way through would survive it.
  const pathRef = React.useRef(pathname);

  React.useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  const report = React.useCallback((metric: Metric) => {
    if (!REPORTED.has(metric.name)) return;

    const sessionId = readSessionId();
    if (!sessionId) return;

    const body = JSON.stringify({
      sessionId,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      // The route, not the URL: `/products/blue-shirt` and `/products/red-hat`
      // are one page for the purpose of a p75, and keeping the full path would
      // shard the series across every slug in the catalogue.
      pagePath: normalisePath(pathRef.current),
      connection: readConnection(),
    });

    const url = `${API_BASE_URL}/analytics/vitals`;

    try {
      // A Blob with an explicit type: sendBeacon sends a bare string as
      // text/plain, which the API's JSON body parser will not touch.
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    } catch {
      // Some privacy modes disable sendBeacon outright. Fall through.
    }

    // Only reached when the beacon was refused, which means the page is
    // probably still alive - so a keepalive fetch has a real chance here.
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // A missing sample is a gap in a percentile, not an error to surface.
    });
  }, []);

  useReportWebVitals(report);

  return null;
}

/**
 * Collapses dynamic segments so metrics group by route rather than by URL.
 *
 * `usePathname` returns the resolved path, so the route pattern has to be
 * recovered by shape. The routes that carry an id are known and few, which is
 * why this is a short list rather than a general rule.
 */
function normalisePath(pathname: string | null): string {
  if (!pathname) return '/';

  return pathname
    .replace(/^\/products\/[^/]+$/, '/products/[slug]')
    .replace(/^\/orders\/[^/]+/, '/orders/[id]')
    .replace(/^\/wishlist\/shared\/[^/]+$/, '/wishlist/shared/[token]')
    .replace(/^\/admin\/(products|customers)\/[^/]+/, '/admin/$1/[id]')
    .slice(0, 500);
}

/** The effective connection type, where the browser exposes it. */
function readConnection(): string | null {
  const connection = (
    navigator as Navigator & { connection?: { effectiveType?: string } }
  ).connection;

  return connection?.effectiveType ?? null;
}

/**
 * The same per-tab id the page-view beacon uses, so a slow load and the visit
 * it belongs to can be joined. Never created here: if analytics has not run,
 * there is no session to attach a measurement to.
 */
function readSessionId(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
