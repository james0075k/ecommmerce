'use client';

import * as React from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Lock, Pencil } from 'lucide-react';

import type { ShippingQuote } from '@bazaar/shared';
import { DEFAULT_TAX_RATE } from '@bazaar/shared';
import { blurProps, formatPrice } from '@bazaar/ui';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { apiFetch } from '@/lib/api';
import { useCartStore } from '@/lib/store/cart-store';
import { useCheckoutStore, type CheckoutStep } from '@/lib/store/checkout-store';
import { cn } from '@/lib/utils';

/**
 * Step 4 - confirm and pay.
 *
 * The totals here are the client's best estimate, computed from the same rules
 * the server uses. The server recomputes all of it at checkout and the order is
 * written with *its* numbers, so a discrepancy shows up on the confirmation
 * page rather than being silently accepted. Displaying an estimate is fine;
 * sending one would not be.
 */
export function ReviewStep({
  onPlaceOrder,
  isPlacing,
  error,
}: {
  /** Owned by the page, which also owns the payment handoff that follows. */
  onPlaceOrder: () => void;
  isPlacing: boolean;
  error: string | null;
}) {
  const view = useCartStore((state) => state.view);
  const goTo = useCheckoutStore((state) => state.goTo);
  const back = useCheckoutStore((state) => state.back);

  const address = useCheckoutStore((state) => state.address);
  const guestEmail = useCheckoutStore((state) => state.guestEmail);
  const shippingMethod = useCheckoutStore((state) => state.shippingMethod);
  const paymentMethod = useCheckoutStore((state) => state.paymentMethod);
  const notes = useCheckoutStore((state) => state.notes);

  const currency = view?.summary.currency ?? 'NPR';
  const subtotal = view?.summary.subtotal ?? 0;
  const discount = view?.summary.discount ?? 0;

  const { data: quotes } = useQuery({
    queryKey: ['shipping-quote', address?.district ?? '', subtotal],
    queryFn: () =>
      apiFetch<ShippingQuote[]>(
        `/shipping/quote?district=${encodeURIComponent(address?.district ?? '')}&subtotal=${subtotal}`,
      ),
    enabled: !!address?.district,
  });

  const quote = quotes?.find((entry) => entry.method === shippingMethod);
  const shippingCost = quote?.cost ?? 0;

  // Mirrors the server: VAT on the discounted goods value, shipping untaxed.
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * DEFAULT_TAX_RATE * 100) / 100;
  const total = Math.round((taxable + shippingCost + tax) * 100) / 100;

  if (!view || view.items.length === 0) return null;

  return (
    <div className="space-y-6">
      <Section title="Delivering to" onEdit={() => goTo('address')} step="address">
        {address ? (
          <address className="text-sm not-italic">
            <span className="font-medium">{address.fullName}</span>
            <br />
            {address.street}, {address.city}
            <br />
            {address.district}, {address.province}, {address.country}
            <br />
            <span className="numeric text-muted-foreground">{address.phone}</span>
            {guestEmail ? (
              <>
                <br />
                <span className="text-muted-foreground">{guestEmail}</span>
              </>
            ) : null}
          </address>
        ) : (
          <p className="text-sm text-destructive">No address chosen.</p>
        )}
      </Section>

      <Section title="Shipping" onEdit={() => goTo('shipping')} step="shipping">
        <p className="text-sm">
          {quote?.label ?? shippingMethod}
          {quote ? (
            <span className="text-muted-foreground">
              {' · '}
              {quote.estimatedDaysMin === quote.estimatedDaysMax
                ? `${quote.estimatedDaysMax} business day${quote.estimatedDaysMax === 1 ? '' : 's'}`
                : `${quote.estimatedDaysMin}–${quote.estimatedDaysMax} business days`}
            </span>
          ) : null}
        </p>
      </Section>

      <Section title="Payment" onEdit={() => goTo('payment')} step="payment">
        <p className="text-sm">{paymentMethod ?? 'Not chosen'}</p>
        {notes ? (
          <p className="mt-1 text-sm text-muted-foreground text-pretty">Note: {notes}</p>
        ) : null}
      </Section>

      <Separator />

      <section>
        <h2 className="mb-3 text-sm font-medium">
          {view.items.length} {view.items.length === 1 ? 'item' : 'items'}
        </h2>

        <ul className="divide-y divide-border">
          {view.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {item.product.image ? (
                  <Image
                    src={item.product.image.url}
                    alt={item.product.image.altText ?? item.product.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                    {...blurProps(item.product.image.blurhash)}
                  />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.variant.name} · Qty {item.quantity}
                </p>
              </div>

              <p className="numeric shrink-0 text-sm font-medium">
                {formatPrice(item.lineTotal, currency)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Separator />

      <dl className="space-y-1.5 text-sm">
        <Row label="Subtotal" value={formatPrice(subtotal, currency)} />
        {discount > 0 ? (
          <Row
            label={`Discount${view.coupon ? ` (${view.coupon.code})` : ''}`}
            value={`-${formatPrice(discount, currency)}`}
            tone="success"
          />
        ) : null}
        <Row
          label="Shipping"
          value={shippingCost === 0 ? 'Free' : formatPrice(shippingCost, currency)}
          tone={shippingCost === 0 ? 'success' : undefined}
        />
        <Row label={`VAT (${(DEFAULT_TAX_RATE * 100).toFixed(0)}%)`} value={formatPrice(tax, currency)} />

        <Separator className="my-2" />

        <div className="flex items-baseline justify-between">
          <dt className="font-display text-base font-bold">Total</dt>
          <dd className="numeric font-display text-xl font-bold">
            {formatPrice(total, currency)}
          </dd>
        </div>
      </dl>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-pretty">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <PlaceOrderButton onPlaceOrder={onPlaceOrder} isPlacing={isPlacing} />
        <Button variant="ghost" onClick={back} disabled={isPlacing}>
          Back
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" aria-hidden />
        Your payment is processed by the gateway you chose. We never see your card details.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PlaceOrderButton({
  onPlaceOrder,
  isPlacing,
}: {
  onPlaceOrder: () => void;
  isPlacing: boolean;
}) {
  const address = useCheckoutStore((state) => state.address);
  const paymentMethod = useCheckoutStore((state) => state.paymentMethod);

  const ready = !!address && !!paymentMethod;

  return (
    <Button size="lg" disabled={!ready || isPlacing} onClick={onPlaceOrder}>
      {isPlacing ? <Loader2 className="size-4 animate-spin" /> : null}
      {isPlacing ? 'Placing your order…' : 'Place order'}
    </Button>
  );
}

function Section({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: CheckoutStep;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button variant="ghost" size="xs" onClick={onEdit} aria-label={`Edit ${step}`}>
          <Pencil className="size-3" />
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('numeric', tone === 'success' && 'text-ok')}>{value}</dd>
    </div>
  );
}
