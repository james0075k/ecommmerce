'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { LayoutGrid, PackageOpen, Rows3, SlidersHorizontal } from 'lucide-react';

import { PRODUCT_SORT_OPTIONS } from '@bazaar/shared';
import { staggerChildren } from '@bazaar/ui';

import { CatalogFilters, type FilterState } from '@/components/shop/catalog-filters';
import { ProductCard } from '@/components/shop/product-card';
import { ProductGridSkeleton } from '@/components/shop/product-grid-skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { apiFetch } from '@/lib/api';
import type { CategoryNode, ProductListResponse } from '@/lib/catalog';

const PAGE_SIZE = 12;

/**
 * Product listing.
 *
 * Every filter lives in the URL, so a filtered view is shareable and the back
 * button works (G1: "all URL-synced for shareable filtered views").
 */
export function ProductsView() {
  const router = useRouter();
  const params = useSearchParams();

  const query = React.useMemo(() => readQuery(params), [params]);
  const [mode, setMode] = React.useState<'pages' | 'infinite'>('pages');

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryNode[]>('/categories'),
    staleTime: 5 * 60_000,
  });

  const paged = useQuery({
    queryKey: ['products', query],
    queryFn: () => apiFetch<ProductListResponse>(`/products?${buildSearchParams(query)}`),
    // Keeps the previous page on screen while the next one loads, so the grid
    // does not collapse to a skeleton on every filter change.
    placeholderData: keepPreviousData,
    enabled: mode === 'pages',
  });

  // Infinite mode accumulates pages inside the query cache rather than in
  // component state, so nothing has to be synced back in an effect. The key
  // omits `page` - the page cursor belongs to the query, not the URL, here.
  const infinite = useInfiniteQuery({
    queryKey: ['products-infinite', { ...query, page: undefined }],
    queryFn: ({ pageParam }) =>
      apiFetch<ProductListResponse>(
        `/products?${buildSearchParams({ ...query, page: pageParam })}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNext ? lastPage.meta.page + 1 : undefined,
    enabled: mode === 'infinite',
  });

  const update = React.useCallback(
    (next: Partial<QueryState>) => {
      const merged = { ...query, ...next };
      // Any filter change returns to page 1 - page 4 of a new filter is rarely
      // where the shopper wants to land.
      if (!('page' in next)) merged.page = 1;
      router.push(`/products?${buildSearchParams(merged)}`, { scroll: false });
    },
    [query, router],
  );

  const infinitePages = infinite.data?.pages;
  const data = mode === 'infinite' ? infinitePages?.[0] : paged.data;
  const isPending = mode === 'infinite' ? infinite.isPending : paged.isPending;

  const items =
    mode === 'infinite'
      ? (infinitePages?.flatMap((page) => page.items) ?? [])
      : (paged.data?.items ?? []);

  const facets = data?.facets ?? { categories: [], brands: [], priceRange: { min: 0, max: 0 } };

  const filters: FilterState = {
    category: query.category,
    brand: query.brand,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    rating: query.rating,
    inStock: query.inStock,
  };

  const sidebar = (
    <CatalogFilters
      categories={categories ?? []}
      facets={facets}
      value={filters}
      onChange={update}
      onClear={() => router.push('/products')}
    />
  );

  return (
    <div className="container-bazaar py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          {query.search ? `Results for "${query.search}"` : 'All products'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPending ? 'Loading…' : `${data?.meta.total ?? 0} products`}
          {data?.engine === 'postgres' && query.search ? (
            <span className="ml-2 text-warning">
              · search index unavailable, using database search
            </span>
          ) : null}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">{sidebar}</div>
        </aside>

        <div>
          {/* Toolbar */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Mobile: filters live in a sheet (H3, md breakpoint). */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden">
                    <SlidersHorizontal className="size-4" />
                    Filters
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[300px] overflow-y-auto p-6">
                  <SheetHeader className="mb-4 p-0">
                    <SheetTitle className="font-display">Filters</SheetTitle>
                  </SheetHeader>
                  {sidebar}
                </SheetContent>
              </Sheet>

              <ActiveFilterChips query={query} onClear={update} />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode((value) => (value === 'pages' ? 'infinite' : 'pages'))}
                aria-label={
                  mode === 'pages' ? 'Switch to infinite scroll' : 'Switch to pagination'
                }
              >
                {mode === 'pages' ? (
                  <Rows3 className="size-4" />
                ) : (
                  <LayoutGrid className="size-4" />
                )}
                <span className="hidden sm:inline">
                  {mode === 'pages' ? 'Infinite' : 'Pages'}
                </span>
              </Button>

              <Select value={query.sort} onValueChange={(value) => update({ sort: value })}>
                <SelectTrigger className="w-[180px]" aria-label="Sort products">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isPending ? (
            <ProductGridSkeleton count={PAGE_SIZE} />
          ) : items.length === 0 ? (
            <EmptyState onClear={() => router.push('/products')} />
          ) : (
            <>
              <motion.div
                variants={staggerChildren(0.05)}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </motion.div>

              {mode === 'pages' ? (
                <Pagination meta={paged.data?.meta} onPage={(page) => update({ page })} />
              ) : infinite.hasNextPage ? (
                <div className="mt-8 flex justify-center">
                  <Button
                    variant="outline"
                    disabled={infinite.isFetchingNextPage}
                    onClick={() => void infinite.fetchNextPage()}
                  >
                    {infinite.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ActiveFilterChips({
  query,
  onClear,
}: {
  query: QueryState;
  onClear: (next: Partial<QueryState>) => void;
}) {
  const chips: Array<{ label: string; clear: Partial<QueryState> }> = [];

  if (query.category) chips.push({ label: query.category, clear: { category: undefined } });
  if (query.brand) chips.push({ label: query.brand, clear: { brand: undefined } });
  if (query.inStock) chips.push({ label: 'In stock', clear: { inStock: undefined } });
  if (query.rating) chips.push({ label: `${query.rating}★ & up`, clear: { rating: undefined } });
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    chips.push({
      label: 'Price',
      clear: { minPrice: undefined, maxPrice: undefined },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <Badge
          key={chip.label}
          variant="outline"
          className="cursor-pointer gap-1 hover:bg-muted"
          onClick={() => onClear(chip.clear)}
        >
          {chip.label}
          <span aria-hidden>×</span>
          <span className="sr-only">Remove filter</span>
        </Badge>
      ))}
    </div>
  );
}

function Pagination({
  meta,
  onPage,
}: {
  meta: ProductListResponse['meta'] | undefined;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.totalPages <= 1) return null;

  const pages = pageWindow(meta.page, meta.totalPages);

  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasPrev}
        onClick={() => onPage(meta.page - 1)}
      >
        Previous
      </Button>

      {pages.map((page, index) =>
        page === null ? (
          <span key={`gap-${index}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={page}
            variant={page === meta.page ? 'default' : 'outline'}
            size="sm"
            aria-current={page === meta.page ? 'page' : undefined}
            onClick={() => onPage(page)}
            className="numeric min-w-9"
          >
            {page}
          </Button>
        ),
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={!meta.hasNext}
        onClick={() => onPage(meta.page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

/** First, last, and a window around the current page, with gaps marked null. */
function pageWindow(current: number, total: number): Array<number | null> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const result: Array<number | null> = [];
  let previous = 0;

  for (const page of sorted) {
    if (previous && page - previous > 1) result.push(null);
    result.push(page);
    previous = page;
  }

  return result;
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-20 text-center">
      <PackageOpen className="size-12 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-display text-lg font-semibold">No products found</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
          Nothing matches every filter at once. Try widening the price range or clearing a
          filter.
        </p>
      </div>
      <Button variant="outline" onClick={onClear}>
        Clear all filters
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  URL <-> query state                                                       */
/* -------------------------------------------------------------------------- */

interface QueryState {
  page: number;
  limit: number;
  sort: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  search?: string;
}

function readQuery(params: URLSearchParams): QueryState {
  const number = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw === null || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  return {
    page: number('page') ?? 1,
    limit: number('limit') ?? PAGE_SIZE,
    sort: params.get('sort') ?? 'newest',
    category: params.get('category') ?? undefined,
    brand: params.get('brand') ?? undefined,
    minPrice: number('minPrice'),
    maxPrice: number('maxPrice'),
    rating: number('rating'),
    inStock: params.get('inStock') === 'true' ? true : undefined,
    search: params.get('search') ?? undefined,
  };
}

function buildSearchParams(query: QueryState): string {
  const params = new URLSearchParams();

  // Only non-default values are written, so a clean listing has a clean URL.
  if (query.page > 1) params.set('page', String(query.page));
  if (query.limit !== PAGE_SIZE) params.set('limit', String(query.limit));
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.category) params.set('category', query.category);
  if (query.brand) params.set('brand', query.brand);
  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.rating !== undefined) params.set('rating', String(query.rating));
  if (query.inStock) params.set('inStock', 'true');
  if (query.search) params.set('search', query.search);

  return params.toString();
}
