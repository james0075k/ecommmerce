'use client';

import * as React from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * The last resort (Phase 12.10): the root layout itself threw, so `error.tsx`
 * never mounted and neither did the fonts, the theme provider or globals.css.
 *
 * That is why this file styles itself inline and imports nothing but Sentry.
 * A stylesheet import here would be one more thing that can fail on the page
 * whose entire job is to work when everything else has failed. The colours are
 * the two `--bz-bg` values written literally, and `color-scheme` plus a media
 * query is what makes dark mode work without next-themes.
 *
 * Being here at all means something is badly wrong, so it reports first and
 * offers exactly one action.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        {/* No metadata export is allowed in a client component, so the title is
            set with React's own <title> support. */}
        <title>Something went wrong | Bazaar</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style>{`
          :root { color-scheme: light dark; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100dvh;
            display: grid;
            place-items: center;
            padding: 2rem 1rem;
            text-align: center;
            background: #EFECE6;
            color: #3B372F;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
          }
          /* This document renders when the React tree itself has failed, so it
             carries no stylesheet and no theme class - the OS preference is the
             only signal available. The values are --bz-bg, --bz-text and their
             dark partners, copied rather than referenced. */
          @media (prefers-color-scheme: dark) {
            body { background: #141210; color: #E8E3D9; }
            .bz-muted { color: #A39C90 !important; }
            .bz-button { background: #E8E3D9 !important; color: #141210 !important; }
          }
          h1 { font-size: 1.5rem; font-weight: 500; letter-spacing: -0.02em; margin: 0 0 .5rem; }
          p { margin: 0 0 1.5rem; font-size: .9rem; }
          .bz-muted { color: #67625A; }
          .bz-button {
            appearance: none; border: 0; cursor: pointer;
            background: #3B372F; color: #F5F3EF;
            font: inherit; font-weight: 600; font-size: .8125rem;
            text-transform: uppercase; letter-spacing: .09em;
            padding: .75rem 1.75rem; border-radius: 9999px;
          }
          .bz-ref { margin-top: 1.5rem; font-family: ui-monospace, SFMono-Regular, monospace; font-size: .75rem; }
        `}</style>
      </head>
      <body>
        <div style={{ maxWidth: '28rem' }}>
          <h1>Bazaar could not load</h1>
          <p className="bz-muted">
            Something failed before the page could be built. It has been reported. A
            reload usually clears it.
          </p>

          <button type="button" className="bz-button" onClick={() => retry()}>
            Reload
          </button>

          {error.digest ? (
            <p className="bz-ref bz-muted">Reference: {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
