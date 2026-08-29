import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ProductGridSkeleton } from '@/components/shop/product-grid-skeleton';
import { ProductsView } from './products-view';

export const metadata: Metadata = {
  title: 'All products',
  description:
    'Browse the full Bazaar catalog. Filter by category, price, brand and rating, with delivery to all 77 districts.',
};

export default function ProductsPage() {
  // ProductsView reads every filter from the query string, so it needs a
  // Suspense boundary for the shell to prerender.
  return (
    <Suspense
      fallback={
        <div className="container-bazaar py-8">
          <ProductGridSkeleton />
        </div>
      }
    >
      <ProductsView />
    </Suspense>
  );
}
