'use client';

import * as React from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Ticket,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { COUPON_STATES, CouponType } from '@bazaar/shared';
import type { AdminCouponListItem, CouponLifecycle, CouponUsageEntry } from '@bazaar/shared';
import { formatDate, formatPrice } from '@bazaar/ui';

import { CouponFormDialog } from '@/components/admin/coupon-form-dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, adminKeys, formatDateTime, toQueryString } from '@/lib/admin';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATE_LABELS: Record<(typeof COUPON_STATES)[number], string> = {
  all: 'All',
  active: 'Active',
  scheduled: 'Scheduled',
  expired: 'Expired',
  exhausted: 'Limited',
};

const LIFECYCLE_STYLES: Record<CouponLifecycle, string> = {
  ACTIVE: 'bg-success/10 text-ok',
  SCHEDULED: 'bg-accent text-accent-foreground',
  EXPIRED: 'bg-muted text-muted-foreground',
  EXHAUSTED: 'bg-warning/10 text-caution',
  DISABLED: 'bg-destructive/10 text-destructive',
};

const LIFECYCLE_LABELS: Record<CouponLifecycle, string> = {
  ACTIVE: 'Active',
  SCHEDULED: 'Scheduled',
  EXPIRED: 'Expired',
  EXHAUSTED: 'Used up',
  DISABLED: 'Disabled',
};

/**
 * Coupons.
 *
 * The lifecycle badge is derived rather than stored, and it is the column an
 * operator actually reads: "is active" alone cannot distinguish a code that has
 * not started from one that has expired from one that has been redeemed to its
 * limit, and all three look identical to a shopper who is being told it does
 * not work.
 */
export function AdminCouponsView() {
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [state, setState] = React.useState<(typeof COUPON_STATES)[number]>('all');
  const [page, setPage] = React.useState(1);

  const [editing, setEditing] = React.useState<AdminCouponListItem | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminCouponListItem | null>(null);
  const [usageOf, setUsageOf] = React.useState<AdminCouponListItem | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const query = toQueryString({
    page,
    limit: PAGE_SIZE,
    state,
    search: debounced || undefined,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: adminKeys.coupons.list({ query } as never),
    queryFn: () => adminApi.coupons(query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean; deactivated: boolean }>(`/admin/coupons/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.coupons.all });

      // The API disables rather than deletes a coupon that has been redeemed,
      // so the toast says what actually happened instead of "deleted".
      if (result.deleted) {
        toast.success(`${deleting?.code} deleted.`);
      } else {
        toast.success(
          `${deleting?.code} has been redeemed before, so it was disabled rather than deleted.`,
        );
      }

      setDeleting(null);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'The coupon could not be removed.');
    },
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (coupon: AdminCouponListItem) => {
    setEditing(coupon);
    setFormOpen(true);
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`${code} copied.`);
    } catch {
      toast.error('Your browser would not let us copy that.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Coupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta
              ? `${meta.total.toLocaleString('en-NP')} code${meta.total === 1 ? '' : 's'}.`
              : 'Discount codes shoppers enter at checkout.'}
          </p>
        </div>

        <Button onClick={openNew} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          New coupon
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by code"
            aria-label="Search coupons"
            className="numeric pl-8 uppercase"
          />
        </div>

        <div
          role="group"
          aria-label="Filter by state"
          className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-card p-1"
        >
          {COUPON_STATES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setState(value);
                setPage(1);
              }}
              aria-pressed={state === value}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                state === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {STATE_LABELS[value]}
            </button>
          ))}
        </div>

        {search ? (
          <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="gap-1">
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          'overflow-x-auto rounded-lg border border-border bg-card shadow-card transition-opacity',
          isFetching && !isLoading && 'opacity-60',
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead className="hidden lg:table-cell">Window</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Revenue</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 7 }, (_, column) => (
                    <TableCell key={column}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="py-12 text-center">
                    <Ticket className="mx-auto size-6 text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-sm font-medium">No coupons here.</p>
                    <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openNew}>
                      <Plus className="size-4" aria-hidden />
                      Create the first one
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="numeric text-sm font-semibold">{coupon.code}</span>
                      <button
                        type="button"
                        onClick={() => void copyCode(coupon.code)}
                        aria-label={`Copy ${coupon.code}`}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="size-3" aria-hidden />
                      </button>
                    </div>
                    <span className="block text-xs text-muted-foreground lg:hidden">
                      until {formatDate(coupon.validUntil)}
                    </span>
                  </TableCell>

                  <TableCell className="text-sm">
                    {describeDiscount(coupon)}
                    {coupon.minOrderAmount ? (
                      <span className="block text-xs text-muted-foreground">
                        over {formatPrice(coupon.minOrderAmount)}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {formatDate(coupon.validFrom)} — {formatDate(coupon.validUntil)}
                  </TableCell>

                  <TableCell className="numeric text-right tabular-nums">
                    <button
                      type="button"
                      onClick={() => setUsageOf(coupon)}
                      className="hover:underline"
                      aria-label={`See who used ${coupon.code}`}
                    >
                      {coupon.usedCount}
                      {coupon.usageLimit !== null ? (
                        <span className="text-muted-foreground">/{coupon.usageLimit}</span>
                      ) : null}
                    </button>
                  </TableCell>

                  <TableCell className="numeric hidden text-right tabular-nums xl:table-cell">
                    {coupon.revenueInfluenced > 0 ? formatPrice(coupon.revenueInfluenced) : '—'}
                  </TableCell>

                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        LIFECYCLE_STYLES[coupon.lifecycle],
                      )}
                    >
                      {LIFECYCLE_LABELS[coupon.lifecycle]}
                    </span>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(coupon)}
                        aria-label={`Edit ${coupon.code}`}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(coupon)}
                        aria-label={`Delete ${coupon.code}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasPrev}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="gap-1"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!meta.hasNext}
              onClick={() => setPage((current) => current + 1)}
              className="gap-1"
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <CouponFormDialog coupon={editing} open={formOpen} onOpenChange={setFormOpen} />

      <UsageDialog coupon={usageOf} onClose={() => setUsageOf(null)} />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {deleting?.code}?</DialogTitle>
            <DialogDescription>
              {deleting && deleting.usedCount > 0
                ? `This code has been redeemed ${deleting.usedCount} time${
                    deleting.usedCount === 1 ? '' : 's'
                  }, so it will be disabled rather than deleted — the orders that used it need it to stay.`
                : 'This code has never been redeemed, so it will be deleted outright.'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && remove.mutate(deleting.id)}
              disabled={remove.isPending}
              className="gap-1.5"
            >
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              {deleting && deleting.usedCount > 0 ? 'Disable it' : 'Delete it'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function describeDiscount(coupon: AdminCouponListItem): string {
  if (coupon.type === CouponType.FREE_SHIPPING) return 'Free shipping';
  if (coupon.type === CouponType.PERCENTAGE) {
    return coupon.maxDiscountAmount
      ? `${coupon.value}% off, up to ${formatPrice(coupon.maxDiscountAmount)}`
      : `${coupon.value}% off`;
  }
  return `${formatPrice(coupon.value)} off`;
}

/** Who redeemed a code, and on which order. */
function UsageDialog({
  coupon,
  onClose,
}: {
  coupon: AdminCouponListItem | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: adminKeys.coupons.detail(coupon?.id ?? ''),
    queryFn: () => adminApi.coupon(coupon!.id),
    enabled: coupon !== null,
    staleTime: 30_000,
  });

  const usages: CouponUsageEntry[] = data?.usages ?? [];

  return (
    <Dialog open={coupon !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="numeric">{coupon?.code}</DialogTitle>
          <DialogDescription>
            {coupon
              ? `Redeemed ${coupon.usedCount} time${coupon.usedCount === 1 ? '' : 's'} by ${
                  coupon.uniqueUsers
                } customer${coupon.uniqueUsers === 1 ? '' : 's'}, carrying ${formatPrice(
                  coupon.revenueInfluenced,
                )} of orders.`
              : null}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-10 w-full" />
            ))}
          </div>
        ) : usages.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">Nobody has used this code yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Order total</TableHead>
                <TableHead className="text-right">Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usages.map((usage) => (
                <TableRow key={usage.id}>
                  <TableCell>
                    <span className="block text-sm">{usage.userName ?? 'Guest'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {usage.userEmail ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="numeric text-xs">{usage.orderNumber ?? '—'}</TableCell>
                  <TableCell className="numeric text-right tabular-nums">
                    {usage.orderTotal !== null ? formatPrice(usage.orderTotal) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDateTime(usage.usedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
