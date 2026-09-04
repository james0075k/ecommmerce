import withBundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

import { buildContentSecurityPolicy } from './csp';

/**
 * `pnpm --filter @bazaar/web analyze` sets ANALYZE=true and opens the treemaps
 * after the build (Phase 11). The J1 budget is 150KB gzipped of JavaScript on
 * first load; the report is how that number gets defended rather than guessed
 * at, and it is the first place to look when a route regresses.
 */
const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

/**
 * A year, marked immutable. Safe only for content-addressed URLs - Next puts a
 * build hash in every file under `/_next/static`, so a changed file is a
 * changed URL and a cached one can never be stale.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ['@bazaar/ui', '@bazaar/shared'],

  // The `x-powered-by: Next.js` header names the framework and its major
  // version to anyone scanning, and buys nothing.
  poweredByHeader: false,

  // Ships one less byte-identical response per URL and keeps the canonical form
  // in the address bar, which matters for the SEO work in Phase 9.
  trailingSlash: false,

  images: {
    // A1.1: modern formats with automatic srcset. AVIF first - it is typically
    // 20-30% smaller than WebP at the same quality - with WebP behind it for
    // Safari before 16.4 and any browser that does not advertise AVIF.
    formats: ['image/avif', 'image/webp'],

    // The widths the optimiser is allowed to generate. Trimmed to the ones the
    // layouts actually request: every extra entry is another variant to encode
    // and store, and `sizes` never asks for the gaps between these.
    deviceSizes: [360, 420, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 120, 128, 256, 384],

    // Optimised images are content-addressed by src, width and quality, so a
    // long TTL is safe and a short one just re-encodes the same bytes. The
    // upstream `Cache-Control` still wins when it is longer.
    minimumCacheTTL: 60 * 60 * 24 * 30,

    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      // The catalog seed points every product and category image at picsum, so
      // without this the storefront renders with the optimiser refusing every
      // src it is given.
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
    ],
  },

  // D4 security headers. Phase 12 adds the CSP, now that the CDN, Sentry and
  // payment-gateway origins exist to name - see ./csp.ts.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(process.env) },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          // Isolates this origin from anything a shopper has open in another
          // tab: an opener cannot reach `window` here, and this browsing
          // context group is its own.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // HSTS: two years, subdomains included, and preloadable. Production
          // only - a localhost entry is cached for the full max-age and then
          // breaks every other http://localhost project on the machine, which
          // is genuinely painful to undo.
          ...(isProduction
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
      // Build output is content-addressed - the filenames carry a hash, so a
      // changed file is a changed URL and a cached one can never be stale. That
      // makes a year-long immutable TTL safe in production, and it is what
      // makes a repeat visit cost nothing but the HTML.
      //
      // Not in development: `next dev` rebuilds chunks under the same URLs on
      // every edit, and an immutable header there pins whatever the browser saw
      // first. Next warns about exactly this, and it is right to.
      ...(isProduction
        ? [
            {
              source: '/_next/static/:path*',
              headers: [{ key: 'Cache-Control', value: IMMUTABLE }],
            },
            {
              // Self-hosted fonts, hashed by next/font. A font re-downloaded on
              // every visit is a visible flash of fallback text on the slowest
              // connections.
              source: '/_next/static/media/:path*',
              headers: [
                { key: 'Cache-Control', value: IMMUTABLE },
                // Fonts are fetched in CORS mode even same-origin, so a CDN in
                // front of this needs the header to serve them to the document.
                { key: 'Access-Control-Allow-Origin', value: '*' },
              ],
            },
          ]
        : []),
      {
        // Static assets in /public are NOT content-addressed: `icon-192.png`
        // keeps its name across deploys. A day of browser cache with a long
        // shared cache and revalidation gets most of the benefit without
        // pinning a stale icon on someone's home screen for a year.
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        // The worker must never be served from cache: a stale sw.js pins every
        // caching rule inside it, including the bug you just shipped a fix for.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

/**
 * Sentry's build plugin (Phase 12.8). It does two things: rewrites the client
 * bundle so a minified stack trace can be symbolicated, and uploads the source
 * maps that make that possible.
 *
 * The upload needs SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT, which only
 * CI has. Without them the plugin skips the upload and the build still
 * succeeds, so a local `pnpm build` behaves exactly as it did before Phase 12.
 */
export default withSentryConfig(analyze(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // The plugin is chatty and its output is not useful on a green build.
  silent: !process.env.CI,

  // Uploaded and then deleted from the deployment. A .map served next to the
  // bundle hands your whole source tree to anyone who opens devtools.
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Proxies Sentry's ingest through the app's own origin, so an ad blocker
  // does not silently drop every error report. It costs one rewrite rule and
  // is the difference between an issue feed and an empty one.
  tunnelRoute: '/monitoring',

  // Strips Sentry's own debug logging from the client bundle. Phase 11's
  // first-load budget is measured in kilobytes and this is a few of them.
  disableLogger: true,

  // Instruments server components and route handlers on Vercel without a
  // separate build step.
  automaticVercelMonitors: true,
});
