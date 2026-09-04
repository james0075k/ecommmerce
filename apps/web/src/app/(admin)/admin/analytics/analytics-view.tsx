'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Download,
  Eye,
  Loader2,
  Percent,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { ANALYTICS_EXPORTS } from '@bazaar/shared';
import type { AnalyticsExport } from '@bazaar/shared';
import { formatPrice } from '@bazaar/ui';

import { DateRangePicker } from '@/components/admin/date-range-picker';
import { StatCard, StatCardSkeleton } from '@/components/admin/stat-card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminApi, adminKeys, formatPercent, rangeQuery, type RangeParams } from '@/lib/admin';
import { ApiError, apiDownload } from '@/lib/api';

/**
 * Leaflet touches `window` at module scope, so the map cannot be server
 * rendered at all - and it is a heavy dependency for a panel below the fold.
 * Loading it on demand keeps it out of the initial bundle for the two thirds
 * of visits that never scroll to it.
 */
const GeoMap = dynamic(() => import('@/components/admin/geo-map').then((mod) => mod.GeoMap), {
  ssr: false,
  loading: () => <Skeleton className="h-[420px] w-full rounded-md" />,
});

/**
 * Recharts is ~90KB gzipped and, like the map, is below the fold behind a date
 * range that has to resolve before there is anything to plot. Splitting it out
 * (Phase 11) lets the stat row above paint while the chart code is still on the
 * wire, and keeps it out of every other admin route's shared chunk.
 *
 * The skeletons are the exact heights of the charts they replace, so the page
 * does not jump when they land.
 */
const RevenueChart = dynamic(
  () => import('@/components/admin/charts').then((mod) => mod.RevenueChart),
  { ssr: false, loading: () => <Skeleton className="h-[320px] w-full rounded-md" /> },
);

const ConversionChart = dynamic(
  () => import('@/components/admin/charts').then((mod) => mod.ConversionChart),
  { ssr: false, loading: () => <Skeleton className="h-[320px] w-full rounded-md" /> },
);

const TrafficPieChart = dynamic(
  () => import('@/components/admin/charts').then((mod) => mod.TrafficPieChart),
  { ssr: false, loading: () => <Skeleton className="h-[320px] w-full rounded-md" /> },
);

const EXPORT_LABELS: Record<AnalyticsExport, string> = {
  overview: 'Revenue & conversion',
  products: 'Product performance',
  traffic: 'Traffic sources',
  geography: 'Geography',
};

/**
 * The analytics page.
 *
 * Panels fetch independently here, unlike the dashboard, because they are read
 * independently: an operator studying the product table has no reason to wait
 * on a map they are not looking at, and each panel is a different shape of
 * query. `keepPreviousData` means changing the range dims the existing figures
 * rather than replacing them with skeletons - the comparison an operator is
 * making stays on screen while the new numbers arrive.
 */
export function AdminAnalyticsView() {
  const [range, setRange] = React.useState<RangeParams>({ preset: '30d' });
  const [exporting, setExporting] = React.useState<AnalyticsExport | null>(null);

  const overview = useQuery({
    queryKey: adminKeys.analytics.overview(range),
    queryFn: () => adminApi.analyticsOverview(range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const products = useQuery({
    queryKey: adminKeys.analytics.products(range),
    queryFn: () => adminApi.analyticsProducts(range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const traffic = useQuery({
    queryKey: adminKeys.analytics.traffic(range),
    queryFn: () => adminApi.analyticsTraffic(range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const geography = useQuery({
    queryKey: adminKeys.analytics.geography(range),
    queryFn: () => adminApi.analyticsGeography(range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const totals = overview.data?.totals;
  const previous = overview.data?.previous;

  const download = async (report: AnalyticsExport) => {
    setExporting(report);

    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await apiDownload(
        `/admin/analytics/export?${rangeQuery(range)}&report=${report}`,
        `bazaar-${report}-${stamp}.csv`,
      );
      toast.success(`${EXPORT_LABELS[report]} exported.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The export failed.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue, conversion and where your customers are.
          </p>
        </div>

        <DateRangePicker value={range} onChange={setRange} />
      </header>

      {/* --- Totals -------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!totals || !previous ? (
          [0, 1, 2, 3].map((n) => <StatCardSkeleton key={n} />)
        ) : (
          <>
            <StatCard
              index={0}
              label="Revenue"
              value={totals.revenue}
              format={(value) => formatPrice(value, overview.data?.currency ?? 'NPR')}
              delta={delta(totals.revenue, previous.revenue)}
              caption="vs the period before"
              icon={Banknote}
            />
            <StatCard
              index={1}
              label="Orders"
              value={totals.orders}
              delta={delta(totals.orders, previous.orders)}
              caption={`${totals.unitsSold.toLocaleString('en-NP')} units`}
              icon={ReceiptText}
            />
            <StatCard
              index={2}
              label="Visitors"
              value={totals.visitors}
              delta={delta(totals.visitors, previous.visitors)}
              caption="unique sessions"
              icon={Eye}
            />
            <StatCard
              index={3}
              label="Conversion"
              value={totals.conversionRate}
              format={(value) => formatPercent(value, 2)}
              delta={delta(totals.conversionRate, previous.conversionRate)}
              caption="orders per session"
              icon={Percent}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!totals || !previous ? (
          [0, 1, 2].map((n) => <StatCardSkeleton key={n} />)
        ) : (
          <>
            <StatCard
              index={0}
              label="Average order"
              value={totals.averageOrderValue}
              format={(value) => formatPrice(value)}
              delta={delta(totals.averageOrderValue, previous.averageOrderValue)}
              icon={ShoppingBag}
            />
            <StatCard
              index={1}
              label="Refunds"
              value={totals.refunds}
              format={(value) => formatPrice(value)}
              delta={delta(totals.refunds, previous.refunds)}
              invertedDelta
              caption="money returned"
              icon={RotateCcw}
            />
            <StatCard
              index={2}
              label="New customers"
              value={totals.newCustomers}
              delta={delta(totals.newCustomers, previous.newCustomers)}
              caption="first-time accounts"
              icon={UserPlus}
            />
          </>
        )}
      </div>

      {/* --- Charts -------------------------------------------------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Revenue and orders"
          description={
            overview.data
              ? `Bucketed by ${overview.data.range.granularity}.`
              : 'Loading the series…'
          }
          busy={overview.isFetching}
        >
          {overview.isLoading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <RevenueChart data={overview.data?.series ?? []} />
          )}
        </Panel>

        <Panel
          title="Visitors and conversion"
          description="How much of the traffic turned into orders."
          busy={overview.isFetching}
        >
          {overview.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <ConversionChart data={overview.data?.series ?? []} />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <Panel
          title="Traffic sources"
          description="Where the sessions came from."
          busy={traffic.isFetching}
        >
          {traffic.isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <TrafficPieChart data={traffic.data ?? []} />
          )}
        </Panel>

        <Panel
          title="Geography"
          description="Orders by district. Marker size follows revenue."
          busy={geography.isFetching}
        >
          {geography.isLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : (
            <GeoMap rows={geography.data ?? []} />
          )}
        </Panel>
      </div>

      {/* --- Tables -------------------------------------------------------- */}
      <Tabs defaultValue="products">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="products">Product performance</TabsTrigger>
            <TabsTrigger value="geography">By district</TabsTrigger>
            <TabsTrigger value="traffic">By source</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Export as CSV:</span>
            {ANALYTICS_EXPORTS.map((report) => (
              <Button
                key={report}
                variant="outline"
                size="sm"
                onClick={() => void download(report)}
                disabled={exporting !== null}
                className="gap-1.5"
              >
                {exporting === report ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-3.5" aria-hidden />
                )}
                {EXPORT_LABELS[report]}
              </Button>
            ))}
          </div>
        </div>

        <TabsContent value="products">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.isLoading ? (
                  <SkeletonRows columns={7} />
                ) : (products.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No products sold in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.data?.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>
                        <span className="block max-w-[28ch] truncate font-medium">{row.name}</span>
                        <span className="numeric block text-xs text-muted-foreground">
                          {row.sku}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.categoryName}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {row.unitsSold}
                      </TableCell>
                      <TableCell className="numeric text-right font-medium tabular-nums">
                        {formatPrice(row.revenue)}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums text-muted-foreground">
                        {row.views.toLocaleString('en-NP')}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {row.views > 0 ? formatPercent(row.conversionRate, 2) : '—'}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {row.refundedUnits > 0 ? (
                          <span className="text-destructive">{row.refundedUnits}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="geography">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>District</TableHead>
                  <TableHead>Province</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Customers</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {geography.isLoading ? (
                  <SkeletonRows columns={5} />
                ) : (geography.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No orders in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  geography.data?.map((row) => (
                    <TableRow key={`${row.district}-${row.province}`}>
                      <TableCell className="font-medium">{row.district}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.province || '—'}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums">{row.orders}</TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {row.customers}
                      </TableCell>
                      <TableCell className="numeric text-right font-medium tabular-nums">
                        {formatPrice(row.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="traffic">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traffic.isLoading ? (
                  <SkeletonRows columns={4} />
                ) : (traffic.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No traffic recorded in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  traffic.data?.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell className="font-medium">{row.source}</TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {row.visits.toLocaleString('en-NP')}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {row.sessions.toLocaleString('en-NP')}
                      </TableCell>
                      <TableCell className="numeric text-right tabular-nums">
                        {formatPercent(row.share)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Panel({
  title,
  description,
  busy,
  children,
}: {
  title: string;
  description: string;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-card sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </header>

      {children}
    </section>
  );
}

function SkeletonRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Built here rather than server-side: the totals and the previous window come
 *  back as separate objects, and the card wants them as one delta. */
function delta(current: number, previous: number) {
  return {
    current,
    previous,
    changePct: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}
