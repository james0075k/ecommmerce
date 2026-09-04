'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import { Check, Eye, Heart, Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { blurProps, formatPrice, scaleIn } from '@bazaar/ui';

import { PrefetchLink } from '@/components/shop/prefetch-link';
import { QuickViewSheet } from '@/components/shop/quick-view-sheet';
import { StarRating } from '@/components/shop/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useFinePointer } from '@/lib/hooks/use-media-query';
import { useLongPress } from '@/lib/hooks/use-long-press';
import { useQuickAdd } from '@/lib/hooks/use-quick-add';
import { discountPercent, type ProductListItem } from '@/lib/catalog';
import { useAuthStore } from '@/lib/store/auth-store';
import { selectIsSaved, useWishlistStore } from '@/lib/store/wishlist-store';
import { cn } from '@/lib/utils';

/** Degrees of tilt at the very corner of the card. Past ~8 it reads as a toy. */
const MAX_TILT = 6;

/**
 * The grid tile. H2 specifies hover scale to 1.03 with the image zooming to
 * 1.08, and the add-to-cart button morphing to a checkmark for ~800ms.
 *
 * Phase 9 adds the tilt: the card leans towards the cursor in 3D, and a
 * quick-add strip rises over the image. Both are pointer-driven, so both are
 * gated on a fine pointer - a tilt that fires on a tap is just a card that
 * jumps when you touch it.
 */
export function ProductCard({
  product,
  eager = false,
}: {
  product: ProductListItem;
  /**
   * Set on the cards in the first visible row, whose image is the LCP
   * candidate. Everything below the fold stays lazy, which is the default.
   *
   * Deliberately not `preload`: the grid is 1, 2, 3 or 4 columns depending on
   * the viewport, so which of the first four cards holds the LCP element is not
   * known at render time. Next's own guidance is to reach for `loading="eager"`
   * and `fetchPriority` rather than `preload` in exactly that case - four
   * `<link rel=preload>` tags in the head would have the browser racing four
   * images for the bandwidth the one that matters needs.
   */
  eager?: boolean;
}) {
  const discount = discountPercent(product.price, product.compareAtPrice);
  const reduced = useReducedMotion();

  const ref = React.useRef<HTMLDivElement>(null);
  const finePointer = useFinePointer();
  const tiltable = finePointer && !reduced;

  // Phase 11: holding a card on a touch screen opens the quick-view sheet. The
  // hook ignores mouse and pen pointers, so on a desktop this costs nothing but
  // the two handlers below never firing.
  const [quickViewOpen, setQuickViewOpen] = React.useState(false);
  const longPress = useLongPress(() => setQuickViewOpen(true), !finePointer);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawY, { stiffness: 240, damping: 22, mass: 0.4 });
  const rotateY = useSpring(rawX, { stiffness: 240, damping: 22, mass: 0.4 });
  const transform = useMotionTemplate`perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tiltable) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    // -1..1 from the centre of the card on each axis. The Y offset drives
    // rotateX and is negated, because pushing the top away is a positive
    // rotation about X.
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;

    rawX.set(px * MAX_TILT * 2);
    rawY.set(-py * MAX_TILT * 2);
  };

  const resetTilt = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.article variants={scaleIn} className="group/card h-full" {...longPress}>
      <motion.div
        ref={ref}
        onPointerMove={handleMove}
        onPointerLeave={resetTilt}
        style={tiltable ? { transform, transformStyle: 'preserve-3d' } : undefined}
        className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card transition-[box-shadow,transform,translate] duration-[250ms] ease-out hover:-translate-y-0.5 hover:shadow-float motion-reduce:hover:translate-y-0"
      >
        <PrefetchLink
          href={`/products/${product.slug}`}
          className="relative block aspect-square overflow-hidden bg-muted"
        >
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.altText ?? product.name}
              fill
              // Mirrors the grid's own tracks - 1 column, then 2 from 640px, 3
              // from 1024px and 4 from 1280px - so the optimiser is never asked
              // for a 1200px file to fill a 300px slot.
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
              // Above the fold the image should not wait for the lazy
              // observer; below it, it should.
              loading={eager ? 'eager' : 'lazy'}
              fetchPriority={eager ? 'high' : undefined}
              className="object-cover transition-transform duration-[250ms] ease-out group-hover/card:scale-[1.08] motion-reduce:group-hover/card:scale-100"
              // The blurhash is decoded to a 32x32 data URI at build/render
              // time, so the tile is never an empty grey box waiting on the
              // network (A1.1).
              {...blurProps(product.image.blurhash)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1.5">
            {/* Black on the sale orange, not white: #FF6B35 against white is
                2.8:1, well under AA at this size. The low-stock badge below
                already sets the precedent. */}
            {discount ? <Badge className="bg-sale text-black">-{discount}%</Badge> : null}
            {!product.inStock ? <Badge variant="destructive">Out of stock</Badge> : null}
            {product.inStock && product.stockQuantity <= 5 ? (
              <Badge className="bg-warning text-black">Only {product.stockQuantity} left</Badge>
            ) : null}
          </div>

          <WishlistButton productId={product.id} productName={product.name} />

          {/* Quick view: a hint, not a second action - the whole image is
              already the link it stands for. Hidden from assistive tech and
              from touch, where there is no hover to reveal it. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-full items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent py-3 text-xs font-medium text-white transition-transform duration-300 ease-out group-hover/card:translate-y-0 lg:flex"
          >
            <Eye className="size-3.5" />
            Quick view
          </span>
        </PrefetchLink>

        <div className="flex flex-1 flex-col gap-2 p-3">
          {product.brand ? (
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {product.brand}
            </p>
          ) : null}

          <h3 className="line-clamp-2 text-sm leading-snug font-medium">
            <PrefetchLink href={`/products/${product.slug}`} className="hover:underline">
              {product.name}
            </PrefetchLink>
          </h3>

          {product.reviewCount > 0 ? (
            <StarRating rating={product.rating} count={product.reviewCount} size="sm" />
          ) : (
            <span className="text-xs text-muted-foreground">No reviews yet</span>
          )}

          {/* Wraps: at two columns on a phone a long price plus its struck-out
              original does not fit on one line. */}
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
            <span className="numeric text-base font-semibold">
              {formatPrice(product.price, product.currency)}
            </span>
            {product.compareAtPrice ? (
              <span className="numeric text-xs text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice, product.currency)}
              </span>
            ) : null}
          </div>

          <AddToCartButton product={product} />
        </div>
      </motion.div>

      {/* Rendered only once opened: a listing page holds up to 48 cards, and 48
          mounted sheets would be 48 portals and 48 focus scopes for a surface
          that is almost always closed. */}
      {quickViewOpen ? (
        <QuickViewSheet
          product={product}
          open={quickViewOpen}
          onOpenChange={setQuickViewOpen}
        />
      ) : null}
    </motion.article>
  );
}

/**
 * H2: the button shrinks, morphs to a checkmark, goes success green, then
 * resets — 800ms in total.
 *
 * A grid tile has no variant selector, so it adds the product's default option.
 * `/products/:slug` returns variants in creation order and the listing exposes
 * none of them, so the card sends the product id and lets the detail page own
 * the choice when there is a real one to make.
 */
function AddToCartButton({ product }: { product: ProductListItem }) {
  // The same hook the quick-view sheet uses, so both surfaces resolve the
  // default variant and report failures identically.
  const { state, add } = useQuickAdd(product);

  if (!product.inStock) {
    return (
      <Button variant="outline" size="sm" className="mt-1 w-full" disabled>
        Out of stock
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className={cn(
        'mt-1 w-full transition-colors',
        state === 'added' && 'bg-success text-white hover:bg-success',
      )}
      disabled={state !== 'idle'}
      onClick={(event) => {
        // The tile is a link end to end; a click here must not follow it.
        event.preventDefault();
        void add();
      }}
      aria-label={`Add ${product.name} to cart`}
    >
      {state === 'idle' ? <ShoppingCart className="size-4" aria-hidden /> : null}
      {state === 'adding' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {state === 'added' ? <Check className="size-4" aria-hidden /> : null}
      {state === 'added' ? 'Added' : 'Add to cart'}
    </Button>
  );
}

/** H2: scale 0 → 1.2 → 1 with the fill spreading from the centre, 350ms. */
function WishlistButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authReady = useAuthStore((state) => state.ready);
  const toggle = useWishlistStore((state) => state.toggleByProduct);
  const saved = useWishlistStore(selectIsSaved(productId));

  const [pending, setPending] = React.useState(false);

  const handleClick = async (event: React.MouseEvent) => {
    // The card is wrapped in a link, so keep the click here.
    event.preventDefault();
    event.stopPropagation();

    // The wishlist has no guest identity - `wishlists.user_id` is non-null - so
    // there is nowhere to put this until they are signed in.
    if (authReady && !user) {
      toast.info('Log in to save items to your wishlist.', {
        action: { label: 'Log in', onClick: () => router.push('/login?next=/wishlist') },
      });
      return;
    }

    setPending(true);

    try {
      const isSaved = await toggle(productId);
      toast.success(isSaved ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update your wishlist.');
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName}`}
      aria-pressed={saved}
      disabled={pending}
      onClick={(event) => void handleClick(event)}
      className="absolute top-2 right-2 grid size-8 cursor-pointer place-items-center rounded-full bg-background/80 backdrop-blur-sm transition-[background-color,transform] duration-200 hover:scale-110 hover:bg-background disabled:opacity-60 motion-reduce:hover:scale-100"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Heart
          className={cn(
            'size-4 transition-colors',
            saved ? 'bz-heart-pop fill-destructive text-destructive' : 'text-muted-foreground',
          )}
        />
      )}
    </button>
  );
}
