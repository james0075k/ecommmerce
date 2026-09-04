'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { AccountStatus } from '@bazaar/shared';
import type { AdminCustomerDetail, CustomerMessageInput } from '@bazaar/shared';
import { formatDate, formatPrice } from '@bazaar/ui';

import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { adminApi, adminKeys, formatDateTime } from '@/lib/admin';
import { ApiError, apiFetch } from '@/lib/api';
import { AccountStatusBadge, initialsOf, STATUS_LABELS } from '../customers-view';

/**
 * One customer, everything about them.
 *
 * Laid out as a summary plus tabs rather than one long page: the figures at the
 * top are what an operator on a support call needs in the first three seconds,
 * and the history behind them is what they need only if the call goes further.
 */
export function AdminCustomerDetailView({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient();
  const [messageOpen, setMessageOpen] = React.useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: adminKeys.customers.detail(customerId),
    queryFn: () => adminApi.customer(customerId),
    staleTime: 30_000,
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      apiFetch<AdminCustomerDetail>(`/admin/customers/${customerId}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(adminKeys.customers.detail(customerId), updated);
      void queryClient.invalidateQueries({ queryKey: adminKeys.customers.all });
      toast.success(`Account set to ${STATUS_LABELS[updated.status] ?? updated.status}.`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The status could not be changed.');
    },
  });

  if (isError) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <ShieldAlert className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-3 font-display text-lg font-semibold">Customer not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          They may have deleted their account.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/admin/customers">Back to customers</Link>
        </Button>
      </div>
    );
  }

  if (isLoading || !data) return <DetailSkeleton />;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <Link
        href="/admin/customers"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All customers
      </Link>

      {/* --- Identity ------------------------------------------------------ */}
      <header className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-card p-4 shadow-card sm:p-5">
        <Avatar className="size-14 shrink-0">
          {data.avatarUrl ? <AvatarImage src={data.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-base font-semibold">
            {initialsOf(data.fullName)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              {data.fullName}
            </h1>
            <AccountStatusBadge status={data.status} />
            {data.role !== 'CUSTOMER' ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent-foreground uppercase">
                {data.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
              </span>
            ) : null}
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Mail className="size-3.5" aria-hidden />
              <dd>{data.email}</dd>
              {data.emailVerified ? (
                <CheckCircle2 className="size-3.5 text-ok" aria-label="Verified" />
              ) : null}
            </div>

            {data.phone ? (
              <div className="flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden />
                <dd className="numeric">{data.phone}</dd>
                {data.phoneVerified ? (
                  <CheckCircle2 className="size-3.5 text-ok" aria-label="Verified" />
                ) : null}
              </div>
            ) : null}

            <div>
              <dt className="sr-only">Joined</dt>
              <dd>Joined {formatDate(data.createdAt)}</dd>
            </div>

            {data.lastLoginAt ? (
              <div>
                <dt className="sr-only">Last seen</dt>
                <dd>Last seen {formatDate(data.lastLoginAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMessageOpen(true)} className="gap-1.5">
            <Send className="size-4" aria-hidden />
            Message
          </Button>

          {/* A super admin cannot be changed from the panel at all - the API
              refuses it - so the control is not offered either. */}
          {data.role !== 'SUPER_ADMIN' ? (
            <Select
              value={data.status}
              onValueChange={(value) => setStatus.mutate(value)}
              disabled={setStatus.isPending}
            >
              <SelectTrigger className="w-[10.5rem]" aria-label="Account status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(AccountStatus).map((value) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      {value === 'ACTIVE' ? (
                        <CheckCircle2 className="size-3.5 text-ok" aria-hidden />
                      ) : (
                        <Ban className="size-3.5 text-destructive" aria-hidden />
                      )}
                      {STATUS_LABELS[value]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </header>

      {/* --- Figures ------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Lifetime value" value={formatPrice(data.lifetimeValue)} />
        <Figure label="Orders" value={String(data.orderCount)} />
        <Figure label="Average order" value={formatPrice(data.averageOrderValue)} />
        <Figure
          label="Refunded"
          value={formatPrice(data.totalRefunded)}
          tone={data.totalRefunded > 0 ? 'warning' : undefined}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Reviews written" value={String(data.reviewCount)} />
        <Figure label="On the wishlist" value={String(data.wishlistCount)} />
        <Figure label="In the cart" value={String(data.cartItemCount)} />
        <Figure label="Coupons used" value={String(data.couponsUsed)} />
      </div>

      {/* --- History ------------------------------------------------------- */}
      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Orders ({data.orders.length})</TabsTrigger>
          <TabsTrigger value="addresses">Addresses ({data.addresses.length})</TabsTrigger>
          <TabsTrigger value="communications">
            Communication ({data.communications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
            {data.orders.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                This customer has not ordered yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Placed</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/admin/orders?search=${encodeURIComponent(order.orderNumber)}`}
                          className="numeric text-xs font-medium hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(order.placedAt)}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {order.itemCount}
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="numeric text-right font-medium tabular-nums">
                        {formatPrice(order.total, order.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="addresses">
          {data.addresses.length === 0 ? (
            <p className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground shadow-card">
              No saved addresses.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.addresses.map((address) => (
                <div
                  key={address.id}
                  className="rounded-lg border border-border bg-card p-4 shadow-card"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <MapPin className="size-4 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-semibold">{address.label}</span>
                    {address.isDefault ? (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent-foreground uppercase">
                        Default
                      </span>
                    ) : null}
                  </div>

                  <address className="text-sm text-muted-foreground not-italic">
                    <span className="block font-medium text-foreground">{address.fullName}</span>
                    <span className="numeric block">{address.phone}</span>
                    <span className="block">{address.street}</span>
                    <span className="block">
                      {address.city}, {address.district}
                    </span>
                    <span className="block">
                      {address.province} · {address.country}
                    </span>
                  </address>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="communications">
          <div className="rounded-lg border border-border bg-card shadow-card">
            {data.communications.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nothing has been sent to or received from this customer.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.communications.map((entry) => (
                  <li key={`${entry.channel}-${entry.id}`} className="flex gap-3 px-4 py-3">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {entry.channel === 'CONTACT' ? (
                        <MessageSquare className="size-4" aria-hidden />
                      ) : (
                        <Mail className="size-4" aria-hidden />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <span className="text-[11px] text-muted-foreground">
                          {entry.channel === 'CONTACT' ? 'From customer' : 'Sent to customer'} ·{' '}
                          {entry.status}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground">
                        {entry.body}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <MessageDialog
        customerId={customerId}
        customerName={data.fullName}
        open={messageOpen}
        onOpenChange={setMessageOpen}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning';
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={`numeric mt-1.5 text-xl font-bold tabular-nums ${
          tone === 'warning' ? 'text-caution' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function MessageDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
}: {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = React.useState<CustomerMessageInput['channel']>('NOTIFICATION');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');

  const send = useMutation({
    mutationFn: () =>
      apiFetch<{ delivered: boolean; channel: string }>(`/admin/customers/${customerId}/message`, {
        method: 'POST',
        body: { channel, subject, body },
      }),
    onSuccess: (result) => {
      // The message is filed either way; the toast says which happened rather
      // than claiming a delivery that the mail provider may have refused.
      if (result.delivered) {
        toast.success('Message sent.');
      } else {
        toast.warning('Saved to their notifications, but the email did not go out.');
      }

      void queryClient.invalidateQueries({ queryKey: adminKeys.customers.detail(customerId) });
      onOpenChange(false);
      setSubject('');
      setBody('');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The message could not be sent.');
    },
  });

  const valid = subject.trim().length >= 3 && body.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Message {customerName}</DialogTitle>
          <DialogDescription>
            A notification always appears in their account. Choose email to send one as well.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="message-channel">Channel</Label>
            <Select
              value={channel}
              onValueChange={(value) => setChannel(value as CustomerMessageInput['channel'])}
            >
              <SelectTrigger id="message-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NOTIFICATION">In-account notification only</SelectItem>
                <SelectItem value="EMAIL">Notification and email</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message-subject">Subject</Label>
            <Input
              id="message-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={160}
              placeholder="About your recent order"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message-body">Message</Label>
            <Textarea
              id="message-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={1000}
              rows={6}
              placeholder="Write the message you want them to read."
            />
            <p className="text-right text-xs text-muted-foreground">{body.length}/1000</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => send.mutate()} disabled={!valid || send.isPending} className="gap-1.5">
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
