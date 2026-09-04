'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';

import { StaggerChildren, StaggerItem } from '@/components/animations/stagger-children';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import type { CategoryNode } from '@/lib/catalog';
import { cn } from '@/lib/utils';

import { SectionHeading } from './section-heading';

/**
 * Bento layouts, keyed by how many departments there are.
 *
 * Every one of them tiles a rectangle exactly - a hero tile plus whatever fills
 * the rows beside and below it - because a bento with a hole in it reads as a
 * bug rather than as a composition. The store has three root categories today
 * and could have six tomorrow, so each count gets its own arrangement instead
 * of one pattern that only looks right at a single size.
 *
 *   3  A A B / A A C            (3 cols, 2 rows)
 *   4  A A B B / A A C D        (4 cols, 2 rows)
 *   5  + a full-width banner    (4 cols, 3 rows)
 *   6  A A B B / A A C D / E F F F / E F F F
 */
const LAYOUTS: Record<number, { grid: string; spans: string[] }> = {
  3: {
    grid: 'lg:auto-rows-[12rem] lg:grid-cols-3',
    spans: ['lg:col-span-2 lg:row-span-2', 'lg:col-span-1', 'lg:col-span-1'],
  },
  4: {
    grid: 'lg:auto-rows-[12rem] lg:grid-cols-4',
    spans: [
      'lg:col-span-2 lg:row-span-2',
      'lg:col-span-2',
      'lg:col-span-1',
      'lg:col-span-1',
    ],
  },
  5: {
    grid: 'lg:auto-rows-[11rem] lg:grid-cols-4',
    spans: [
      'lg:col-span-2 lg:row-span-2',
      'lg:col-span-2',
      'lg:col-span-1',
      'lg:col-span-1',
      'lg:col-span-4',
    ],
  },
  6: {
    grid: 'lg:auto-rows-[11rem] lg:grid-cols-4',
    spans: [
      'lg:col-span-2 lg:row-span-2',
      'lg:col-span-2',
      'lg:col-span-1',
      'lg:col-span-1',
      'lg:col-span-1 lg:row-span-2',
      'lg:col-span-3 lg:row-span-2',
    ],
  },
};

export function CategoryBento() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryNode[]>('/categories'),
    staleTime: 5 * 60_000,
  });

  // Only the roots: a bento of sub-categories reads as a list, not a map of
  // the store.
  const categories = (data ?? []).filter((category) => category.productCount > 0).slice(0, 6);
  const layout = LAYOUTS[categories.length];

  return (
    <section className="container-bazaar py-16 md:py-24">
      <SectionHeading
        eyebrow="Browse"
        title="Start where you already know"
        description={
          categories.length > 0
            ? `${categories.length} departments, every one of them stocked and shipping today.`
            : 'Every department, stocked and shipping today.'
        }
        action={{ label: 'All categories', href: '/products' }}
      />

      {isPending ? (
        <CategoryBentoSkeleton />
      ) : isError || categories.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Categories are unavailable right now.{' '}
          <Link href="/products" className="text-primary underline underline-offset-4">
            Browse everything instead
          </Link>
          .
        </p>
      ) : (
        <StaggerChildren
          stagger={0.08}
          amount={0.15}
          className={cn(
            'grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4',
            // One or two departments have no interesting arrangement, so they
            // fall back to an even row rather than a lopsided one.
            layout?.grid ?? 'lg:auto-rows-[15rem] lg:grid-cols-2',
          )}
        >
          {categories.map((category, index) => (
            <StaggerItem
              key={category.id}
              className={cn('min-h-44', layout?.spans[index])}
            >
              <CategoryTile category={category} eager={index < 2} />
            </StaggerItem>
          ))}
        </StaggerChildren>
      )}
    </section>
  );
}

function CategoryTile({
  category,
  eager,
}: {
  category: CategoryNode;
  /**
   * The two tiles that are above the fold on a phone. Eager rather than
   * preloaded: the bento reflows from one column to a two-column asymmetric
   * grid, so which tile is largest - and therefore the LCP candidate - depends
   * on the viewport, and Next's guidance is to avoid `preload` in exactly that
   * case.
   */
  eager: boolean;
}) {
  return (
    <Link
      href={`/products?category=${category.slug}`}
      className="group/tile relative flex h-full min-h-44 flex-col justify-end overflow-hidden rounded-lg border border-border bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {category.imageUrl ? (
        <Image
          src={category.imageUrl}
          alt=""
          fill
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw"
          className="object-cover transition-transform duration-500 ease-out group-hover/tile:scale-[1.08] motion-reduce:group-hover/tile:scale-100"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          // No image on the record, so the tile still gets a face - derived
          // from the slug, so it is stable rather than random per render.
          style={{ backgroundImage: gradientFor(category.slug) }}
        />
      )}

      {/* Two layers: a permanent bottom scrim for the label, and a full-tile
          wash that deepens on hover. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover/tile:bg-black/25" />

      <div className="relative flex items-end justify-between gap-3 p-4 text-white">
        <div className="min-w-0">
          <h3 className="font-display truncate text-lg font-bold tracking-tight">
            {category.name}
          </h3>
          <p className="numeric mt-0.5 text-xs text-white/75">
            {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
          </p>
        </div>

        <span
          aria-hidden
          className="grid size-9 shrink-0 translate-y-2 place-items-center rounded-full bg-white/15 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover/tile:translate-y-0 group-hover/tile:opacity-100 group-focus-visible/tile:translate-y-0 group-focus-visible/tile:opacity-100"
        >
          <ArrowUpRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

/**
 * The skeleton uses the three-tile layout: it is the shape the store actually
 * has, so the swap to real tiles does not move anything (J1: CLS under 0.05).
 */
function CategoryBentoSkeleton() {
  const layout = LAYOUTS[3];

  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4', layout.grid)}>
      {layout.spans.map((span, index) => (
        <Skeleton key={index} className={cn('min-h-44 rounded-lg', span)} />
      ))}
    </div>
  );
}

/** A stable two-stop gradient per slug, so a tile never flickers between renders. */
function gradientFor(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${hash} 60% 26%), hsl(${(hash + 48) % 360} 65% 45%))`;
}
