'use client';

import * as React from 'react';
import Link from 'next/link';
import { Loader2, ShoppingBag, Tag, X } from 'lucide-react';
import { AlertTriangle, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { formatPrice } from '@bazaar/ui';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useCartStore } from '@/lib/store/cart-store';
import { cn } from '@/lib/utils';

/**
 * The pieces the cart drawer and the full-page cart both render.
 *
 * Phase 11 gives mobile its own `/cart` route rather than a drawer squeezed
 * into 375px, which meant two surfaces showing the same totals, the same coupon
 * field and the same empty state. They live here so a change to the free
 * shipping copy happens once.
 */

/* -------------------------------------------------------------------------- */
/*  Quantity                                                                  */
/* -------------------------------------------------------------------------- */

export function QuantityStepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border">
      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-r-none"
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
        aria-label="Decrease quantity"
      >
        <Minus className="size-3" />
      </Button>

      <span
        className="numeric w-8 text-center text-sm tabular-nums"
        aria-live="polite"
        aria-label={`Quantity: ${value}`}
      >
        {value}
      </span>

      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-l-none"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
      >
        <Plus className="size-3" />
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  States                                                                    */
/* -------------------------------------------------------------------------- */

export function EmptyCart({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-muted">
        <ShoppingBag className="size-7 text-muted-foreground" aria-hidden />
      </div>
      <div>
        <p className="font-medium">Your cart is empty</p>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Browse the catalogue and add something you like.
        </p>
      </div>
      <Button asChild onClick={onNavigate}>
        <Link href="/products">Start shopping</Link>
      </Button>
    </div>
  );
}

export function StockWarning({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden />
      <p className="text-pretty">
        {count === 1
          ? 'One item needs your attention before checkout.'
          : `${count} items need your attention before checkout.`}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Summary                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Coupon field, totals and the checkout call to action.
 *
 * `onNavigate` is the drawer's close handler and nothing at all on the cart
 * page - following the link out of a drawer that stays open would leave it
 * covering the checkout.
 */
export function CartSummary({ onNavigate }: { onNavigate?: () => void }) {
  const view = useCartStore((state) => state.view);
  const summary = view?.summary;

  if (!summary) return null;

  return (
    <div className="px-5 py-4">
      <CouponField />

      <Separator className="my-3" />

      <dl className="space-y-1.5 text-sm">
        <Row label="Subtotal" value={formatPrice(summary.subtotal, summary.currency)} />

        {summary.discount > 0 ? (
          <Row
            label={`Discount${view?.coupon ? ` (${view.coupon.code})` : ''}`}
            value={`-${formatPrice(summary.discount, summary.currency)}`}
            tone="success"
          />
        ) : null}

        <Row
          label="Estimated shipping"
          value={
            summary.isFreeShipping ? 'Free' : formatPrice(summary.shipping, summary.currency)
          }
          tone={summary.isFreeShipping ? 'success' : undefined}
        />

        {summary.freeShippingRemaining > 0 ? (
          <p className="pt-0.5 text-xs text-muted-foreground text-pretty">
            Spend {formatPrice(summary.freeShippingRemaining, summary.currency)} more for free
            shipping.
          </p>
        ) : null}

        <Separator className="my-2" />

        <div className="flex items-baseline justify-between">
          <dt className="font-display font-bold">Total</dt>
          <dd className="numeric font-display text-lg font-bold">
            {formatPrice(summary.total, summary.currency)}
          </dd>
        </div>
      </dl>

      <p className="mt-1.5 text-xs text-muted-foreground">
        Shipping is an estimate. The final rate is calculated from your delivery district at
        checkout.
      </p>

      <Button asChild size="lg" className="mt-3 w-full" disabled={!view?.isCheckoutReady}>
        <Link href="/checkout" onClick={onNavigate}>
          Proceed to checkout
        </Link>
      </Button>

      {!view?.isCheckoutReady ? (
        <p className="mt-2 text-center text-xs text-destructive">
          Remove or adjust the flagged items to continue.
        </p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success';
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('numeric', tone === 'success' && 'text-ok')}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Coupon                                                                    */
/* -------------------------------------------------------------------------- */

export function CouponField() {
  const coupon = useCartStore((state) => state.view?.coupon ?? null);
  const applyCoupon = useCartStore((state) => state.applyCoupon);
  const removeCoupon = useCartStore((state) => state.removeCoupon);
  const isApplying = useCartStore((state) => state.isApplyingCoupon);
  const error = useCartStore((state) => state.couponError);

  const [code, setCode] = React.useState('');

  if (coupon) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Tag className="size-4 shrink-0 text-ok" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{coupon.code}</p>
            <p className="truncate text-xs text-muted-foreground">{coupon.description}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => void removeCoupon()}
          aria-label={`Remove coupon ${coupon.code}`}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;

    void applyCoupon(code).then((result) => {
      if (result) {
        setCode('');
        toast.success(`${result.coupon.code} applied — ${result.coupon.description}.`);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Coupon code"
          aria-label="Coupon code"
          aria-invalid={!!error}
          className="h-9 font-mono text-sm uppercase"
          autoComplete="off"
        />
        <Button type="submit" variant="outline" size="lg" disabled={isApplying || !code.trim()}>
          {isApplying ? <Loader2 className="size-4 animate-spin" /> : null}
          Apply
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive text-pretty">
          {error}
        </p>
      ) : null}
    </form>
  );
}
