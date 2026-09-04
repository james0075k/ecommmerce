'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  MapPin,
  Package,
  Truck,
  XCircle,
} from 'lucide-react';

import { DEFAULT_TAX_RATE } from '@bazaar/shared/constants';
import { OrderStatus, PaymentStatus } from '@bazaar/shared/enums';
import type { OrderView } from '@bazaar/shared';
import { formatDate, formatPrice } from '@bazaar/ui';

import { Confetti } from '@/components/animations/confetti';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { API_BASE_URL, apiFetch } from '@/lib/api';
import { useCheckoutStore } from '@/lib/store/checkout-store';
import { cn } from '@/lib/utils';

/**
 * The order confirmation.
 *
 * A gateway callback can land here a beat before its webhook has been
 * processed, so an order still at PENDING is shown as "processing" and polled
 * rather than declared failed - telling someone their payment did not work when
 * it did is the worst outcome on this page.
 */
export function ConfirmationView({ orderId }: { orderId: string }) {
  const params = useSearchParams();
  const isPending = params.get('pending') === '1';
  const resetCheckout = useCheckoutStore((state) => state.reset);

  const { data: order, isPending: loading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiFetch<OrderView>(`/orders/${orderId}`),
    // Poll only while the payment has not settled; stop as soon as it has.
    refetchInterval: (query) => {
      const status = query.state.data?.payment?.status;
      return status === PaymentStatus.PENDING && query.state.dataUpdateCount < 20 ? 3000 : false;
    },
  });

  const isConfirmed =
    !!order && order.status !== OrderStatus.PENDING && order.status !== OrderStatus.CANCELLED;

  // The purchase is done - a stale half-filled checkout form should not be
  // waiting in sessionStorage for the next one.
  React.useEffect(() => {
    if (isConfirmed) resetCheckout();
  }, [isConfirmed, resetCheckout]);

  if (loading) {
    return (
      <div className="container-bazaar max-w-2xl space-y-4 py-12">
        <Skeleton className="mx-auto size-16 rounded-full" />
        <Skeleton className="mx-auto h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-bazaar flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <XCircle className="size-10 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">
          We could not find that order. Check the link in your confirmation email.
        </p>
        <Button asChild variant="outline">
          <Link href="/products">Back to shopping</Link>
        </Button>
      </div>
    );
  }

  const awaitingPayment =
    order.status === OrderStatus.PENDING &&
    (isPending || order.payment?.status === PaymentStatus.PENDING);

  return (
    <div className="container-bazaar max-w-2xl py-10">
      {isConfirmed ? <Confetti /> : null}

      <header className="mb-8 flex flex-col items-center gap-3 text-center">
        <StatusIcon order={order} awaitingPayment={awaitingPayment} />

        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          {order.status === OrderStatus.CANCELLED
            ? 'Order cancelled'
            : awaitingPayment
              ? 'Finishing your payment'
              : 'Thank you — your order is confirmed'}
        </h1>

        <p className="text-sm text-muted-foreground text-pretty">
          {order.status === OrderStatus.CANCELLED ? (
            (order.cancelledReason ?? 'This order was cancelled.')
          ) : awaitingPayment ? (
            'We are waiting for your payment gateway to confirm. This page updates itself.'
          ) : (
            <>
              We have emailed your receipt. Your order number is{' '}
              <span className="numeric font-medium text-foreground">{order.orderNumber}</span>.
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant={order.status === OrderStatus.CANCELLED ? 'destructive' : 'secondary'}>
            {order.status}
          </Badge>
          {order.payment ? (
            <Badge variant="secondary">
              {order.payment.method} · {order.payment.status}
            </Badge>
          ) : null}
        </div>
      </header>

      {order.payment?.status === PaymentStatus.PENDING &&
      order.payment.method === 'COD' ? (
        <Callout tone="info" icon={Truck}>
          Have {formatPrice(order.total, order.currency)} ready in cash for the courier.
        </Callout>
      ) : null}

      {order.status === OrderStatus.CANCELLED && order.payment?.status === PaymentStatus.COMPLETED ? (
        <Callout tone="warning" icon={AlertTriangle}>
          A refund has been started. Card refunds take 5–10 business days; wallet refunds are
          usually same-day.
        </Callout>
      ) : null}

      {/* --- Delivery ------------------------------------------------------ */}

      {order.estimatedDeliveryDate && order.status !== OrderStatus.CANCELLED ? (
        <section className="mb-6 rounded-md border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <Truck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-medium">
                Estimated delivery by {formatDate(order.estimatedDeliveryDate)}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {order.shippingMethod === 'EXPRESS' ? 'Express delivery' : 'Standard delivery'}
                {order.trackingNumber ? ` · Tracking ${order.trackingNumber}` : ''}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* --- Items --------------------------------------------------------- */}

      <section className="mb-6 rounded-md border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Package className="size-4 text-muted-foreground" aria-hidden />
          {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
        </h2>

        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.productName}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.slug ? (
                    <Link href={`/products/${item.slug}`} className="hover:underline">
                      {item.productName}
                    </Link>
                  ) : (
                    item.productName
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[item.variantName, `Qty ${item.quantity}`].filter(Boolean).join(' · ')}
                </p>
              </div>

              <p className="numeric shrink-0 text-sm font-medium">
                {formatPrice(item.totalPrice, order.currency)}
              </p>
            </li>
          ))}
        </ul>

        <Separator className="my-4" />

        <dl className="space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatPrice(order.subtotal, order.currency)} />
          {order.discountAmount > 0 ? (
            <Row
              label="Discount"
              value={`-${formatPrice(order.discountAmount, order.currency)}`}
              tone="success"
            />
          ) : null}
          <Row
            label="Shipping"
            value={
              order.shippingCost === 0 ? 'Free' : formatPrice(order.shippingCost, order.currency)
            }
            tone={order.shippingCost === 0 ? 'success' : undefined}
          />
          <Row
            label={`VAT (${(DEFAULT_TAX_RATE * 100).toFixed(0)}%)`}
            value={formatPrice(order.taxAmount, order.currency)}
          />

          <Separator className="my-2" />

          <div className="flex items-baseline justify-between">
            <dt className="font-display font-bold">Total</dt>
            <dd className="numeric font-display text-lg font-bold">
              {formatPrice(order.total, order.currency)}
            </dd>
          </div>
        </dl>
      </section>

      {/* --- Address ------------------------------------------------------- */}

      <section className="mb-8 rounded-md border border-border bg-card p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          Delivering to
        </h2>

        <address className="text-sm not-italic text-muted-foreground">
          <span className="font-medium text-foreground">{order.shippingAddress.fullName}</span>
          <br />
          {order.shippingAddress.street}, {order.shippingAddress.city}
          <br />
          {order.shippingAddress.district}, {order.shippingAddress.province},{' '}
          {order.shippingAddress.country}
          <br />
          <span className="numeric">{order.shippingAddress.phone}</span>
        </address>
      </section>

      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href={`/orders/${order.id}`}>Track order</Link>
        </Button>

        <Button asChild variant="outline">
          {/* A plain link, not fetch+blob: the API sets Content-Disposition and
              the browser's own PDF viewer handles it, cookies included. */}
          <a href={`${API_BASE_URL}/orders/${order.id}/invoice`} target="_blank" rel="noreferrer">
            <Download className="size-4" />
            Invoice
          </a>
        </Button>

        <Button asChild variant="ghost">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StatusIcon({ order, awaitingPayment }: { order: OrderView; awaitingPayment: boolean }) {
  if (order.status === OrderStatus.CANCELLED) {
    return (
      <div className="grid size-16 place-items-center rounded-full bg-destructive/10">
        <XCircle className="size-8 text-destructive" aria-hidden />
      </div>
    );
  }

  if (awaitingPayment) {
    return (
      <div className="grid size-16 place-items-center rounded-full bg-warning/10">
        <Clock className="size-8 animate-pulse text-caution" aria-hidden />
      </div>
    );
  }

  return (
    <div className="bz-heart-pop grid size-16 place-items-center rounded-full bg-success/10">
      <CheckCircle2 className="size-8 text-ok" aria-hidden />
    </div>
  );
}

function Callout({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warning';
  icon: typeof Truck;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex items-start gap-2.5 rounded-md border p-4 text-sm',
        tone === 'warning'
          ? 'border-warning/40 bg-warning/10'
          : 'border-border bg-muted/40',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'warning' ? 'text-caution' : 'text-muted-foreground',
        )}
        aria-hidden
      />
      <p className="text-pretty">{children}</p>
    </div>
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
