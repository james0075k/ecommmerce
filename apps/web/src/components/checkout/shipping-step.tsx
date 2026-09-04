'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Truck, Zap } from 'lucide-react';

import type { ShippingQuote } from '@bazaar/shared';
import { formatPrice } from '@bazaar/ui';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useCartStore } from '@/lib/store/cart-store';
import { useCheckoutStore } from '@/lib/store/checkout-store';
import { cn } from '@/lib/utils';

const ICONS = { STANDARD: Truck, EXPRESS: Zap } as const;

/**
 * Step 2 - how fast.
 *
 * Rates come from the server for the chosen district rather than being computed
 * here, so the number on this screen is the same number the order is written
 * with. Hard-coding a rate table in the client is how a shopper ends up quoted
 * one price and charged another.
 */
export function ShippingStep() {
  const address = useCheckoutStore((state) => state.address);
  const selected = useCheckoutStore((state) => state.shippingMethod);
  const setShippingMethod = useCheckoutStore((state) => state.setShippingMethod);
  const next = useCheckoutStore((state) => state.next);
  const back = useCheckoutStore((state) => state.back);

  const subtotal = useCartStore((state) => state.view?.summary.subtotal ?? 0);
  const currency = useCartStore((state) => state.view?.summary.currency ?? 'NPR');

  const district = address?.district ?? '';

  const { data: quotes, isPending } = useQuery({
    queryKey: ['shipping-quote', district, subtotal],
    queryFn: () =>
      apiFetch<ShippingQuote[]>(
        `/shipping/quote?district=${encodeURIComponent(district)}&subtotal=${subtotal}`,
      ),
    enabled: !!district,
  });

  if (!district) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Choose a delivery address first so we can calculate shipping.
        </p>
        <Button variant="outline" onClick={back}>
          Back to address
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium">Delivery to {district}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {quotes?.[0]?.zone === 'VALLEY'
            ? 'Inside the Kathmandu valley.'
            : 'Outside the Kathmandu valley.'}
        </p>
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <ul className="space-y-3" role="radiogroup" aria-label="Shipping method">
          {(quotes ?? []).map((quote) => {
            const Icon = ICONS[quote.method];
            const isSelected = selected === quote.method;

            return (
              <li key={quote.method}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setShippingMethod(quote.method)}
                  className={cn(
                    'flex w-full items-start gap-4 rounded-md border p-4 text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{quote.label}</span>
                      {quote.isFree ? (
                        <Badge className="bg-success text-white">Free</Badge>
                      ) : null}
                    </span>

                    <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">
                      {quote.description}
                    </span>

                    <span className="mt-1 block text-sm">
                      Arrives in{' '}
                      {quote.estimatedDaysMin === quote.estimatedDaysMax
                        ? `${quote.estimatedDaysMax} business day${quote.estimatedDaysMax === 1 ? '' : 's'}`
                        : `${quote.estimatedDaysMin}–${quote.estimatedDaysMax} business days`}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="numeric block font-semibold">
                      {quote.cost === 0 ? 'Free' : formatPrice(quote.cost, currency)}
                    </span>
                    {quote.isFree ? (
                      <span className="numeric block text-xs text-muted-foreground line-through">
                        {formatPrice(quote.baseCost, currency)}
                      </span>
                    ) : null}
                  </span>

                  {isSelected ? (
                    <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={next}>Continue to payment</Button>
        <Button variant="ghost" onClick={back}>
          Back
        </Button>
      </div>
    </div>
  );
}
