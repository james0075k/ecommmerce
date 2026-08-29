import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ['@bazaar/ui', '@bazaar/shared'],

  images: {
    // A1.1: modern formats with automatic srcset.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: '**.amazonaws.com' }],
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
    ];
  },
};

export default nextConfig;
