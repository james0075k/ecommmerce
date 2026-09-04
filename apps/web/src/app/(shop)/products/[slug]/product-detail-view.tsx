'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronRight,
  Heart,
  Loader2,
  Minus,
  Plus,
  Share2,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';

import { formatPrice } from '@bazaar/ui';

import { AnimatedPrice } from '@/components/animations/animated-price';
import { ProductGallery } from '@/components/shop/product-gallery';
import { ProductRecommendations } from '@/components/shop/product-recommendations';
import { ReviewList } from '@/components/shop/review-list';
import { ReviewSummaryCard } from '@/components/shop/review-summary-card';
import { StarRating } from '@/components/shop/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import {
  deriveOptions,
  discountPercent,
  matchVariant,
  type ProductDetail,
} from '@/lib/catalog';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { selectIsSaved, useWishlistStore } from '@/lib/store/wishlist-store';
import { cn } from '@/lib/utils';

export function ProductDetailView({ product }: { product: ProductDetail }) {
  const options = React.useMemo(() => deriveOptions(product.variants), [product.variants]);

  // Start on the first in-stock variant so the page does not open on a
  // combination the shopper cannot buy.
  const [selection, setSelection] = React.useState<Record<string, string>>(() => {
    const preferred = product.variants.find((variant) => variant.stockQuantity > 0);
    return preferred?.attributes ?? product.variants[0]?.attributes ?? {};
  });

  const [quantity, setQuantity] = React.useState(1);
  const variant = matchVariant(product.variants, selection);
  const price = variant?.price ?? product.basePrice;
  const discount = discountPercent(price, product.compareAtPrice);
  const available = variant?.stockQuantity ?? 0;

  return (
    <div className="container-bazaar py-6 md:py-10">
      <Breadcrumbs product={product} />

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="space-y-5">
          <div className="space-y-2">
            {product.brand ? (
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                {product.brand}
              </p>
            ) : null}

            <h1 className="font-display text-2xl leading-tight font-bold tracking-tight text-balance md:text-3xl">
              {product.name}
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              {product.reviewSummary.count > 0 ? (
                <StarRating
                  rating={product.reviewSummary.rating}
                  count={product.reviewSummary.count}
                  showValue
                />
              ) : (
                <span className="text-sm text-muted-foreground">No reviews yet</span>
              )}
              <span className="numeric text-xs text-muted-foreground">
                SKU {variant?.sku ?? product.sku}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            {/* Picking a pricier variant scrolls the old figure up and the new
                one in from below, so the change is seen rather than found. */}
            <AnimatedPrice
              value={price}
              currency={product.currency}
              className="text-3xl font-semibold"
            />
            {product.compareAtPrice ? (
              <span className="numeric text-base text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice, product.currency)}
              </span>
            ) : null}
            {discount ? <Badge className="bg-sale text-black">Save {discount}%</Badge> : null}
          </div>

          {product.shortDescription ? (
            <p className="text-sm text-muted-foreground text-pretty">
              {product.shortDescription}
            </p>
          ) : null}

          <Separator />

          {Object.entries(options).map(([name, values]) => (
            <OptionSelector
              key={name}
              name={name}
              values={values}
              selected={selection[name]}
              variants={product.variants}
              selection={selection}
              onSelect={(value) => {
                setSelection((current) => ({ ...current, [name]: value }));
                setQuantity(1);
              }}
            />
          ))}

          <StockLine available={available} hasVariants={product.variants.length > 0} />

          <div className="flex flex-wrap items-center gap-3">
            <QuantityStepper
              value={quantity}
              max={Math.max(1, available)}
              onChange={setQuantity}
              disabled={available === 0}
            />
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              variantId={variant?.id}
              quantity={quantity}
              disabled={available === 0}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <WishlistButton
              productId={product.id}
              productName={product.name}
              variantId={variant?.id ?? null}
            />
            <ShareButton productName={product.name} />
          </div>

          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-4">
            <Truck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Delivery across all 77 districts</p>
              <p className="mt-0.5 text-muted-foreground">
                Free over {formatPrice(5000)} in the Kathmandu valley. Cash on delivery
                available.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ProductTabs product={product} />

      <ProductRecommendations
        productId={product.id}
        categoryName={product.category.name}
        fallback={product.related}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Breadcrumbs({ product }: { product: ProductDetail }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
        </li>
        <ChevronRight className="size-3.5" aria-hidden />
        <li>
          <Link href="/products" className="hover:text-foreground">
            Products
          </Link>
        </li>
        <ChevronRight className="size-3.5" aria-hidden />
        <li>
          <Link
            href={`/products?category=${product.category.slug}`}
            className="hover:text-foreground"
          >
            {product.category.name}
          </Link>
        </li>
        <ChevronRight className="size-3.5" aria-hidden />
        <li aria-current="page" className="truncate text-foreground">
          {product.name}
        </li>
      </ol>
    </nav>
  );
}

/**
 * Colour options render as swatches, everything else as buttons. Combinations
 * that do not exist in stock are shown but marked, so the shopper can see the
 * full range rather than wondering where a size went.
 */
function OptionSelector({
  name,
  values,
  selected,
  variants,
  selection,
  onSelect,
}: {
  name: string;
  values: string[];
  selected?: string;
  variants: ProductDetail['variants'];
  selection: Record<string, string>;
  onSelect: (value: string) => void;
}) {
  const isColour = /colou?r/i.test(name);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {name}
        {selected ? <span className="ml-2 text-muted-foreground">{selected}</span> : null}
      </p>

      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const candidate = matchVariant(variants, { ...selection, [name]: value });
          const outOfStock = !candidate || candidate.stockQuantity === 0;
          const active = selected === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              aria-pressed={active}
              title={outOfStock ? `${value} — out of stock` : value}
              className={cn(
                'relative rounded-md border text-sm transition-all',
                isColour ? 'size-9' : 'min-w-11 px-3 py-2',
                active
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-foreground/30',
                outOfStock && 'opacity-40',
              )}
              style={isColour ? { backgroundColor: colourFor(value) } : undefined}
            >
              {isColour ? <span className="sr-only">{value}</span> : value}
              {outOfStock ? (
                <span
                  className="absolute inset-0 grid place-items-center text-destructive"
                  aria-hidden
                >
                  <span className="h-px w-full rotate-[-20deg] bg-destructive" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Maps common colour names to a swatch; unknown names fall back to grey. */
function colourFor(value: string): string {
  const map: Record<string, string> = {
    black: '#1A1A2E',
    white: '#FFFFFF',
    ivory: '#FAF6EE',
    navy: '#1E3A5F',
    grey: '#6B7280',
    gray: '#6B7280',
    graphite: '#3A3F44',
    silver: '#C0C5CE',
    midnight: '#12172B',
    ocean: '#1E6091',
    sand: '#D6C7A8',
    olive: '#5A6B3B',
    red: '#FF4757',
    teal: '#0E9594',
    forest: '#1F4A32',
    indigo: '#3F3D8F',
    rust: '#B7410E',
    natural: '#E8E0D2',
    charcoal: '#36393F',
  };
  return map[value.toLowerCase()] ?? '#9AA3B2';
}

function StockLine({ available, hasVariants }: { available: number; hasVariants: boolean }) {
  if (!hasVariants) return null;

  if (available === 0) {
    return <p className="text-sm font-medium text-destructive">Out of stock</p>;
  }

  if (available <= 5) {
    return (
      <p className="text-sm font-medium text-caution">
        Only {available} left — order soon
      </p>
    );
  }

  return <p className="text-sm font-medium text-ok">In stock</p>;
}

function QuantityStepper({
  value,
  max,
  onChange,
  disabled,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center rounded-md border border-border">
      <Button
        variant="ghost"
        size="icon"
        className="size-10 rounded-r-none"
        aria-label="Decrease quantity"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" />
      </Button>
      <span className="numeric w-10 text-center text-sm" aria-live="polite">
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-10 rounded-l-none"
        aria-label="Increase quantity"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Adds the selected variant and opens the drawer. The 800ms checkmark morph
 * (H2) is kept, but it now fires on the server's answer rather than a timer -
 * "Added" must not appear for something that failed to add.
 */
function AddToCartButton({
  productId,
  productName,
  variantId,
  quantity,
  disabled,
}: {
  productId: string;
  productName: string;
  variantId: string | undefined;
  quantity: number;
  disabled: boolean;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const [state, setState] = React.useState<'idle' | 'adding' | 'added'>('idle');

  React.useEffect(() => {
    if (state !== 'added') return;
    const timer = setTimeout(() => setState('idle'), 800);
    return () => clearTimeout(timer);
  }, [state]);

  const handleAdd = async () => {
    if (!variantId) {
      toast.error('Choose an option first.');
      return;
    }

    setState('adding');

    try {
      await addItem({ productId, variantId, quantity });
      setState('added');
      toast.success(`${quantity} × ${productName} added to cart.`);
    } catch (error) {
      setState('idle');
      toast.error(
        error instanceof ApiError ? error.message : 'Could not add that to your cart.',
      );
    }
  };

  return (
    <Button
      size="lg"
      className={cn('h-10 flex-1 sm:flex-none', state === 'added' && 'bg-success hover:bg-success')}
      disabled={disabled || state !== 'idle'}
      onClick={() => void handleAdd()}
    >
      {state === 'idle' ? <ShoppingCart className="size-4" /> : null}
      {state === 'adding' ? <Loader2 className="size-4 animate-spin" /> : null}
      {state === 'added' ? <Check className="size-4" /> : null}
      {disabled ? 'Out of stock' : state === 'added' ? 'Added to cart' : 'Add to cart'}
    </Button>
  );
}

function WishlistButton({
  productId,
  productName,
  variantId,
}: {
  productId: string;
  productName: string;
  variantId: string | null;
}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const authReady = useAuthStore((state) => state.ready);
  const toggle = useWishlistStore((state) => state.toggleByProduct);
  // Matched on the product alone: the heart reflects "this is saved", and
  // re-saving the same product under a second variant is not what the button
  // on a detail page is for.
  const saved = useWishlistStore(selectIsSaved(productId));
  const [pending, setPending] = React.useState(false);

  const handleClick = async () => {
    if (authReady && !user) {
      toast.info('Log in to save items to your wishlist.', {
        action: { label: 'Log in', onClick: () => router.push('/login?next=/wishlist') },
      });
      return;
    }

    setPending(true);

    try {
      const isSaved = await toggle(productId, saved ? undefined : variantId);
      toast.success(isSaved ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not update your wishlist.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={() => void handleClick()}
      disabled={pending}
      aria-pressed={saved}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Heart
          className={cn('size-4', saved && 'bz-heart-pop fill-destructive text-destructive')}
        />
      )}
      {saved ? 'Saved' : 'Save'}
      <span className="sr-only"> {productName}</span>
    </Button>
  );
}

function ShareButton({ productName }: { productName: string }) {
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const url = window.location.href;

        // The Web Share sheet is the right affordance on mobile; clipboard is
        // the fallback everywhere else.
        if (navigator.share) {
          await navigator
            .share({ title: productName, url })
            .catch(() => undefined);
          return;
        }

        try {
          await navigator.clipboard.writeText(url);
          toast.success('Link copied.');
        } catch {
          toast.error('Could not copy the link.');
        }
      }}
    >
      <Share2 className="size-4" />
      Share
    </Button>
  );
}

/* -------------------------------------------------------------------------- */

function ProductTabs({ product }: { product: ProductDetail }) {
  const specs = Object.entries(product.attributes).filter(
    ([, value]) => typeof value === 'string' || typeof value === 'number',
  );

  return (
    <Tabs defaultValue="description" className="mt-12">
      <TabsList>
        <TabsTrigger value="description">Description</TabsTrigger>
        <TabsTrigger value="specifications">Specifications</TabsTrigger>
        <TabsTrigger value="reviews">Reviews ({product.reviewSummary.count})</TabsTrigger>
        <TabsTrigger value="shipping">Shipping</TabsTrigger>
      </TabsList>

      <TabsContent value="description" className="pt-5">
        {product.description ? (
          // Server-sanitised rich text (D1: DOMPurify runs before storage).
          <div
            className="max-w-prose text-sm leading-relaxed [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-3 [&_ul]:mb-3"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No description yet.</p>
        )}
      </TabsContent>

      <TabsContent value="specifications" className="pt-5">
        {specs.length > 0 ? (
          <div className="max-w-lg overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {specs.map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium capitalize">
                      {key}
                    </th>
                    <td className="px-4 py-2.5 text-muted-foreground">{String(value)}</td>
                  </tr>
                ))}
                {product.weight ? (
                  <tr>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      Weight
                    </th>
                    <td className="numeric px-4 py-2.5 text-muted-foreground">
                      {product.weight} kg
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No specifications listed.</p>
        )}
      </TabsContent>

      <TabsContent value="reviews" className="pt-5">
        <div className="max-w-2xl space-y-6">
          <div className="flex items-center gap-4">
            <span className="numeric text-4xl font-semibold">
              {product.reviewSummary.rating.toFixed(1)}
            </span>
            <div>
              <StarRating rating={product.reviewSummary.rating} />
              <p className="mt-1 text-sm text-muted-foreground">
                {product.reviewSummary.count} reviews
              </p>
            </div>
          </div>

          <ul className="space-y-1.5">
            {product.reviewSummary.distribution.map((bucket) => {
              const percent = product.reviewSummary.count
                ? (bucket.count / product.reviewSummary.count) * 100
                : 0;

              return (
                <li key={bucket.rating} className="flex items-center gap-3 text-sm">
                  <span className="numeric w-6 text-muted-foreground">{bucket.rating}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-warning"
                      style={{ width: `${percent}%` }}
                    />
                  </span>
                  <span className="numeric w-8 text-right text-xs text-muted-foreground">
                    {bucket.count}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* The AI consensus sits above the individual reviews, never instead
              of them - a shopper has to be able to check it against the source. */}
          <ReviewSummaryCard productId={product.id} />

          <ReviewList productId={product.id} />
        </div>
      </TabsContent>

      <TabsContent value="shipping" className="pt-5">
        <div className="max-w-prose space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Kathmandu valley:</span> 1–2 working
            days. Free over {formatPrice(5000)}, otherwise {formatPrice(150)}.
          </p>
          <p>
            <span className="font-medium text-foreground">Outside the valley:</span> 3–6 working
            days depending on district. Rates are calculated at checkout.
          </p>
          <p>
            <span className="font-medium text-foreground">Returns:</span> 7 days from delivery
            for unused items in original packaging.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
