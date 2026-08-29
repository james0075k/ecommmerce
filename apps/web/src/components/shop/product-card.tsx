'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check, Heart, Loader2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { formatPrice, scaleIn } from '@bazaar/ui';

import { StarRating } from '@/components/shop/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { discountPercent, type ProductListItem } from '@/lib/catalog';
import { cn } from '@/lib/utils';

/**
 * The grid tile. H2 specifies hover scale to 1.03 with the image zooming to
 * 1.08, and the add-to-cart button morphing to a checkmark for ~800ms.
 */
export function ProductCard({ product }: { product: ProductListItem }) {
  const discount = discountPercent(product.price, product.compareAtPrice);

  return (
    <motion.article variants={scaleIn} className="group/card h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card transition-[transform,box-shadow] duration-[250ms] ease-out hover:-translate-y-0.5 hover:shadow-float motion-reduce:hover:translate-y-0">
        <Link
          href={`/products/${product.slug}`}
          className="relative block aspect-square overflow-hidden bg-muted"
        >
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.altText ?? product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover transition-transform duration-[250ms] ease-out group-hover/card:scale-[1.08] motion-reduce:group-hover/card:scale-100"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1.5">
            {discount ? <Badge className="bg-sale text-white">-{discount}%</Badge> : null}
            {!product.inStock ? <Badge variant="destructive">Out of stock</Badge> : null}
            {product.inStock && product.stockQuantity <= 5 ? (
              <Badge className="bg-warning text-black">Only {product.stockQuantity} left</Badge>
            ) : null}
          </div>

          <WishlistButton productId={product.id} productName={product.name} />
        </Link>

        <div className="flex flex-1 flex-col gap-2 p-3">
          {product.brand ? (
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {product.brand}
            </p>
          ) : null}

          <h3 className="line-clamp-2 text-sm leading-snug font-medium">
            <Link href={`/products/${product.slug}`} className="hover:underline">
              {product.name}
            </Link>
          </h3>

          {product.reviewCount > 0 ? (
            <StarRating rating={product.rating} count={product.reviewCount} size="sm" />
          ) : (
            <span className="text-xs text-muted-foreground">No reviews yet</span>
          )}

          <div className="mt-auto flex items-baseline gap-2 pt-1">
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
      </div>
    </motion.article>
  );
}

/**
 * H2: the button shrinks, morphs to a checkmark, goes success green, then
 * resets — 800ms in total.
 */
function AddToCartButton({ product }: { product: ProductListItem }) {
  const [state, setState] = React.useState<'idle' | 'adding' | 'added'>('idle');

  React.useEffect(() => {
    if (state !== 'added') return;
    const timer = setTimeout(() => setState('idle'), 800);
    return () => clearTimeout(timer);
  }, [state]);

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
      onClick={() => {
        setState('adding');
        // The cart itself lands in Phase 4; the interaction is wired now so the
        // grid is complete and the animation is verifiable.
        setTimeout(() => {
          setState('added');
          toast.success(`${product.name} added to cart.`, {
            description: 'The cart drawer arrives in Phase 4.',
          });
        }, 220);
      }}
    >
      {state === 'idle' ? <ShoppingCart className="size-4" /> : null}
      {state === 'adding' ? <Loader2 className="size-4 animate-spin" /> : null}
      {state === 'added' ? <Check className="size-4" /> : null}
      {state === 'added' ? 'Added' : 'Add to cart'}
    </Button>
  );
}

/** H2: scale 0 → 1.2 → 1 with the fill spreading from the centre, 350ms. */
function WishlistButton({ productId, productName }: { productId: string; productName: string }) {
  const [saved, setSaved] = React.useState(false);

  return (
    <button
      type="button"
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName}`}
      aria-pressed={saved}
      onClick={(event) => {
        // The card is wrapped in a link, so keep the click here.
        event.preventDefault();
        event.stopPropagation();
        setSaved((value) => !value);
        toast.success(saved ? 'Removed from wishlist.' : 'Saved to your wishlist.', {
          description: 'Wishlist syncing arrives in Phase 4.',
        });
      }}
      className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background/80 backdrop-blur-sm transition-colors hover:bg-background"
    >
      <Heart
        className={cn(
          'size-4 transition-colors',
          saved ? 'bz-heart-pop fill-destructive text-destructive' : 'text-muted-foreground',
        )}
        data-product-id={productId}
      />
    </button>
  );
}
