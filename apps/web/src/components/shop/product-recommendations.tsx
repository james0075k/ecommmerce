'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { RECOMMENDATION_REASON_LABELS } from '@bazaar/shared/constants';

import { ProductCard } from '@/components/shop/product-card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { fetchProductRecommendations, trackProductView } from '@/lib/ai';
import type { ProductListItem } from '@/lib/catalog';

/**
 * E3: the recommendation rail under a product.
 *
 * `fallback` is the server-rendered "more in this category" list that already
 * came down with the page. It renders immediately and is replaced the moment
 * the blended ranking arrives - so the section never flashes empty, and a
 * recommender outage degrades to the same rail the page shipped with rather
 * than to a hole.
 *
 * Recording the view lives here rather than in the page because this is the
 * component that cares about the history: the thing that writes the signal and
 * the thing that reads it stay in one file.
 */
export function ProductRecommendations({
  productId,
  categoryName,
  fallback,
}: {
  productId: string;
  categoryName: string;
  fallback: ProductListItem[];
}) {
  React.useEffect(() => {
    trackProductView(productId);
  }, [productId]);

  const { data } = useQuery({
    queryKey: ['recommendations', 'product', productId],
    queryFn: () => fetchProductRecommendations(productId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const items = data?.items.length ? data.items : fallback;
  if (items.length === 0) return null;

  const heading = data ? RECOMMENDATION_REASON_LABELS[data.reason] : `More in ${categoryName}`;

  return (
    <section className="mt-14">
      <h2 className="font-display mb-4 text-xl font-bold tracking-tight">{heading}</h2>

      <Carousel opts={{ align: 'start', slidesToScroll: 1 }}>
        <CarouselContent className="-ml-4">
          {items.map((item) => (
            <CarouselItem
              key={item.id}
              className="basis-[70%] pl-4 sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
            >
              <ProductCard product={item} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="hidden sm:flex" />
        <CarouselNext className="hidden sm:flex" />
      </Carousel>
    </section>
  );
}
