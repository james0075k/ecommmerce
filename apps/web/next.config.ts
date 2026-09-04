import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

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

  // D4 security headers. CSP is added in Phase 12 once the CDN origins exist.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
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

export default analyze(nextConfig);
