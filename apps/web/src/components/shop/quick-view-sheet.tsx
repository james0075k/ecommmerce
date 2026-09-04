'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, Loader2, ShoppingCart } from 'lucide-react';

import { blurProps, formatPrice } from '@bazaar/ui';

import { StarRating } from '@/components/shop/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { discountPercent, type ProductListItem } from '@/lib/catalog';
import { useQuickAdd } from '@/lib/hooks/use-quick-add';

/**
 * The long-press quick view (Phase 11).
 *
 * A phone has no hover, so the desktop's "quick view" overlay has no touch
 * equivalent - and opening the full product page to check a price means a
 * navigation, a scroll and a back button to get where you were. Holding a card
 * puts the same information in a sheet over the grid, with the scroll position
 * behind it untouched.
 *
 * Everything shown here is already in the listing payload, so the sheet opens
 * with no request at all. The only network call is the one Add to cart makes,
 * and that only happens if the shopper asks for it.
 *
 * Built on the Sheet primitive rather than a bespoke panel because the modal
 * behaviour is the part that is easy to get wrong: focus moves into the sheet
 * on open and returns to the card on close, Escape dismisses, the page behind
 * is inert, and everything outside is hidden from screen readers.
 */
export function QuickViewSheet({
  product,
  open,
  onOpenChange,
}: {
  product: ProductListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const discount = discountPercent(product.price, product.compareAtPrice);
  const { state, add } = useQuickAdd(product);

  // Adding from here is a decision the shopper already made about this product;
  // leaving the sheet up afterwards asks them to dismiss it for no reason.
  React.useEffect(() => {
    if (state !== 'added') return;
    const timer = window.setTimeout(() => onOpenChange(false), 700);
    return () => window.clearTimeout(timer);
  }, [state, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // The grabber below reads as "drag me"; the corner X would be a second,
        // smaller target for the same job.
        showCloseButton={false}
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {/* The iOS sheet affordance. Decorative - Escape, the backdrop and the
            View full details link are the real ways out. */}
        <div
          aria-hidden
          className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border"
        />

        <SheetHeader className="pb-2">
          <SheetTitle className="sr-only">{product.name}</SheetTitle>
          <SheetDescription className="sr-only">
            A quick look at {product.name}. Add it to your cart, or open the full product
            page.
          </SheetDescription>
        </SheetHeader>

        <div className="flex gap-4 px-4">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-md bg-muted">
            {product.image ? (
              <Image
                src={product.image.url}
                alt={product.image.altText ?? product.name}
                fill
                sizes="112px"
                className="object-cover"
                {...blurProps(product.image.blurhash)}
              />
            ) : null}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            {product.brand ? (
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                {product.brand}
              </p>
            ) : null}

            <h2 className="line-clamp-2 text-base leading-snug font-semibold">
              {product.name}
            </h2>

            {product.reviewCount > 0 ? (
              <StarRating rating={product.rating} count={product.reviewCount} size="sm" />
            ) : (
              <p className="text-xs text-muted-foreground">No reviews yet</p>
            )}

            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="numeric text-lg font-semibold">
                {formatPrice(product.price, product.currency)}
              </span>
              {product.compareAtPrice ? (
                <span className="numeric text-xs text-muted-foreground line-through">
                  {formatPrice(product.compareAtPrice, product.currency)}
                </span>
              ) : null}
              {discount ? <Badge className="bg-sale text-black">-{discount}%</Badge> : null}
            </div>
          </div>
        </div>

        {product.shortDescription ? (
          <p className="mt-4 line-clamp-3 px-4 text-sm text-muted-foreground">
            {product.shortDescription}
          </p>
        ) : null}

        <p className="mt-3 px-4 text-xs">
          {!product.inStock ? (
            <span className="text-danger">Out of stock</span>
          ) : product.stockQuantity <= 5 ? (
            <span className="text-caution">
              Only {product.stockQuantity} left in stock
            </span>
          ) : (
            <span className="text-ok">In stock</span>
          )}
        </p>

        <div className="mt-5 flex flex-col gap-2 px-4">
          {/* h-12 rather than the default h-9: this is the primary action on a
              phone, reached by thumb, and 48px is comfortably past the 44px
              minimum. */}
          <Button
            className="h-12 w-full text-base"
            disabled={!product.inStock || state !== 'idle'}
            onClick={() => void add()}
          >
            {state === 'adding' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Adding…
              </>
            ) : state === 'added' ? (
              <>
                <Check className="size-4" aria-hidden />
                Added
              </>
            ) : (
              <>
                <ShoppingCart className="size-4" aria-hidden />
                {product.inStock ? 'Add to cart' : 'Out of stock'}
              </>
            )}
          </Button>

          <Button asChild variant="outline" className="h-12 w-full text-base">
            <Link href={`/products/${product.slug}`} onClick={() => onOpenChange(false)}>
              View full details
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        {/* Announced when the add resolves - the button's own label change is a
            visual cue a screen reader would not otherwise report. */}
        <span aria-live="polite" className="sr-only">
          {state === 'added' ? `${product.name} added to your cart` : ''}
        </span>
      </SheetContent>
    </Sheet>
  );
}
