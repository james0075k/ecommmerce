'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Loader2, Search, TrendingUp, X } from 'lucide-react';

import { blurProps, formatPrice } from '@bazaar/ui';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import type { ProductListResponse } from '@/lib/catalog';

/**
 * Used only when the facet request has not landed. Hard-coding search terms is
 * a trap - a chip that returns nothing is worse than no chip - so the real
 * suggestions come from the brand facet, which is by definition a list of
 * things the catalogue contains.
 */
const FALLBACK_SUGGESTIONS = ['Headphones', 'Laptop', 'Shoes', 'Kitchen', 'Backpack'];

/**
 * The full-screen search layer.
 *
 * Results come from `/search`, which is Meilisearch when it is up and a
 * Postgres `ILIKE` when it is not - either way the payload matches the listing
 * endpoint, so the rows render the same. The input is debounced 250ms: fast
 * enough to feel live, slow enough that a five-letter word is one request
 * rather than five.
 */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    // The page behind must not scroll under the layer.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose, open]);

  // Shares its cache entry with the homepage brand marquee, so opening search
  // after scrolling the homepage costs no request at all.
  const { data: facets } = useQuery({
    queryKey: ['brand-facets'],
    queryFn: () => apiFetch<ProductListResponse>('/products?limit=1'),
    staleTime: 10 * 60_000,
    enabled: open,
  });

  const suggestions =
    facets?.facets.brands
      .slice(0, 5)
      .map((brand) => brand.value)
      .filter(Boolean) ?? [];

  const { data, isFetching } = useQuery({
    queryKey: ['instant-search', debounced],
    queryFn: () =>
      apiFetch<ProductListResponse>(
        `/search?q=${encodeURIComponent(debounced)}&limit=6`,
      ),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const results = data?.items ?? [];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) return;
    onClose();
    router.push(`/products?search=${encodeURIComponent(query)}`);
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-90"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Opaque on a phone, translucent from `sm` up. Below `sm` this is a
              full-screen takeover, and a blurred view of the page underneath it
              is just noise behind a keyboard; on a desktop the page staying
              visible is the point. */}
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-background sm:bg-background/85 sm:backdrop-blur-xl"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search products"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            // `pt-[env(safe-area-inset-top)]` rather than a fixed inset on a
            // phone: the field should sit right under the notch, where the
            // thumb and the keyboard both expect it.
            className="relative mx-auto flex h-dvh w-full max-w-3xl flex-col px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-4 sm:h-auto sm:max-h-dvh sm:pt-[12vh] sm:pb-8"
          >
            <form onSubmit={submit} role="search" className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={inputRef}
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search the whole catalogue…"
                aria-label="Search products"
                className="h-14 w-full rounded-lg border border-border bg-card pr-24 pl-12 text-lg shadow-float outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30"
              />
              <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1">
                {isFetching ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
                <Button type="button" variant="ghost" size="icon" onClick={onClose}>
                  <X className="size-4" />
                  <span className="sr-only">Close search</span>
                </Button>
              </div>
            </form>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-lg">
              {debounced.length < 2 ? (
                <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                  <p className="flex items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground uppercase">
                    <TrendingUp className="size-3.5" />
                    {suggestions.length > 0 ? 'Brands in stock' : 'Popular searches'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(suggestions.length > 0 ? suggestions : FALLBACK_SUGGESTIONS).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setTerm(suggestion)}
                        className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : isFetching && results.length === 0 ? (
                <ul className="space-y-2">
                  {[0, 1, 2, 3].map((index) => (
                    <li key={index}>
                      <Skeleton className="bz-shimmer h-18 w-full rounded-md bg-muted" />
                    </li>
                  ))}
                </ul>
              ) : results.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Nothing matches “{debounced}”. Try a shorter word, or browse the{' '}
                  <Link
                    href="/products"
                    onClick={onClose}
                    className="text-primary underline underline-offset-4"
                  >
                    full catalogue
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {results.map((product, index) => (
                      <motion.li
                        key={product.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.035, duration: 0.25 }}
                      >
                        <Link
                          href={`/products/${product.slug}`}
                          onClick={onClose}
                          className="flex items-center gap-3 rounded-md border border-transparent bg-card p-2.5 transition-colors hover:border-border hover:bg-muted/60"
                        >
                          <span className="relative size-14 shrink-0 overflow-hidden rounded-sm bg-muted">
                            {product.image ? (
                              <Image
                                src={product.image.url}
                                alt=""
                                fill
                                sizes="56px"
                                className="object-cover"
                                {...blurProps(product.image.blurhash)}
                              />
                            ) : null}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {product.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {product.category.name}
                              {product.brand ? ` · ${product.brand}` : ''}
                            </span>
                          </span>

                          <span className="numeric shrink-0 text-sm font-semibold">
                            {formatPrice(product.price, product.currency)}
                          </span>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(`/products?search=${encodeURIComponent(debounced)}`);
                    }}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    See all {data?.meta.total ?? results.length} results
                    <CornerDownLeft className="size-3.5" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
