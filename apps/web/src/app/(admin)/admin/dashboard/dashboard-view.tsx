'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Clock,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { OrderStatus } from '@bazaar/shared';
import type { DashboardSummary } from '@bazaar/shared';
import { EASE_OUT_EXPO, formatPrice } from '@bazaar/ui';

import { AnimatedNumber } from '@/components/admin/animated-number';
import { StatCard, StatCardSkeleton } from '@/components/admin/stat-card';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, adminKeys, formatDateTime } from '@/lib/admin';
import { cn } from '@/lib/utils';

/**
 * Recharts is the single largest dependency the admin panel has. The dashboard
 * shows one chart below four stat cards, so it is split out (Phase 11) and the
 * cards paint without waiting for it.
 */
const RevenueChart = dynamic(
  () => import('@/components/admin/charts').then((mod) => mod.RevenueChart),
  { ssr: false, loading: () => <Skeleton className="h-[320px] w-full rounded-md" /> },
);

/** The worklist cards. Terminal statuses are not here - they are not work. */
const QUEUE_CARDS = [
  { status: OrderStatus.PENDING, label: 'Pending', icon: Clock, tone: 'warning' },
  { status: OrderStatus.CONFIRMED, label: 'Confirmed', icon: PackageCheck, tone: 'primary' },
  { status: OrderStatus.PROCESSING, label: 'Processing', icon: RefreshCw, tone: 'primary' },
  { status: OrderStatus.SHIPPED, label: 'Shipped', icon: Truck, tone: 'success' },
] as const;

/**
 * The dashboard.
 *
 * One request rather than nine. The panels here are not independently useful -
 * an operator reads revenue against order count against what is in the queue,
 * and nine requests settling at nine different moments makes the page assemble
 * itself in front of them. It also means the figures are all from the same
 * instant, which matters when two of them are meant to reconcile.
 */
export function AdminDashboardView() {
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: adminApi.dashboard,
    // The dashboard is a glance, not a live feed. A minute is fresh enough for
    // a figure nobody acts on within the minute.
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `Everything as of ${formatDateTime(data.generatedAt)}.`
              : 'How the store is doing right now.'}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn('size-4', isRefetching && 'animate-spin')} aria-hidden />
          Refresh
        </Button>
      </header>

      {isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium">The dashboard could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The API may be down, or the database unreachable.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      <RevenueCards data={data} loading={isLoading} />
      <QueueCards data={data} loading={isLoading} />

      <section className="rounded-lg border border-border bg-card p-4 shadow-card sm:p-5">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold">Revenue</h2>
            <p className="text-xs text-muted-foreground">
              The last 30 days. Hover any day for the exact figures.
            </p>
          </div>
          <Link
            href="/admin/analytics"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Full analytics
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </header>

        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <RevenueChart data={data?.series ?? []} />
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <TopProducts data={data} loading={isLoading} />
        <TopCustomers data={data} loading={isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <RecentOrders data={data} loading={isLoading} />
        <LowStock data={data} loading={isLoading} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface PanelProps {
  data: DashboardSummary | undefined;
  loading: boolean;
}

function RevenueCards({ data, loading }: PanelProps) {
  if (loading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <StatCardSkeleton key={n} />
        ))}
      </div>
    );
  }

  const money = (value: number) => formatPrice(value, data.revenue.currency);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        index={0}
        label="Today"
        value={data.revenue.today.current}
        format={money}
        delta={data.revenue.today}
        caption="vs yesterday"
        icon={Banknote}
      />
      <StatCard
        index={1}
        label="Last 7 days"
        value={data.revenue.week.current}
        format={money}
        delta={data.revenue.week}
        caption="vs the 7 before"
        icon={Wallet}
      />
      <StatCard
        index={2}
        label="Last 30 days"
        value={data.revenue.month.current}
        format={money}
        delta={data.revenue.month}
        caption="vs the 30 before"
        icon={ShoppingBag}
      />
      <StatCard
        index={3}
        label="All time"
        value={data.revenue.total}
        format={money}
        caption={`${data.orders.total.toLocaleString('en-NP')} orders total`}
        icon={Users}
      />
    </div>
  );
}

function QueueCards({ data, loading }: PanelProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {QUEUE_CARDS.map((card, index) => {
        const Icon = card.icon;
        const count = data?.orders[card.status] ?? 0;

        return (
          <motion.div
            key={card.status}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT_EXPO, delay: 0.2 + index * 0.05 }}
          >
            <Link
              href={`/admin/orders?status=${card.status}`}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/50"
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-md',
                  card.tone === 'warning' && 'bg-warning/10 text-caution',
                  card.tone === 'primary' && 'bg-accent text-accent-foreground',
                  card.tone === 'success' && 'bg-success/10 text-ok',
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>

              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {card.label}
                </p>
                <p className="numeric text-2xl font-bold tabular-nums">
                  {loading ? (
                    <Skeleton className="mt-1 h-7 w-12" />
                  ) : (
                    <AnimatedNumber value={count} />
                  )}
                </p>
              </div>

              <ArrowRight
                className="ml-auto size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

function Panel({
  title,
  description,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-card shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {hrefLabel ?? 'See all'}
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        ) : null}
      </header>

      <div className="flex-1">{children}</div>
    </section>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{message}</p>;
}

function RowSkeletons({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }, (_, n) => (
        <Skeleton key={n} className="h-10 w-full" />
      ))}
    </div>
  );
}

function TopProducts({ data, loading }: PanelProps) {
  return (
    <Panel
      title="Top products"
      description="By revenue over the last 30 days."
      href="/admin/analytics"
      hrefLabel="Product performance"
    >
      {loading ? (
        <RowSkeletons />
      ) : !data?.topProducts.length ? (
        <EmptyRow message="No sales in the last 30 days." />
      ) : (
        <ul className="divide-y divide-border">
          {data.topProducts.map((product, index) => (
            <li key={product.productId} className="flex items-center gap-3 px-4 py-3">
              <span className="numeric w-4 shrink-0 text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>

              <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt=""
                    fill
                    sizes="40px"
                    className="object-cover"
                  />
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <Link
                  href={`/products/${product.slug}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {product.name}
                </Link>
                <span className="numeric block truncate text-xs text-muted-foreground">
                  {product.sku} · {product.unitsSold} sold
                </span>
              </span>

              <span className="numeric shrink-0 text-sm font-semibold tabular-nums">
                {formatPrice(product.revenue)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TopCustomers({ data, loading }: PanelProps) {
  return (
    <Panel
      title="Top customers"
      description="By lifetime value, all time."
      href="/admin/customers?sort=ltv_high"
    >
      {loading ? (
        <RowSkeletons />
      ) : !data?.topCustomers.length ? (
        <EmptyRow message="No customers have ordered yet." />
      ) : (
        <ul className="divide-y divide-border">
          {data.topCustomers.map((customer, index) => (
            <li key={customer.userId} className="flex items-center gap-3 px-4 py-3">
              <span className="numeric w-4 shrink-0 text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>

              <Avatar className="size-9 shrink-0">
                {customer.avatarUrl ? <AvatarImage src={customer.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[11px] font-semibold">
                  {customer.fullName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase() ?? '')
                    .join('')}
                </AvatarFallback>
              </Avatar>

              <span className="min-w-0 flex-1">
                <Link
                  href={`/admin/customers/${customer.userId}`}
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {customer.fullName}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {customer.orderCount} order{customer.orderCount === 1 ? '' : 's'} ·{' '}
                  {customer.email}
                </span>
              </span>

              <span className="numeric shrink-0 text-sm font-semibold tabular-nums">
                {formatPrice(customer.lifetimeValue)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentOrders({ data, loading }: PanelProps) {
  return (
    <Panel title="Recent orders" description="The last ten, newest first." href="/admin/orders">
      {loading ? (
        <RowSkeletons rows={8} />
      ) : !data?.recentOrders.length ? (
        <EmptyRow message="No orders yet." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders?search=${encodeURIComponent(order.orderNumber)}`}
                      className="numeric text-xs font-medium hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {formatDateTime(order.placedAt)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span className="block max-w-[14ch] truncate text-sm sm:max-w-none">
                      {order.customerName}
                    </span>
                    <span className="block max-w-[18ch] truncate text-[11px] text-muted-foreground sm:max-w-none">
                      {order.customerEmail ?? 'Guest checkout'}
                    </span>
                  </TableCell>

                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>

                  <TableCell className="numeric text-right text-sm font-medium tabular-nums">
                    {formatPrice(order.total, order.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

function LowStock({ data, loading }: PanelProps) {
  const rows = data?.lowStock ?? [];

  return (
    <Panel
      title="Low stock"
      description="Variants at or below their reorder level."
      href="/admin/products"
      hrefLabel="Manage products"
    >
      {loading ? (
        <RowSkeletons rows={4} />
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <PackageCheck className="mx-auto size-6 text-ok" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">Everything is comfortably in stock.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const available = row.quantity - row.reserved;
            const critical = available <= 3;

            return (
              <li key={row.variantId} className="flex items-center gap-3 px-4 py-3">
                <AlertTriangle
                  className={cn('size-4 shrink-0', critical ? 'text-destructive' : 'text-caution')}
                  aria-hidden
                />

                <span className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${row.productId}/edit`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {row.productName}
                  </Link>
                  <span className="numeric block truncate text-xs text-muted-foreground">
                    {row.variantName} · {row.sku}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span
                    className={cn(
                      'numeric block text-sm font-bold tabular-nums',
                      critical ? 'text-destructive' : 'text-caution',
                    )}
                  >
                    {available}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {row.reserved > 0 ? `${row.reserved} held` : `of ${row.reorderLevel}`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
