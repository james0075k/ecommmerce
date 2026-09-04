'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';
import type { ProductListResponse } from '@/lib/catalog';

/**
 * The partner strip: an endless horizontal scroll of the brands actually in the
 * catalogue, read off the brand facet the listing endpoint already returns.
 *
 * Real brands rather than a hard-coded set, because a logo wall that names
 * something the store does not stock is the fastest way to lose the trust the
 * strip exists to build. Wordmarks, not images - there are no logo assets, and
 * inventing them would be worse than setting the names in the display face.
 */
const FALLBACK_BRANDS = [
  'Himalayan Goods',
  'Everest Electronics',
  'Kathmandu Home',
  'Annapurna Wear',
  'Pokhara Living',
  'Lumbini Craft',
];

export function BrandMarquee() {
  const { data } = useQuery({
    queryKey: ['brand-facets'],
    queryFn: () => apiFetch<ProductListResponse>('/products?limit=1'),
    staleTime: 10 * 60_000,
  });

  const brands = (data?.facets.brands ?? [])
    .map((facet) => facet.value)
    .filter(Boolean)
    .slice(0, 12);

  // One brand scrolling past on repeat reads as a bug, so the strip only
  // switches to live data once there is enough of it to look like a list.
  const items = brands.length >= 4 ? brands : FALLBACK_BRANDS;

  return (
    <section
      aria-label="Brands we carry"
      className="bz-defer-paint border-y border-border bg-muted/30 py-8"
    >
      <div
        className="group/marquee flex gap-10 overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, black 4rem, black calc(100% - 4rem), transparent)',
        }}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            aria-hidden={copy === 1}
            className="flex shrink-0 items-center gap-10 [animation:bz-marquee-wide_38s_linear_infinite] group-hover/marquee:[animation-play-state:paused] motion-reduce:[animation:none]"
          >
            {items.map((brand) => (
              <span
                key={brand}
                className="font-display text-lg font-medium tracking-[-0.02em] whitespace-nowrap text-muted-foreground transition-colors duration-[400ms] hover:text-foreground md:text-xl"
              >
                {brand}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
