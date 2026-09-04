'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RotateCcw, Truck, Workflow } from 'lucide-react';
import { toast } from 'sonner';

import { CARRIERS, ORDER_STATUS_TRANSITIONS, OrderStatus } from '@bazaar/shared';
import type { AdminOrderListItem, OrderDetail } from '@bazaar/shared';
import { formatPrice } from '@bazaar/ui';

import { OrderStatusBadge, STATUS_LABELS } from '@/components/orders/order-status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type Tab = 'status' | 'shipping' | 'refund';

const TABS: Array<{ id: Tab; label: string; icon: typeof Workflow }> = [
  { id: 'status', label: 'Status', icon: Workflow },
  { id: 'shipping', label: 'Shipping', icon: Truck },
  { id: 'refund', label: 'Refund', icon: RotateCcw },
];

/**
 * The three things an operator does to one order, behind one dialog.
 *
 * Each tab posts to its own endpoint rather than to a single "save order"
 * route, because they are genuinely different acts with different
 * consequences - one notifies, one dispatches, one moves money - and an
 * operator should never be able to trigger a refund by editing a tracking
 * number.
 */
export function OrderManageDialog({
  order,
  onClose,
  onChanged,
}: {
  order: AdminOrderListItem | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <Dialog open={Boolean(order)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {order ? (
          // Keyed by order id so every piece of state inside - the open tab, the
          // half-typed note, a tracking number - belongs to the order on screen.
          // An operator who opens one order, types a note, closes and opens the
          // next must not find the previous order's words waiting in the box.
          <ManageBody key={order.id} order={order} onClose={onClose} onChanged={onChanged} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ManageBody({
  order,
  onClose,
  onChanged,
}: {
  order: AdminOrderListItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>('status');

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2">
          <span className="numeric">{order.orderNumber}</span>
          <OrderStatusBadge status={order.status} />
        </DialogTitle>
        <DialogDescription>
          {order.customerName} · {formatPrice(order.total, order.currency)} · {order.itemCount}{' '}
          {order.itemCount === 1 ? 'item' : 'items'}
        </DialogDescription>
      </DialogHeader>

      <div className="bg-muted flex gap-1 rounded-md p-1" role="tablist" aria-label="Order actions">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
              tab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === 'status' ? <StatusTab order={order} onDone={onChanged} onClose={onClose} /> : null}
      {tab === 'shipping' ? (
        <ShippingTab order={order} onDone={onChanged} onClose={onClose} />
      ) : null}
      {tab === 'refund' ? <RefundTab order={order} onDone={onChanged} onClose={onClose} /> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */

interface TabProps {
  order: AdminOrderListItem;
  onDone: () => void;
  onClose: () => void;
}

/** Shared mutation feedback, so all three tabs fail and succeed the same way. */
function useOrderAction(order: AdminOrderListItem, onDone: () => void, onClose: () => void) {
  const queryClient = useQueryClient();

  return {
    onSuccess: (updated: OrderDetail, message: string) => {
      queryClient.setQueryData(['order', order.id], updated);
      onDone();
      onClose();
      toast.success(message);
    },
    onError: (error: unknown, fallback: string) =>
      toast.error(error instanceof ApiError ? error.message : fallback),
  };
}

function StatusTab({ order, onDone, onClose }: TabProps) {
  const feedback = useOrderAction(order, onDone, onClose);

  // REFUNDED is filtered out to match the server, which refuses it: the status
  // is a consequence of money moving, and money moves on the Refund tab.
  const allowed = (ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? []).filter(
    (status) => status !== OrderStatus.REFUNDED,
  );

  const [status, setStatus] = React.useState<string>(allowed[0] ?? '');
  const [note, setNote] = React.useState('');

  const update = useMutation({
    mutationFn: () =>
      apiFetch<OrderDetail>(`/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        body: { status, note: note.trim() || undefined },
      }),
    onSuccess: (updated) =>
      feedback.onSuccess(
        updated,
        `${order.orderNumber} is now ${STATUS_LABELS[status] ?? status}.`,
      ),
    onError: (error) => feedback.onError(error, 'That status change was refused.'),
  });

  if (allowed.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        A {order.status.toLowerCase()} order is final. Nothing left to change here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Move to</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowed.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value] ?? value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="status-note" className="text-sm font-medium">
          Note to the customer
          <span className="text-muted-foreground ml-1 font-normal">(optional)</span>
        </label>
        <Textarea
          id="status-note"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          placeholder="Packed and waiting for the morning pickup…"
          rows={3}
        />
        <p className="text-muted-foreground text-xs">
          This appears on their order timeline and in the email they receive.
        </p>
      </div>

      {status === OrderStatus.CANCELLED ? (
        <p className="border-destructive/40 bg-destructive/10 text-pretty rounded-md border p-3 text-xs">
          Cancelling puts every item back in stock and starts a refund if the order was paid for.
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={!status || update.isPending} onClick={() => update.mutate()}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Update status
        </Button>
      </div>
    </div>
  );
}

function ShippingTab({ order, onDone, onClose }: TabProps) {
  const feedback = useOrderAction(order, onDone, onClose);

  const [carrier, setCarrier] = React.useState(CARRIERS[0]?.id ?? 'NCM');
  const [tracking, setTracking] = React.useState(order.trackingNumber ?? '');
  const [markShipped, setMarkShipped] = React.useState(order.status !== OrderStatus.SHIPPED);
  const [note, setNote] = React.useState('');

  const save = useMutation({
    mutationFn: () =>
      apiFetch<OrderDetail>(`/admin/orders/${order.id}/shipping`, {
        method: 'POST',
        body: {
          trackingNumber: tracking.trim(),
          carrier,
          markShipped,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: (updated) =>
      feedback.onSuccess(updated, `Tracking saved. The customer has been told.`),
    onError: (error) => feedback.onError(error, 'That consignment could not be saved.'),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Courier</span>
        <Select value={carrier} onValueChange={setCarrier}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CARRIERS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tracking-number" className="text-sm font-medium">
          Consignment number
        </label>
        <Input
          id="tracking-number"
          value={tracking}
          onChange={(event) => setTracking(event.target.value.slice(0, 120))}
          placeholder="NCM-4471203"
          className="numeric"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="shipping-note" className="text-sm font-medium">
          Note
          <span className="text-muted-foreground ml-1 font-normal">(optional)</span>
        </label>
        <Textarea
          id="shipping-note"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          placeholder="Left with the Baneshwor hub, out for delivery tomorrow…"
          rows={2}
        />
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <Checkbox
          checked={markShipped}
          onCheckedChange={(checked) => setMarkShipped(checked === true)}
          className="mt-0.5"
        />
        <span>
          Mark this order shipped
          <span className="text-muted-foreground block text-xs">
            Sends the tracking email and SMS. Untick to correct a number without notifying.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={tracking.trim().length < 3 || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save tracking
        </Button>
      </div>
    </div>
  );
}

function RefundTab({ order, onDone, onClose }: TabProps) {
  const feedback = useOrderAction(order, onDone, onClose);

  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [restock, setRestock] = React.useState(true);

  const refund = useMutation({
    mutationFn: () =>
      apiFetch<OrderDetail>(`/admin/orders/${order.id}/refund`, {
        method: 'POST',
        body: {
          // Blank means the whole thing. The server computes that figure from
          // the payment row - it is never sent from here.
          amount: amount.trim() ? Number(amount) : undefined,
          reason: reason.trim(),
          restock,
        },
      }),
    onSuccess: (updated) => feedback.onSuccess(updated, 'Refund sent to the gateway.'),
    onError: (error) => feedback.onError(error, 'The refund was refused.'),
  });

  const parsed = amount.trim() ? Number(amount) : null;
  const invalidAmount = parsed !== null && (Number.isNaN(parsed) || parsed <= 0);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="refund-amount" className="text-sm font-medium">
          Amount
          <span className="text-muted-foreground ml-1 font-normal">
            (leave blank to refund it all)
          </span>
        </label>
        <Input
          id="refund-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={String(order.total)}
          className="numeric"
          aria-invalid={invalidAmount}
        />
        <p className="text-muted-foreground text-xs">
          Order total {formatPrice(order.total, order.currency)}. The server caps this at whatever
          is still refundable.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="refund-reason" className="text-sm font-medium">
          Reason
        </label>
        <Textarea
          id="refund-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 500))}
          placeholder="Item arrived damaged, customer returned it…"
          rows={3}
        />
        <p className="text-muted-foreground text-xs">The customer sees this in their email.</p>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <Checkbox
          checked={restock}
          onCheckedChange={(checked) => setRestock(checked === true)}
          className="mt-0.5"
        />
        <span>
          Put the items back in stock
          <span className="text-muted-foreground block text-xs">
            Untick for a goodwill refund where the customer keeps the goods.
          </span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={reason.trim().length < 3 || invalidAmount || refund.isPending}
          onClick={() => refund.mutate()}
        >
          {refund.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Issue refund
        </Button>
      </div>
    </div>
  );
}
