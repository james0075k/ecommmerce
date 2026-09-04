import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ProductGridSkeleton } from '@/components/shop/product-grid-skeleton';
import { buildCatalogQuery, readCatalogQuery, toSearchParams } from '@/lib/catalog-query';
import { getProductPage } from '@/lib/catalog-server';
import { ProductsView } from './products-view';

export const metadata: Metadata = {
  title: 'All products',
  description:
    'Browse the full Bazaar catalog. Filter by category, price, brand and rating, with delivery to all 77 districts.',
};

/**
 * The listing route.
 *
 * Phase 11 turns this into a server component that fetches the first page
 * itself (A2: data fetching on the server). Before, the HTML was a skeleton and
 * the products arrived only after hydration, a script download and a round trip
 * to the API - three serial waits before the LCP element existed. Now the grid
 * is in the document, and `ProductsView` picks it up as React Query's initial
 * data rather than re-fetching it.
 *
 * The interactive half is untouched: filters still live in the URL, still
 * re-fetch from the browser, and still keep the previous page on screen while
 * the next loads. Only the first paint moved.
 *
 * The fetch reads through Next's data cache (five minutes, matching the API's
 * own Redis TTL), so a burst of visitors to `/products` costs the API one query
 * rather than one each.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const query = readCatalogQuery(toSearchParams(resolved));
  const page = await getProductPage(buildCatalogQuery(query));

  return (
    // ProductsView reads every filter from the query string, so it needs a
    // Suspense boundary for the shell to prerender.
    <Suspense
      fallback={
        <div className="container-bazaar py-8">
          <ProductGridSkeleton />
        </div>
      }
    >
      <ProductsView
        // `null` when the API is unreachable. The view then behaves exactly as
        // it did before this page fetched anything - it queries from the
        // browser and shows its own skeleton - so an API outage degrades the
        // first paint rather than breaking the route.
        initialPage={page ? { query, ...page } : undefined}
      />
    </Suspense>
  );
}
