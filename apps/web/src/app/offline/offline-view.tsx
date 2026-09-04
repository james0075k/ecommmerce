'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';

import { formatPrice } from '@bazaar/ui';

import { Button } from '@/components/ui/button';
import { useOnlineStatus } from '@/lib/hooks/use-media-query';
import type { ProductListItem, ProductListResponse } from '@/lib/catalog';

/**
 * "You're offline", with whatever the service worker already has.
 *
 * The products are read straight out of the Cache API rather than fetched: the
 * worker stores catalogue responses under `bazaar-data-*`, so anything the
 * shopper has already browsed is sitting on the device and can be shown without
 * a connection. If nothing has been cached yet, the page says so rather than
 * showing an empty grid.
 */
export function OfflineView() {
  const [products, setProducts] = React.useState<ProductListItem[] | null>(null);
  const online = useOnlineStatus();

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!('caches' in window)) {
        if (!cancelled) setProducts([]);
        return;
      }

      const collected = new Map<string, ProductListItem>();

      try {
        const names = await caches.keys();

        for (const name of names.filter((key) => key.startsWith('bazaar-data-'))) {
          const cache = await caches.open(name);

          for (const request of await cache.keys()) {
            if (!request.url.includes('/products')) continue;

            const response = await cache.match(request);
            if (!response) continue;

            const payload = (await response.json()) as Partial<ProductListResponse>;
            for (const item of payload.items ?? []) collected.set(item.id, item);
          }
        }
      } catch {
        // A cache that cannot be read is the same as an empty one here.
      }

      if (!cancelled) setProducts([...collected.values()].slice(0, 8));
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container-bazaar flex min-h-dvh flex-col justify-center py-16">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-4 text-center">
          <span
            aria-hidden
            className="mx-auto grid size-16 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            {online ? <Wifi className="size-7" /> : <CloudOff className="size-7" />}
          </span>

          <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
            {online ? 'You are back online' : 'You are offline'}
          </h1>

          <p className="mx-auto max-w-prose text-sm text-muted-foreground text-pretty md:text-base">
            {online
              ? 'The connection is back. Reload to pick up where you left off.'
              : 'Bazaar keeps what you have already browsed on your device. Checkout needs a connection, but you can keep looking.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Go to the homepage</Link>
            </Button>
          </div>
        </div>

        {products === null ? null : products.length > 0 ? (
          <section className="space-y-4">
            <h2 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Saved on this device
            </h2>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {products.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.slug}`}
                    className="block overflow-hidden rounded-md border border-border bg-card transition-shadow hover:shadow-card"
                  >
                    <span className="relative block aspect-square bg-muted">
                      {product.image ? (
                        <Image
                          src={product.image.url}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="block space-y-1 p-2.5">
                      <span className="line-clamp-2 block text-xs leading-snug font-medium">
                        {product.name}
                      </span>
                      <span className="numeric block text-sm font-semibold">
                        {formatPrice(product.price, product.currency)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing has been saved on this device yet. Once you have browsed the catalogue,
            it will be here the next time the connection drops.
          </p>
        )}
      </div>
    </div>
  );
}
