import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Gift, Heart } from 'lucide-react';

import type { SharedWishlistView } from '@bazaar/shared';
import { blurProps, formatPrice } from '@bazaar/ui';

import { StarRating } from '@/components/shop/star-rating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const metadata: Metadata = {
  // A share link is meant for the person it was sent to, not for the index.
  robots: { index: false, follow: false },
};

/**
 * The read-only view behind a share link.
 *
 * A server component on purpose: it is public, needs no session, and the
 * recipient is often opening it on a phone from a chat app - so it should paint
 * on the first response rather than after a client fetch. Anyone can act on
 * these products through the normal product pages; nothing here mutates the
 * owner's list.
 */
export default async function SharedWishlistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const response = await fetch(`${API_URL}/wishlist/shared/${encodeURIComponent(token)}`, {
    // A revoked token has to stop working immediately, so this is never cached.
    cache: 'no-store',
  });

  if (!response.ok) notFound();

  const wishlist = (await response.json()) as SharedWishlistView;

  return (
    <div className="container-bazaar py-8">
      <header className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-primary/10">
          <Gift className="size-6 text-primary" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          {wishlist.ownerName}&rsquo;s wishlist
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground text-pretty">
          {wishlist.items.length === 0
            ? 'There is nothing on this wishlist right now.'
            : `${wishlist.items.length} ${wishlist.items.length === 1 ? 'item' : 'items'} they are hoping for.`}
        </p>
      </header>

      {wishlist.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-20 text-center">
          <Heart className="size-8 text-muted-foreground" aria-hidden />
          <Button asChild variant="outline">
            <Link href="/products">Browse the shop</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {wishlist.items.map((entry) => (
            <li key={entry.product.id} className="h-full">
              <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-card transition-shadow hover:shadow-float">
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

                  {!entry.inStock ? (
                    <Badge variant="destructive" className="absolute top-2 left-2">
                      Out of stock
                    </Badge>
                  ) : null}
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

                  {entry.product.reviewCount > 0 ? (
                    <StarRating
                      rating={entry.product.rating}
                      count={entry.product.reviewCount}
                      size="sm"
                    />
                  ) : null}

                  <div className="mt-auto pt-1">
                    <span className="numeric text-base font-semibold">
                      {formatPrice(entry.currentPrice, entry.product.currency)}
                    </span>
                  </div>

                  <Button asChild size="sm" className="mt-1 w-full">
                    <Link href={`/products/${entry.product.slug}`}>View product</Link>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
