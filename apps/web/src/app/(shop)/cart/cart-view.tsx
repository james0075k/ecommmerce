'use client';

import * as React from 'react';
import { AnimatePresence } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';

import { CartLineRow } from '@/components/cart/cart-line-row';
import { CartSummary, EmptyCart, StockWarning } from '@/components/cart/cart-parts';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/lib/hooks/use-media-query';
import { useCartStore } from '@/lib/store/cart-store';

/**
 * The cart as a page (Phase 11).
 *
 * On a phone this is where the cart lives: the bottom navigation links here,
 * and `CartButton` navigates here instead of opening the drawer. On a desktop
 * the drawer is still the primary surface, but the route stays reachable -
 * it is what a bookmark, a shared link and the "view cart" line in an email all
 * point at, and a 404 for those would be worse than a page that is merely
 * redundant.
 *
 * The summary is sticky beside the list from `lg` up and pinned to the bottom
 * of the viewport below it, which is where a thumb already is.
 */
export function CartView() {
  const view = useCartStore((state) => state.view);
  const ready = useCartStore((state) => state.ready);
  const refresh = useCartStore((state) => state.refresh);
  const isMobile = useIsMobile();

  // The cart may have been changed on another device, or a variant may have
  // sold out since the drawer last read it. Checkout re-validates server-side
  // regardless, but showing a stale price here and a different one at the next
  // step is a trust problem.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const items = view?.items ?? [];
  const summary = view?.summary;

  if (!ready) {
    return (
      <div className="container-bazaar max-w-5xl space-y-4 py-8">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="bz-shimmer h-32 w-full rounded-md bg-muted" />
        <Skeleton className="bz-shimmer h-32 w-full rounded-md bg-muted" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container-bazaar flex min-h-[60vh] max-w-5xl flex-col py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">Your cart</h1>
        <EmptyCart />
      </div>
    );
  }

  return (
    <div className="container-bazaar max-w-5xl py-6 md:py-8">
      <header className="mb-5 flex items-center gap-2">
        <ShoppingBag className="size-5 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold tracking-tight">Your cart</h1>
        {summary && summary.itemCount > 0 ? (
          <Badge variant="secondary" className="numeric">
            {summary.itemCount}
          </Badge>
        ) : null}
      </header>

      <StockWarning count={view?.issues.length ?? 0} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <ul className="divide-y divide-border rounded-md border border-border px-4">
          <AnimatePresence initial={false}>
            {items.map((line) => (
              <CartLineRow key={line.id} line={line} swipeToDelete={isMobile} />
            ))}
          </AnimatePresence>
        </ul>

        {isMobile ? (
          <p className="text-center text-xs text-muted-foreground">
            Swipe an item left to remove it.
          </p>
        ) : null}

        <div className="rounded-md border border-border bg-card lg:sticky lg:top-20">
          <CartSummary />
        </div>
      </div>
    </div>
  );
}
