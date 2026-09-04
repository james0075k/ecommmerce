'use client';

import { useQuery } from '@tanstack/react-query';

import { RECOMMENDATION_REASON_LABELS } from '@bazaar/shared/constants';

import { StaggerChildren } from '@/components/animations/stagger-children';
import { ProductCard } from '@/components/shop/product-card';
import { ProductGridSkeleton } from '@/components/shop/product-grid-skeleton';
import { fetchRecommendedForYou } from '@/lib/ai';

import { SectionHeading } from './section-heading';

/** What the section says about itself, given what actually drove the ranking. */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  BOUGHT_TOGETHER: 'Picked from what shoppers buy alongside the things you have been looking at.',
  RECENTLY_VIEWED: 'Based on the products you have opened recently.',
  SIMILAR_PRICE: 'In the range you have been browsing.',
  SAME_CATEGORY: 'More from the categories you have been in.',
  POPULAR: 'What the rest of Nepal is buying this week. Browse a little and this becomes yours.',
};

/**
 * E3: the personalised homepage rail.
 *
 * The heading is derived from the rail's own `reason` rather than hardcoded,
 * because the honest label changes with the data: a first-time visitor is
 * looking at popular products, and calling that "recommended for you" would be
 * a small lie told on every first visit.
 *
 * `staleTime` is short - the whole point is that it moves as the visitor
 * browses, so it should not be served from cache after they have opened three
 * more products.
 */
export function RecommendedForYou() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['recommendations', 'for-you'],
    queryFn: fetchRecommendedForYou,
    staleTime: 30_000,
    retry: false,
  });

  const products = data?.items ?? [];

  if (!isPending && (isError || products.length === 0)) return null;

  const reason = data?.reason ?? 'POPULAR';

  return (
    <section className="bz-defer-paint container-bazaar py-16 md:py-24">
      <SectionHeading
        title={reason === 'POPULAR' ? 'Popular right now' : 'Recommended for you'}
        description={DESCRIPTIONS[reason] ?? RECOMMENDATION_REASON_LABELS.POPULAR}
        action={{ label: 'Browse everything', href: '/products' }}
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
