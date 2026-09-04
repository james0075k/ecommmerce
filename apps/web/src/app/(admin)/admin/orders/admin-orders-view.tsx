'use client';

import * as React from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  PackageSearch,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { ORDER_STATUSES, ORDER_STATUS_TRANSITIONS, OrderStatus } from '@bazaar/shared';
import type { AdminOrderListItem, Paginated } from '@bazaar/shared';
import { EASE_OUT_EXPO, formatDate, formatPrice } from '@bazaar/ui';

import { OrderManageDialog } from '@/components/admin/order-manage-dialog';
import { OrderStatusBadge, STATUS_LABELS } from '@/components/orders/order-status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import { ApiError, apiDownload, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

interface BulkResult {
  updated: number;
  failures: Array<{ orderId: string; orderNumber: string; reason: string }>;
}

/**
 * Order operations.
 *
 * The table is built around the one job an operator actually does here: work a
 * queue. Selection persists per page, the bulk bar only offers statuses that
 * every selected row can legally reach, and the export carries whatever filter
 * is on screen - so what you see is what you get in the spreadsheet.
 */
export function AdminOrdersView() {
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [awaiting, setAwaiting] = React.useState(false);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [managing, setManaging] = React.useState<AdminOrderListItem | null>(null);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (debounced) params.set('search', debounced);
  if (status) params.set('status', status);
  if (awaiting) params.set('awaitingShipment', 'true');
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const queryString = params.toString();

  const { data, isPending, isFetching } = useQuery({
    queryKey: ['admin-orders', queryString],
    queryFn: () => apiFetch<Paginated<AdminOrderListItem>>(`/admin/orders?${queryString}`),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];
  const selectedRows = rows.filter((row) => selected.has(row.id));

  const bulk = useMutation({
    mutationFn: (next: OrderStatus) =>
      apiFetch<BulkResult>('/admin/orders/bulk-status', {
        method: 'PATCH',
        body: { orderIds: [...selected], status: next, note: 'Bulk update.' },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      setSelected(new Set());

      if (result.failures.length === 0) {
        toast.success(`${result.updated} ${result.updated === 1 ? 'order' : 'orders'} updated.`);
        return;
      }

      // Named rather than counted: an operator needs to know *which* rows to go
      // back to, and the reason is usually that they were at the wrong status.
      toast.warning(`${result.updated} updated, ${result.failures.length} skipped`, {
        description: result.failures
          .slice(0, 3)
          .map((failure) => `${failure.orderNumber}: ${failure.reason}`)
          .join('\n'),
      });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'The bulk update failed.'),
  });

  const filtered = Boolean(debounced || status || awaiting || from || to);

  const clear = () => {
    setSearch('');
    setStatus('');
    setAwaiting(false);
    setFrom('');
    setTo('');
    setPage(1);
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const exportCsv = async () => {
    setExporting(true);

    try {
      await apiDownload(
        `/admin/orders/export?${queryString}`,
        `bazaar-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      toast.success('Export downloaded.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not build the export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPending ? 'Loading…' : `${data?.meta.total ?? 0} matching orders`}
          </p>
        </div>

        <Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportCsv()}>
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Export CSV
        </Button>
      </header>

      {/* --- Filters ------------------------------------------------------ */}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order number, customer, email or tracking"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>

        <div className="space-y-1">
          <span className="block text-xs text-muted-foreground">Status</span>
          <Select
            value={status || 'ALL'}
            onValueChange={(value) => {
              setStatus(value === 'ALL' ? '' : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any status</SelectItem>
              {ORDER_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value] ?? value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label htmlFor="admin-orders-from" className="block text-xs text-muted-foreground">
            From
          </label>
          <Input
            id="admin-orders-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => (setFrom(event.target.value), setPage(1))}
            className="w-40"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="admin-orders-to" className="block text-xs text-muted-foreground">
            To
          </label>
          <Input
            id="admin-orders-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => (setTo(event.target.value), setPage(1))}
            className="w-40"
          />
        </div>

        <Button
          variant={awaiting ? 'default' : 'outline'}
          size="sm"
          aria-pressed={awaiting}
          onClick={() => (setAwaiting((current) => !current), setPage(1))}
        >
          <SlidersHorizontal className="size-4" />
          To dispatch
        </Button>

        {filtered ? (
          <Button variant="ghost" size="sm" onClick={clear}>
            <X className="size-4" />
            Clear
          </Button>
        ) : null}
      </div>

      {/* --- Bulk bar ----------------------------------------------------- */}

      <AnimatePresence initial={false}>
        {selectedRows.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
              <span className="text-sm font-medium">
                {selectedRows.length} selected
              </span>

              <BulkStatusSelect
                rows={selectedRows}
                disabled={bulk.isPending}
                onApply={(next) => bulk.mutate(next)}
              />

              {bulk.isPending ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : null}

              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* --- Table -------------------------------------------------------- */}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={rows.length > 0 && selectedRows.length === rows.length}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  aria-label="Select every order on this page"
                />
              </TableHead>
              <TableHead>Order</TableHead>
              <TableHead className="hidden md:table-cell">Customer</TableHead>
              <TableHead className="hidden lg:table-cell">Placed</TableHead>
              <TableHead className="hidden lg:table-cell">Payment</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isPending ? (
              Array.from({ length: 8 }, (_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 8 }, (_, cell) => (
                    <TableCell key={cell}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center">
                  <PackageSearch
                    className="mx-auto mb-3 size-8 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="text-sm text-muted-foreground">
                    {filtered ? 'No orders match those filters.' : 'No orders yet.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((order) => (
                <TableRow
                  key={order.id}
                  className={cn(isFetching && 'opacity-60', selected.has(order.id) && 'bg-muted/40')}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(order.id)}
                      onCheckedChange={(checked) => toggleOne(order.id, checked === true)}
                      aria-label={`Select ${order.orderNumber}`}
                    />
                  </TableCell>

                  <TableCell>
                    <Link
                      href={`/orders/${order.id}`}
                      className="numeric text-sm font-medium hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                      {order.trackingNumber ? ` · ${order.carrierLabel}` : ''}
                    </p>
                  </TableCell>

                  <TableCell className="hidden md:table-cell">
                    <p className="truncate text-sm">{order.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{order.customerEmail}</p>
                  </TableCell>

                  <TableCell className="hidden text-sm whitespace-nowrap lg:table-cell">
                    {formatDate(order.placedAt ?? order.createdAt)}
                  </TableCell>

                  <TableCell className="hidden text-xs lg:table-cell">
                    {order.paymentMethod ? (
                      <>
                        <p>{order.paymentMethod.replace(/_/g, ' ')}</p>
                        <p className="text-muted-foreground">{order.paymentStatus}</p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="numeric text-right text-sm font-medium whitespace-nowrap">
                    {formatPrice(order.total, order.currency)}
                  </TableCell>

                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>

                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setManaging(order)}>
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- Pagination --------------------------------------------------- */}

      {data && data.meta.totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between" aria-label="Order pages">
          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasPrev}
            onClick={() => (setPage((current) => current - 1), setSelected(new Set()))}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>

          <span className="numeric text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasNext}
            onClick={() => (setPage((current) => current + 1), setSelected(new Set()))}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      ) : null}

      <OrderManageDialog
        order={managing}
        onClose={() => setManaging(null)}
        onChanged={() => void queryClient.invalidateQueries({ queryKey: ['admin-orders'] })}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The statuses a whole selection can move to.
 *
 * Intersecting the transitions of every selected row means the operator is
 * never offered a status that would half-apply - which would otherwise be the
 * normal outcome of selecting a page containing both PENDING and SHIPPED rows.
 */
function BulkStatusSelect({
  rows,
  disabled,
  onApply,
}: {
  rows: AdminOrderListItem[];
  disabled: boolean;
  onApply: (status: OrderStatus) => void;
}) {
  const allowed = React.useMemo(() => {
    const sets = rows.map(
      (row) => new Set<string>(ORDER_STATUS_TRANSITIONS[row.status as OrderStatus] ?? []),
    );

    return ORDER_STATUSES.filter(
      // REFUNDED is excluded here as it is on the server: money moves through
      // the refund action, never through a status dropdown.
      (status) => status !== OrderStatus.REFUNDED && sets.every((set) => set.has(status)),
    );
  }, [rows]);

  if (allowed.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        These orders have no status in common that they can all move to.
      </span>
    );
  }

  return (
    <Select
      disabled={disabled}
      value=""
      onValueChange={(value) => onApply(value as OrderStatus)}
    >
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Move all to…" />
      </SelectTrigger>
      <SelectContent>
        {allowed.map((status) => (
          <SelectItem key={status} value={status}>
            {STATUS_LABELS[status] ?? status}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
