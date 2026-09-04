'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  CheckCircle2,
  CreditCard,
  Download,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  PackageX,
  Radio,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { ORDER_STATUS_FLOW } from '@bazaar/shared/constants';
import { OrderStatus } from '@bazaar/shared/enums';
import type { OrderDetail, OrderUpdatedEvent } from '@bazaar/shared';
import { EASE_OUT_EXPO, formatDate, formatPrice } from '@bazaar/ui';

import { OrderStatusBadge, STATUS_LABELS } from '@/components/orders/order-status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { API_BASE_URL, ApiError, apiFetch } from '@/lib/api';
import { useOrderRealtime } from '@/lib/realtime';
import { cn } from '@/lib/utils';

/**
 * Order tracking.
 *
 * The page holds a live socket on the order while it is open, so a status an
 * operator sets in the admin table appears here without a reload. The socket is
 * a *notification*, not a source of truth: it triggers a refetch rather than
 * patching state from the payload, so the page can never drift from what the
 * API would say - and if the socket never connects, everything still works.
 */
export function OrderDetailView({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();

  const { data: order, isPending } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiFetch<OrderDetail>(`/orders/${orderId}`),
  });

  const onRealtime = React.useCallback(
    (event: OrderUpdatedEvent) => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      // The history list is what the account page shows next.
      void queryClient.invalidateQueries({ queryKey: ['orders'] });

      toast.success(STATUS_LABELS[event.status] ?? event.status, {
        description: event.note ?? `Order ${event.orderNumber} was updated.`,
      });
    },
    [orderId, queryClient],
  );

  const { connected } = useOrderRealtime(orderId, onRealtime);

  if (isPending) {
    return (
      <div className="container-bazaar max-w-2xl space-y-4 py-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container-bazaar flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <XCircle className="size-10 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">
          We could not find that order, or it belongs to another account.
        </p>
        <Button asChild variant="outline">
          <Link href="/products">Back to shopping</Link>
        </Button>
      </div>
    );
  }

  const stopped =
    order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED;

  return (
    <div className="container-bazaar max-w-2xl py-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display numeric text-2xl font-bold tracking-tight">
            {order.orderNumber}
          </h1>
          <OrderStatusBadge status={order.status} />
          {connected ? <LiveIndicator /> : null}
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Placed {formatDate(order.placedAt ?? order.createdAt)}
          {order.payment ? ` · Paid by ${order.payment.method}` : ''}
        </p>
      </header>

      {stopped ? (
        <div
          className={cn(
            'mb-6 flex items-start gap-2.5 rounded-md border p-4 text-sm',
            order.status === OrderStatus.REFUNDED
              ? 'border-violet-500/40 bg-violet-500/10'
              : 'border-destructive/40 bg-destructive/10',
          )}
        >
          {order.status === OrderStatus.REFUNDED ? (
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
          ) : (
            <PackageX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          )}

          <div className="space-y-1">
            <p className="text-pretty">
              {order.cancelledReason ??
                (order.status === OrderStatus.REFUNDED
                  ? 'This order was refunded.'
                  : 'This order was cancelled.')}
            </p>
            {order.refundedAmount > 0 ? (
              <p className="numeric text-xs text-muted-foreground">
                {formatPrice(order.refundedAmount, order.currency)} refunded to your original
                payment method.
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <Timeline order={order} />
      )}

      {order.trackingNumber ? <TrackingCard order={order} /> : null}

      <ItemsCard order={order} />
      <PaymentCard order={order} />

      <section className="mt-6 rounded-md border border-border bg-card p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          Delivering to
        </h2>
        <address className="text-sm not-italic text-muted-foreground">
          <span className="font-medium text-foreground">{order.shippingAddress.fullName}</span>
          <br />
          {order.shippingAddress.street}, {order.shippingAddress.city}
          <br />
          {order.shippingAddress.district}, {order.shippingAddress.province}
          <br />
          <span className="numeric">{order.shippingAddress.phone}</span>
        </address>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={`${API_BASE_URL}/orders/${order.id}/invoice`} target="_blank" rel="noreferrer">
            <Download className="size-4" />
            Download invoice
          </a>
        </Button>

        {order.isCancellable ? <CancelDialog order={order} /> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Live indicator                                                            */
/* -------------------------------------------------------------------------- */

function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Radio className="size-3 text-ok" aria-hidden />
      Live
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Timeline                                                                  */
/* -------------------------------------------------------------------------- */

const STEP_ICONS = [Package, CheckCircle2, PackageCheck, Truck, PackageCheck] as const;

/**
 * The vertical status timeline.
 *
 * Completed steps carry the timestamp from the order's own history rather than
 * a guess, so a step that happened three days ago says so. The current step
 * pulses to show the order is still moving - suppressed under
 * `prefers-reduced-motion`, where a steady ring says the same thing without the
 * animation.
 */
function Timeline({ order }: { order: OrderDetail }) {
  const reduceMotion = useReducedMotion();
  const flow = [...ORDER_STATUS_FLOW];
  const current = flow.indexOf(order.status as (typeof flow)[number]);

  // The first time a status was reached, which is the one worth showing: a
  // re-entered status is a correction, not a new event in the parcel's life.
  const reachedAt = new Map<string, string>();
  for (const entry of order.timeline) {
    if (!reachedAt.has(entry.status)) reachedAt.set(entry.status, entry.createdAt);
  }

  const notes = new Map<string, string>();
  for (const entry of order.timeline) {
    if (entry.note) notes.set(entry.status, entry.note);
  }

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <ol className="space-y-0">
        {flow.map((status, index) => {
          const done = index <= current;
          const isCurrent = index === current;
          const isLast = index === flow.length - 1;
          const Icon = STEP_ICONS[index] ?? CheckCircle2;
          const at = reachedAt.get(status);
          const note = notes.get(status);

          return (
            <li key={status} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="relative grid size-7 shrink-0 place-items-center">
                  {isCurrent && !reduceMotion ? (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-success"
                      initial={{ opacity: 0.5, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.8 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                    />
                  ) : null}

                  <motion.span
                    className={cn(
                      'relative grid size-7 place-items-center rounded-full',
                      done ? 'bg-success text-white' : 'bg-muted text-muted-foreground',
                      isCurrent && reduceMotion && 'ring-2 ring-success/40 ring-offset-2',
                    )}
                    initial={false}
                    animate={{ scale: isCurrent ? 1 : 0.94 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                  >
                    <Icon className="size-3.5" aria-hidden />
                  </motion.span>
                </span>

                {!isLast ? (
                  <span className="relative w-px flex-1 bg-border" aria-hidden>
                    <motion.span
                      className="absolute inset-x-0 top-0 bg-success"
                      initial={false}
                      animate={{ height: index < current ? '100%' : '0%' }}
                      transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                    />
                  </span>
                ) : null}
              </div>

              <div className={cn('pb-5', isLast && 'pb-0')}>
                <p className={cn('text-sm', done ? 'font-medium' : 'text-muted-foreground')}>
                  {STATUS_LABELS[status] ?? status}
                </p>

                {at ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(at)}</p>
                ) : null}

                {isCurrent && note ? (
                  <p className="mt-1 text-xs text-pretty text-muted-foreground">{note}</p>
                ) : null}

                {isCurrent && !at && order.estimatedDeliveryDate ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Estimated delivery by {formatDate(order.estimatedDeliveryDate)}
                  </p>
                ) : null}

                {isLast && !done && order.estimatedDeliveryDate ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Arriving by {formatDate(order.estimatedDeliveryDate)}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cards                                                                     */
/* -------------------------------------------------------------------------- */

function TrackingCard({ order }: { order: OrderDetail }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className="mt-6 rounded-md border border-border bg-card p-5"
    >
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Truck className="size-4 text-muted-foreground" aria-hidden />
        On its way with {order.carrierLabel ?? 'our courier'}
      </h2>

      <p className="numeric text-sm text-muted-foreground">
        Consignment {order.trackingNumber}
      </p>

      {order.trackingUrl ? (
        <Button asChild size="sm" variant="outline" className="mt-3">
          <a href={order.trackingUrl} target="_blank" rel="noreferrer">
            Track this parcel
          </a>
        </Button>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {order.carrierLabel ?? 'This courier'} has no online tracking - quote the consignment
          number if you call them.
        </p>
      )}
    </motion.section>
  );
}

function ItemsCard({ order }: { order: OrderDetail }) {
  return (
    <section className="mt-6 rounded-md border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-medium">
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
        <Line label="Subtotal" value={formatPrice(order.subtotal, order.currency)} />
        {order.discountAmount > 0 ? (
          <Line
            label="Discount"
            value={`-${formatPrice(order.discountAmount, order.currency)}`}
            tone="success"
          />
        ) : null}
        <Line
          label="Shipping"
          value={
            order.shippingCost === 0 ? 'Free' : formatPrice(order.shippingCost, order.currency)
          }
        />
        <Line label="VAT (13%)" value={formatPrice(order.taxAmount, order.currency)} />
      </dl>

      <Separator className="my-4" />

      <div className="flex items-baseline justify-between">
        <span className="font-display font-bold">Total</span>
        <span className="numeric font-display text-lg font-bold">
          {formatPrice(order.total, order.currency)}
        </span>
      </div>
    </section>
  );
}

function PaymentCard({ order }: { order: OrderDetail }) {
  if (!order.payment) return null;

  return (
    <section className="mt-6 rounded-md border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <CreditCard className="size-4 text-muted-foreground" aria-hidden />
        Payment
      </h2>

      <dl className="space-y-1.5 text-sm">
        <Line label="Method" value={order.payment.method.replace(/_/g, ' ')} />
        <Line label="Status" value={order.payment.status} />
        <Line label="Amount" value={formatPrice(order.payment.amount, order.currency)} />
        {order.payment.paidAt ? (
          <Line label="Paid" value={formatDate(order.payment.paidAt)} />
        ) : null}
        {order.payment.transactionId ? (
          <Line label="Reference" value={order.payment.transactionId} />
        ) : null}
      </dl>

      {order.refunds.length > 0 ? (
        <>
          <Separator className="my-4" />
          <h3 className="mb-2 text-sm font-medium">Refunds</h3>
          <ul className="space-y-2">
            {order.refunds.map((refund) => (
              <li key={refund.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-muted-foreground">{refund.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {refund.status === 'COMPLETED'
                      ? `Sent ${formatDate(refund.processedAt ?? refund.createdAt)}`
                      : `${refund.status.toLowerCase()} · raised ${formatDate(refund.createdAt)}`}
                  </p>
                </div>
                <span className="numeric shrink-0 font-medium">
                  {formatPrice(refund.amount, order.currency)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Line({
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
      <dd className={cn('numeric truncate', tone === 'success' && 'text-ok')}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cancellation                                                              */
/* -------------------------------------------------------------------------- */

function CancelDialog({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const cancel = useMutation({
    mutationFn: () =>
      apiFetch<OrderDetail>(`/orders/${order.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['order', order.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      setOpen(false);
      toast.success(
        order.payment?.status === 'COMPLETED'
          ? 'Order cancelled. Your refund is on its way.'
          : 'Order cancelled.',
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'That order could not be cancelled.');
    },
  });

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Cancel order
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription className="text-pretty">
              We will put the items back in stock
              {order.payment?.status === 'COMPLETED'
                ? ' and start a refund to your original payment method.'
                : '.'}{' '}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label htmlFor="cancel-reason" className="text-sm font-medium">
              Why are you cancelling?
            </label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, 500))}
              placeholder="Changed my mind, ordered the wrong size…"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
