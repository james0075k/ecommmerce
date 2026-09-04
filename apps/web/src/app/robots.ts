import type { MetadataRoute } from 'next';

/**
 * `/robots.txt` (Phase 12.10).
 *
 * Two things this file is not: a security control, and a way to keep a page out
 * of the index. `Disallow` asks a crawler not to *fetch* a URL - a disallowed
 * page that is linked from elsewhere can still be indexed, listed with no
 * description. Anything that must stay out of results carries `robots: noindex`
 * in its own metadata, and anything that must stay private is behind the
 * middleware in `proxy.ts`. This is about crawl budget.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );

  /**
   * A preview deployment answers on a vercel.app domain with the whole
   * catalogue on it. Indexed, it competes with production for the same queries
   * and splits the ranking between two hosts. Preview builds therefore refuse
   * every crawler outright.
   */
  const isPreview = process.env.VERCEL_ENV === 'preview';

  if (isPreview) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        // Personal, and useless to a crawler.
        '/account',
        '/orders',
        '/wishlist',
        '/checkout',
        '/admin',
        // Auth screens. Crawling them produces a set of near-identical thin
        // pages and, for the callback, a URL with a one-time code in it.
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
        '/auth/',
        // The PWA's offline shell. It is real HTML with no content in it.
        '/offline',
        // Faceted listings multiply: eight filters produce thousands of URLs
        // that all render subsets of one page, and a crawler will happily spend
        // its entire budget there instead of on products. The unfiltered
        // /products and /categories pages stay crawlable and link to
        // everything the sitemap lists.
        '/products?',
        '/search?',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
