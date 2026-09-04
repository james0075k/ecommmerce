import type { MetadataRoute } from 'next';

import { getCategoryTree, getProductPage } from '@/lib/catalog-server';
import type { CategoryNode } from '@/lib/catalog';

/**
 * `/sitemap.xml` (Phase 12.10).
 *
 * Generated from the live catalogue rather than hand-maintained: a sitemap that
 * lists products which no longer exist is worse than none, because Google reads
 * the 404s as a quality signal for the whole site.
 *
 * Cached rather than rebuilt per request, which would run two API queries for
 * every crawler hit. An hour is the ceiling; in practice the route inherits the
 * shorter revalidate of the catalogue fetch inside it (5 minutes), and Next
 * reports that in the build output. Fresher than asked for is the right
 * direction to be wrong in.
 */
export const revalidate = 3600;

/**
 * Google ignores anything past 50,000 URLs (or 50MB) in a single sitemap. Well
 * under that here, but the cap is what keeps a catalogue that grows tenfold
 * from silently producing an invalid file. Past this, split with
 * `generateSitemaps`.
 */
const MAX_PRODUCTS = 5000;

/**
 * `priority` is relative *within* this site and nothing more - it does not
 * raise a page in the results. It is a hint about which pages matter when the
 * crawler has a limited budget, which for a new store it does.
 */
const STATIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
}> = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/products', priority: 0.9, changeFrequency: 'daily' },
  { path: '/categories', priority: 0.8, changeFrequency: 'weekly' },
  // Legal pages: low priority, but they belong in the index. A store whose
  // refund policy cannot be found is one shoppers do not trust.
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/refunds', priority: 0.3, changeFrequency: 'yearly' },
];

/** Depth-first walk of the category tree - the API returns it nested. */
function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // Both reads degrade to nothing rather than failing the route: a build or a
  // revalidation that happens while the API is restarting should produce a
  // smaller sitemap, not a 500 that Google records against the domain.
  const [categories, products] = await Promise.all([
    getCategoryTree(),
    getProductPage(`limit=${MAX_PRODUCTS}&sort=newest`),
  ]);

  for (const category of flatten(categories)) {
    // An empty category is a page of nothing. Crawling it costs budget that a
    // product page could have had.
    if (category.productCount === 0) continue;

    entries.push({
      url: `${siteUrl}/categories/${category.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
  }

  for (const product of products?.data.items ?? []) {
    entries.push({
      url: `${siteUrl}/products/${product.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      // Featured products first when the crawl budget runs out.
      priority: product.isFeatured ? 0.8 : 0.6,
    });
  }

  return entries;
}
