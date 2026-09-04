'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

import type { CheckoutInput, CheckoutResult } from '@bazaar/shared';
import { fadeInUp, formatPrice } from '@bazaar/ui';

import { AddressStep } from '@/components/checkout/address-step';
import { PaymentHandoff } from '@/components/checkout/payment-handoff';
import { PaymentStep } from '@/components/checkout/payment-step';
import { ReviewStep } from '@/components/checkout/review-step';
import { ShippingStep } from '@/components/checkout/shipping-step';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { CHECKOUT_STEPS, useCheckoutStore } from '@/lib/store/checkout-store';
import { cn } from '@/lib/utils';

/**
 * The four-step checkout.
 *
 * Steps live in a store rather than the URL: a half-filled address is not
 * something to make shareable or bookmarkable, and a back-button that dropped
 * the shopper into step 3 with no address would be worse than one that leaves
 * the page. The store persists to sessionStorage instead, which is what makes
 * a failed gateway redirect survivable.
 */
export function CheckoutView() {
  const router = useRouter();
  const params = useSearchParams();

  const step = useCheckoutStore((state) => state.step);
  const furthest = useCheckoutStore((state) => state.furthest);
  const goTo = useCheckoutStore((state) => state.goTo);
  const reset = useCheckoutStore((state) => state.reset);

  const cart = useCartStore((state) => state.view);
  const cartReady = useCartStore((state) => state.ready);
  const refreshCart = useCartStore((state) => state.refresh);
  const user = useAuthStore((state) => state.user);

  const [result, setResult] = React.useState<CheckoutResult | null>(null);
  const [isPlacing, setPlacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // A gateway that rejected the payment bounces back here with ?error=.
  const gatewayError = params.get('error');

  React.useEffect(() => {
    if (gatewayError) {
      toast.error(gatewayError);
      // Clear it from the URL so a refresh does not re-toast the same failure.
      router.replace('/checkout', { scroll: false });
    }
  }, [gatewayError, router]);

  React.useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const placeOrder = React.useCallback(async () => {
    // Both stores are read imperatively rather than closed over: this runs once
    // on a click, and depending on the rendered values would re-create the
    // callback on every cart tick for no benefit.
    const state = useCheckoutStore.getState();
    const coupon = useCartStore.getState().view?.coupon ?? null;

    if (!state.address || !state.paymentMethod) {
      setError('Choose an address and a payment method first.');
      return;
    }

    setPlacing(true);
    setError(null);

    const body: CheckoutInput = {
      // A saved address is sent by id so the server re-reads it rather than
      // trusting a copy that could have been edited in transit.
      ...(state.savedAddressId
        ? { shippingAddressId: state.savedAddressId }
        : { shippingAddress: state.address }),
      ...(user ? {} : { guestEmail: state.guestEmail }),
      paymentMethod: state.paymentMethod,
      shippingMethod: state.shippingMethod,
      ...(coupon ? { couponCode: coupon.code } : {}),
      ...(state.notes ? { notes: state.notes } : {}),
    };

    try {
      const checkout = await apiFetch<CheckoutResult>('/orders/checkout', {
        method: 'POST',
        body,
      });

      setResult(checkout);

      // The order exists now, so the cart is gone server-side too.
      await refreshCart();

      // Cash on delivery and bank transfer have nothing to hand off to - the
      // order is already placed, so go straight to the confirmation.
      if (checkout.payment.kind === 'none') {
        reset();
        router.push(`/orders/${checkout.order.id}/confirmation`);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'We could not place your order. Please try again.',
      );
      setPlacing(false);
    }
  }, [refreshCart, reset, router, user]);

  /* --- Handoff takes over the whole page once an order exists ------------ */

  if (result && result.payment.kind !== 'none') {
    return (
      <div className="container-bazaar flex min-h-[60vh] max-w-lg flex-col justify-center py-12">
        <div className="rounded-md border border-border bg-card p-6">
          <p className="mb-1 text-sm text-muted-foreground">
            Order {result.order.orderNumber}
          </p>
          <p className="numeric font-display mb-6 text-2xl font-bold">
            {formatPrice(result.order.total, result.order.currency)}
          </p>

          <PaymentHandoff payment={result.payment} orderId={result.order.id} />
        </div>
      </div>
    );
  }

  /* --- Empty / loading --------------------------------------------------- */

  if (!cartReady) {
    return (
      <div className="container-bazaar max-w-3xl space-y-4 py-12">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-bazaar flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-muted">
          <ShoppingBag className="size-7 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Your cart is empty</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add something to it before checking out.
          </p>
        </div>
        <Button asChild>
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  const currentIndex = CHECKOUT_STEPS.findIndex((entry) => entry.id === step);
  const furthestIndex = CHECKOUT_STEPS.findIndex((entry) => entry.id === furthest);

  return (
    <div className="container-bazaar max-w-3xl py-8">
      <h1 className="font-display mb-6 text-2xl font-bold tracking-tight md:text-3xl">
        Checkout
      </h1>

      <ol className="mb-8 flex items-center gap-1 sm:gap-2" aria-label="Checkout progress">
        {CHECKOUT_STEPS.map((entry, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          // Only steps already reached are clickable - jumping ahead to Review
          // with no address would just error.
          const reachable = index <= furthestIndex;

          return (
            <li key={entry.id} className="flex flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => goTo(entry.id)}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors',
                  reachable ? 'hover:bg-muted' : 'cursor-default',
                  isCurrent ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'numeric grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                    isDone
                      ? 'bg-success text-white'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                <span className="hidden truncate sm:inline">{entry.label}</span>
              </button>

              {index < CHECKOUT_STEPS.length - 1 ? (
                <span
                  className={cn('h-px flex-1', isDone ? 'bg-success' : 'bg-border')}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* `mode="wait"` so the outgoing step finishes before the next paints -
          overlapping two full-height forms reads as a glitch. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
        >
          {step === 'address' ? <AddressStep /> : null}
          {step === 'shipping' ? <ShippingStep /> : null}
          {step === 'payment' ? <PaymentStep /> : null}
          {step === 'review' ? (
            <ReviewStep
              onPlaceOrder={() => void placeOrder()}
              isPlacing={isPlacing}
              error={error}
            />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
