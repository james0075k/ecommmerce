'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Heart,
  Link2,
  Loader2,
  ShoppingCart,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';

import type { WishlistEntry } from '@bazaar/shared';
import { blurProps, formatPrice, scaleIn, staggerChildren } from '@bazaar/ui';

import { StarRating } from '@/components/shop/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { useWishlistStore } from '@/lib/store/wishlist-store';

/**
 * The saved-items grid.
 *
 * Middleware already redirects signed-out visitors at the edge, so the
 * signed-out branch here only covers a session that expired while the tab was
 * open.
 */
export function WishlistView() {
  const items = useWishlistStore((state) => state.items);
  const ready = useWishlistStore((state) => state.ready);
  const hydrate = useWishlistStore((state) => state.hydrate);
  const user = useAuthStore((state) => state.user);
  const authReady = useAuthStore((state) => state.ready);

  React.useEffect(() => {
    if (authReady && user) void hydrate();
  }, [authReady, user, hydrate]);

  if (authReady && !user) {
    return (
      <div className="container-bazaar flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Heart className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Log in to see the items you have saved.
        </p>
        <Button asChild>
          <Link href="/login?next=/wishlist">Log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container-bazaar py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Your wishlist
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {!ready
              ? 'Loading…'
              : items.length === 0
                ? 'Nothing saved yet.'
                : `${items.length} saved ${items.length === 1 ? 'item' : 'items'}`}
          </p>
        </div>

        {items.length > 0 ? <ShareControls /> : null}
      </header>

      {!ready ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.ul
          variants={staggerChildren()}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4"
        >
          {items.map((entry) => (
            <WishlistCard key={entry.id} entry={entry} />
          ))}
        </motion.ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function WishlistCard({ entry }: { entry: WishlistEntry }) {
  const moveToCart = useWishlistStore((state) => state.moveToCart);
  const remove = useWishlistStore((state) => state.remove);
  const isBusy = useWishlistStore((state) => state.busyIds.includes(entry.id));

  const variantLabel = entry.variant
    ? Object.entries(entry.variant.attributes)
        .map(([name, value]) => `${name}: ${value}`)
        .join(' · ')
    : null;

  const handleMove = async () => {
    try {
      await moveToCart(entry.id);
      toast.success(`${entry.product.name} moved to your cart.`);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not move that to your cart.',
      );
    }
  };

  const handleRemove = async () => {
    try {
      await remove(entry.id);
      toast.success('Removed from your wishlist.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove that item.');
    }
  };

  return (
    <motion.li variants={scaleIn} className="h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card">
        <Link
          href={`/products/${entry.product.slug}`}
          className="relative block aspect-square overflow-hidden bg-muted"
        >
          {entry.product.image ? (
            <Image
              src={entry.product.image.url}
              alt={entry.product.image.altText ?? entry.product.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover"
              {...blurProps(entry.product.image.blurhash)}
            />
          ) : (
            <span className="grid h-full place-items-center text-xs text-muted-foreground">
              No image
            </span>
          )}

          <div className="absolute top-2 left-2 flex flex-col gap-1.5">
            {/* G2: the whole point of storing `price_at_add`. */}
            {entry.priceDropPercent > 0 ? (
              <Badge className="gap-1 bg-success text-white">
                <TrendingDown className="size-3" aria-hidden />
                {entry.priceDropPercent}% off since saved
              </Badge>
            ) : null}
            {!entry.inStock ? <Badge variant="destructive">Out of stock</Badge> : null}
          </div>
        </Link>

        <div className="flex flex-1 flex-col gap-2 p-3">
          {entry.product.brand ? (
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {entry.product.brand}
            </p>
          ) : null}

          <h2 className="line-clamp-2 text-sm leading-snug font-medium">
            <Link href={`/products/${entry.product.slug}`} className="hover:underline">
              {entry.product.name}
            </Link>
          </h2>

          {variantLabel ? (
            <p className="truncate text-xs text-muted-foreground">{variantLabel}</p>
          ) : null}

          {entry.product.reviewCount > 0 ? (
            <StarRating
              rating={entry.product.rating}
              count={entry.product.reviewCount}
              size="sm"
            />
          ) : null}

          <div className="mt-auto flex items-baseline gap-2 pt-1">
            <span className="numeric text-base font-semibold">
              {formatPrice(entry.currentPrice, entry.product.currency)}
            </span>
            {entry.priceDropAmount > 0 ? (
              <span className="numeric text-xs text-muted-foreground line-through">
                {formatPrice(entry.priceAtAdd, entry.product.currency)}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={isBusy || !entry.inStock}
              onClick={() => void handleMove()}
            >
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShoppingCart className="size-4" />
              )}
              {entry.inStock ? 'Move to cart' : 'Out of stock'}
            </Button>

            <Button
              variant="outline"
              size="icon-sm"
              className="size-8 text-muted-foreground hover:text-destructive"
              disabled={isBusy}
              onClick={() => void handleRemove()}
              aria-label={`Remove ${entry.product.name} from wishlist`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Generates the public share link on demand.
 *
 * The link is never created implicitly: a wishlist is private until its owner
 * asks for a URL, and "Stop sharing" revokes the token so every copy already
 * sent stops resolving.
 */
function ShareControls() {
  const shareUrl = useWishlistStore((state) => state.shareUrl);
  const createShareLink = useWishlistStore((state) => state.createShareLink);
  const stopSharing = useWishlistStore((state) => state.stopSharing);

  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied.');
    } catch {
      // Clipboard access is denied outside a secure context - the input is
      // right there and selectable, so this is a nudge, not a failure.
      toast.info('Select the link and copy it manually.');
    }
  };

  if (!shareUrl) {
    return (
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const url = await createShareLink();
            await copy(url);
          } catch {
            toast.error('Could not create a share link.');
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
        Share wishlist
      </Button>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-1.5 sm:w-auto">
      <div className="flex gap-2">
        <Input
          readOnly
          value={shareUrl}
          aria-label="Wishlist share link"
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 font-mono text-xs"
        />
        <Button variant="outline" size="icon-sm" onClick={() => void copy(shareUrl)} aria-label="Copy link">
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
        </Button>
      </div>

      <button
        type="button"
        className="self-end text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        onClick={async () => {
          await stopSharing();
          toast.success('Sharing stopped. The old link no longer works.');
        }}
      >
        Stop sharing
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border py-20 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-muted">
        <Heart className="size-7 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="font-medium">Nothing saved yet</p>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Tap the heart on any product to save it here and watch for price drops.
        </p>
      </div>
      <Button asChild>
        <Link href="/products">Browse products</Link>
      </Button>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-md border border-border">
          <Skeleton className="aspect-square rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
