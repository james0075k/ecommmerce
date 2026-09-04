'use client';

import { useQuery } from '@tanstack/react-query';

import { StaggerChildren } from '@/components/animations/stagger-children';
import { ProductCard } from '@/components/shop/product-card';
import { ProductGridSkeleton } from '@/components/shop/product-grid-skeleton';
import { apiFetch } from '@/lib/api';
import type { ProductListResponse } from '@/lib/catalog';

import { SectionHeading } from './section-heading';

/**
 * The trending grid, heading included.
 *
 * The heading lives here rather than on the page so the two disappear together
 * - a section title with nothing under it is worse than no section at all, and
 * the page cannot know whether the fetch found anything.
 *
 * `ProductCard` is already a motion component carrying the `scaleIn` variant,
 * so the cards are children of `StaggerChildren` directly rather than being
 * wrapped in `StaggerItem` - wrapping them would animate the wrapper and the
 * card, and the two would fight.
 */
export function TrendingProducts() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['trending-products'],
    queryFn: () => apiFetch<ProductListResponse>('/products?sort=popular&limit=8'),
    staleTime: 60_000,
  });

  const products = data?.items ?? [];

  if (!isPending && (isError || products.length === 0)) return null;

  return (
    <section className="bz-defer-paint container-bazaar py-16 md:py-24">
      <SectionHeading
        title="What everyone is buying this week"
        description="Ranked by what actually left the warehouse, not by what we would like to sell."
        action={{ label: 'See all products', href: '/products' }}
      />

      {isPending ? (
        <ProductGridSkeleton
          count={8}
          className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4"
        />
      ) : (
        <StaggerChildren
          stagger={0.1}
          amount={0.1}
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </StaggerChildren>
      )}
    </section>
  );
}
