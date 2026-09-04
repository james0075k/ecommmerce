'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';

import { FadeInOnScroll } from '@/components/animations/fade-in-on-scroll';
import { ProductCard } from '@/components/shop/product-card';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import {
  discountPercent,
  type ProductListItem,
  type ProductListResponse,
} from '@/lib/catalog';

import { FlipCountdown } from './flip-countdown';

interface Deal {
  product: ProductListItem;
  discount: number;
}

/**
 * Flash sale.
 *
 * The catalogue has no "on sale" filter - a discount is simply a product whose
 * `compareAtPrice` is above its price - so this pulls the most popular page and
 * keeps the marked-down rows. Filtering here rather than adding a server flag
 * keeps the definition of "on sale" in one place: the price itself.
 */
export function FlashSale() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['flash-sale'],
    queryFn: () =>
      apiFetch<ProductListResponse>('/products?sort=popular&limit=24&inStock=true'),
    staleTime: 60_000,
  });

  const deals = React.useMemo<Deal[]>(() => {
    const rows: Deal[] = [];

    for (const product of data?.items ?? []) {
      const discount = discountPercent(product.price, product.compareAtPrice);
      if (discount !== null) rows.push({ product, discount });
    }

    // Deepest discount first - the point of the rail is the best price on it.
    return rows.sort((a, b) => b.discount - a.discount).slice(0, 12);
  }, [data]);

  // Nothing is marked down today: the section would be a countdown to an empty
  // shelf, so it does not render at all.
  if (!isPending && (isError || deals.length === 0)) return null;

  const best = deals[0]?.discount ?? 0;

  return (
    <section className="bz-defer-paint relative isolate overflow-hidden border-y border-border bg-muted/40 py-16 md:py-24">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(60rem 30rem at 15% 0%, color-mix(in srgb, var(--bz-secondary) 16%, transparent), transparent 70%)',
        }}
      />

      <div className="container-bazaar">
        <FadeInOnScroll className="mb-8 flex flex-col gap-6 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sale/15 px-3 py-1 font-mono text-xs tracking-widest text-deal uppercase">
              <Flame className="size-3.5" />
              Flash sale
            </span>
            <h2 className="font-display text-2xl font-bold tracking-tight text-balance md:text-3xl lg:text-4xl">
              {best > 0 ? `Up to ${best}% off, until midnight` : 'Today only, until midnight'}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground text-pretty md:text-base">
              Prices reset when the clock does. Stock is live - what you see is what is
              actually in the warehouse.
            </p>
          </div>

          <FlipCountdown className="shrink-0" />
        </FadeInOnScroll>

        {isPending ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-80 rounded-md" />
            ))}
          </div>
        ) : (
          <Carousel opts={{ align: 'start', loop: deals.length > 4 }} className="group/carousel">
            <CarouselContent className="-ml-4">
              {deals.map(({ product }) => (
                <CarouselItem
                  key={product.id}
                  className="basis-1/2 pl-4 md:basis-1/3 lg:basis-1/4"
                >
                  {/* No extra discount badge here: ProductCard already renders
                      the percentage in the sale colour at the top left, and two
                      badges saying the same number is noise, not emphasis. */}
                  <ProductCard product={product} />
                </CarouselItem>
              ))}
            </CarouselContent>

            <CarouselPrevious className="hidden md:inline-flex" />
            <CarouselNext className="hidden md:inline-flex" />
          </Carousel>
        )}

        <div className="mt-8 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/products?sort=popular">See everything on offer</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
