'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  Truck,
  X,
} from 'lucide-react';

import { ORDER_STATUSES } from '@bazaar/shared/constants';
import type { OrderListItem, Paginated } from '@bazaar/shared';
import { EASE_OUT_EXPO, formatDate, formatPrice } from '@bazaar/ui';

import { OrderStatusBadge, STATUS_LABELS } from '@/components/orders/order-status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;

/**
 * Order history.
 *
 * The row expands in place instead of linking straight through, because the
 * question a shopper opens this page with is usually "which order was the blue
 * one" - answerable from the lines they already paid for on this request, with
 * no navigation and nothing more to load. The detail page is for the timeline,
 * the invoice and cancelling.
 */
export function OrdersView() {
  const [status, setStatus] = React.useState<string>('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (status) query.set('status', status);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (debounced) query.set('search', debounced);

  const { data, isPending, isFetching } = useQuery({
    queryKey: ['orders', status, from, to, debounced, page],
    queryFn: () => apiFetch<Paginated<OrderListItem>>(`/orders?${query.toString()}`),
    // Keeps the previous page on screen while the next one loads, so paging
    // does not collapse the list to skeletons and back.
    placeholderData: keepPreviousData,
  });

  const filtered = Boolean(status || from || to || debounced);

  const clear = () => {
    setStatus('');
    setFrom('');
    setTo('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="container-bazaar max-w-3xl py-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Your orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPending
            ? 'Loading…'
            : `${data?.meta.total ?? 0} ${data?.meta.total === 1 ? 'order' : 'orders'}${
                filtered ? ' matching your filters' : ''
              }`}
        </p>
      </header>

      {/* --- Filters ------------------------------------------------------ */}

      <div className="mb-5 space-y-3">
        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Filter by status"
        >
          <FilterPill active={!status} onClick={() => (setStatus(''), setPage(1))}>
            All
          </FilterPill>

          {ORDER_STATUSES.map((value) => (
            <FilterPill
              key={value}
              active={status === value}
              onClick={() => (setStatus(value), setPage(1))}
            >
              {STATUS_LABELS[value] ?? value}
            </FilterPill>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-48 flex-1">
            <Search
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order number"
              className="pl-9"
              aria-label="Search by order number"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="orders-from" className="text-xs text-muted-foreground">
              From
            </label>
            <Input
              id="orders-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => (setFrom(event.target.value), setPage(1))}
              className="w-40"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="orders-to" className="text-xs text-muted-foreground">
              To
            </label>
            <Input
              id="orders-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => (setTo(event.target.value), setPage(1))}
              className="w-40"
            />
          </div>

          {filtered ? (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {/* --- List --------------------------------------------------------- */}

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-md" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <ul className={cn('space-y-3 transition-opacity', isFetching && 'opacity-60')}>
          {data.items.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
      ) : (
        <EmptyState filtered={filtered} onClear={clear} />
      )}

      {/* --- Pagination --------------------------------------------------- */}

      {data && data.meta.totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between" aria-label="Order history pages">
          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasPrev}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft className="size-4" />
            Newer
          </Button>

          <span className="numeric text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={!data.meta.hasNext}
            onClick={() => setPage((current) => current + 1)}
          >
            Older
            <ChevronRight className="size-4" />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

function OrderRow({ order }: { order: OrderListItem }) {
  const [open, setOpen] = React.useState(false);

  return (
    <li className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex -space-x-2" aria-hidden>
          {order.thumbnails.length > 0 ? (
            order.thumbnails.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="relative size-11 overflow-hidden rounded-md border-2 border-card bg-muted"
              >
                <Image src={url} alt="" fill sizes="44px" className="object-cover" />
              </div>
            ))
          ) : (
            <div className="grid size-11 place-items-center rounded-md border border-border bg-muted">
              <Package className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/orders/${order.id}`}
              className="numeric font-display text-sm font-bold tracking-tight hover:underline"
            >
              {order.orderNumber}
            </Link>
            <OrderStatusBadge status={order.status} />
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(order.placedAt ?? order.createdAt)} · {order.itemCount}{' '}
            {order.itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>

        <p className="numeric font-display text-base font-bold">
          {formatPrice(order.total, order.currency)}
        </p>

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? `Hide items in ${order.orderNumber}` : `Show items in ${order.orderNumber}`}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown
            className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="quick-view"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 pt-3 pb-4">
              <ul className="divide-y divide-border">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
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
                    <span className="numeric shrink-0 text-sm">
                      {formatPrice(item.totalPrice, order.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/orders/${order.id}`}>View details</Link>
                </Button>

                {order.trackingUrl ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={order.trackingUrl} target="_blank" rel="noreferrer">
                      <Truck className="size-4" />
                      Track with {order.carrierLabel}
                    </a>
                  </Button>
                ) : order.trackingNumber ? (
                  <span className="numeric text-xs text-muted-foreground">
                    {order.carrierLabel} · {order.trackingNumber}
                  </span>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border py-16 text-center">
      <Package className="size-8 text-muted-foreground" aria-hidden />

      <div>
        <p className="font-medium">{filtered ? 'Nothing matches those filters' : 'No orders yet'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtered
            ? 'Try widening the date range or clearing the status.'
            : 'Everything you buy will show up here.'}
        </p>
      </div>

      {filtered ? (
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        <Button asChild>
          <Link href="/products">Start shopping</Link>
        </Button>
      )}
    </div>
  );
}
