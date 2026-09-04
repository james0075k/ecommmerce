'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShoppingBag, X } from 'lucide-react';

import { backdropFade, slideInRight } from '@bazaar/ui';

import { CartLineRow } from '@/components/cart/cart-line-row';
import { CartSummary, EmptyCart, StockWarning } from '@/components/cart/cart-parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFocusTrap, useScrollLock } from '@/lib/hooks/use-focus-trap';
import { useCartStore } from '@/lib/store/cart-store';

/**
 * The slide-out cart (H2: enter 300ms, exit 200ms, ease [0.33, 1, 0.68, 1]).
 *
 * Built on Framer Motion rather than the Radix Sheet because the blueprint
 * specifies the drawer's own easing curve and because the panel needs to stay
 * mounted through its exit animation while its contents keep updating - a
 * quantity change mid-close should not snap.
 *
 * Desktop only from Phase 11. On a phone a 26rem panel is the whole screen with
 * a strip of dimmed page down one side, which is a full page pretending not to
 * be one; `/cart` is that page, and `CartButton` routes there instead of
 * opening this. The layout still mounts the drawer unconditionally - it is the
 * *trigger* that changes, so a wide window that is later narrowed does not
 * leave an unreachable open panel behind.
 */
export function CartDrawer() {
  const isOpen = useCartStore((state) => state.isOpen);
  const close = useCartStore((state) => state.close);
  const view = useCartStore((state) => state.view);

  const panelRef = React.useRef<HTMLDivElement>(null);

  // Tab stays inside the panel while it is open, and the control that opened it
  // gets focus back on close.
  useFocusTrap(panelRef, isOpen);
  useScrollLock(isOpen);

  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  const items = view?.items ?? [];
  const summary = view?.summary;

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-50" role="presentation">
          <motion.div
            variants={backdropFade}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={close}
            className="absolute inset-0 bg-black"
            aria-hidden
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            tabIndex={-1}
            variants={slideInRight}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-background shadow-float outline-none sm:max-w-[26rem]"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-5 text-primary" aria-hidden />
                <h2 className="font-display text-base font-bold tracking-tight">Your cart</h2>
                {summary && summary.itemCount > 0 ? (
                  <Badge variant="secondary" className="numeric">
                    {summary.itemCount}
                  </Badge>
                ) : null}
              </div>

              <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close cart">
                <X className="size-4" />
              </Button>
            </header>

            {items.length === 0 ? (
              <EmptyCart onNavigate={close} />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
                  <StockWarning count={view?.issues.length ?? 0} />

                  <ul className="divide-y divide-border">
                    <AnimatePresence initial={false}>
                      {items.map((line) => (
                        <CartLineRow key={line.id} line={line} onNavigate={close} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>

                <div className="border-t border-border bg-card">
                  <CartSummary onNavigate={close} />
                </div>
              </>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
