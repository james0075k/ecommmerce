'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, UserX, X } from 'lucide-react';
import { AccountStatus } from '@bazaar/shared';
import type { AdminCustomerListItem } from '@bazaar/shared';
import { formatDate, formatPrice } from '@bazaar/ui';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import { adminApi, adminKeys, toQueryString } from '@/lib/admin';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'ltv_high', label: 'Highest lifetime value' },
  { value: 'orders_high', label: 'Most orders' },
  { value: 'name', label: 'Name A-Z' },
] as const;

/**
 * The customer list.
 *
 * Lifetime value and order count are the two columns this table exists for -
 * a list of names and emails is an export, not a tool. Both are computed
 * server-side from the orders that actually stuck, so a serial returner does
 * not sort to the top of "best customers".
 *
 * The sort lives in the URL so a view worth looking at is a link worth sending,
 * and so the dashboard's "top customers" panel can deep-link straight into it.
 */
export function AdminCustomersView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [hasOrders, setHasOrders] = React.useState(false);
  const [page, setPage] = React.useState(1);

  const sort = SORTS.some((option) => option.value === searchParams.get('sort'))
    ? (searchParams.get('sort') as (typeof SORTS)[number]['value'])
    : 'newest';

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
    sort,
    search: debounced || undefined,
    status: status || undefined,
    hasOrders: hasOrders || undefined,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: adminKeys.customers.list({ query } as never),
    queryFn: () => adminApi.customers(query),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const setSort = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', value);
    router.replace(`/admin/customers?${params.toString()}`, { scroll: false });
    setPage(1);
  };

  const items = data?.items ?? [];
  const meta = data?.meta;
  const filtered = Boolean(debounced || status || hasOrders);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta
            ? `${meta.total.toLocaleString('en-NP')} account${meta.total === 1 ? '' : 's'}.`
            : 'Everyone with an account.'}
        </p>
      </header>

      {/* --- Filters ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email or phone"
            aria-label="Search customers"
            className="pl-8"
          />
        </div>

        <Select
          value={status || 'ALL'}
          onValueChange={(value) => {
            setStatus(value === 'ALL' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any status</SelectItem>
            {Object.values(AccountStatus).map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[13rem]" aria-label="Sort customers">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={hasOrders ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setHasOrders((previous) => !previous);
            setPage(1);
          }}
          aria-pressed={hasOrders}
        >
          Has ordered
        </Button>

        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatus('');
              setHasOrders(false);
              setPage(1);
            }}
            className="gap-1"
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      {/* --- Table --------------------------------------------------------- */}
      <div
        className={cn(
          'overflow-x-auto rounded-lg border border-border bg-card shadow-card transition-opacity',
          isFetching && !isLoading && 'opacity-60',
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Lifetime value</TableHead>
              <TableHead className="hidden lg:table-cell">Last order</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 6 }, (_, column) => (
                    <TableCell key={column}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-12 text-center">
                    <UserX className="mx-auto size-6 text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-sm font-medium">No customers match those filters.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {filtered ? 'Try widening the search.' : 'Nobody has signed up yet.'}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((customer) => <CustomerRow key={customer.id} customer={customer} />)
            )}
          </TableBody>
        </Table>
      </div>

      {/* --- Pagination ---------------------------------------------------- */}
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
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  BANNED: 'Banned',
};

export function AccountStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'ACTIVE' && 'bg-success/10 text-ok',
        status === 'SUSPENDED' && 'bg-warning/10 text-caution',
        status === 'BANNED' && 'bg-destructive/10 text-destructive',
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function CustomerRow({ customer }: { customer: AdminCustomerListItem }) {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/admin/customers/${customer.id}`}
          className="flex items-center gap-3 hover:underline"
        >
          <Avatar className="size-9 shrink-0">
            {customer.avatarUrl ? <AvatarImage src={customer.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-[11px] font-semibold">
              {initialsOf(customer.fullName)}
            </AvatarFallback>
          </Avatar>

          <span className="min-w-0">
            <span className="block max-w-[18ch] truncate text-sm font-medium sm:max-w-none">
              {customer.fullName}
            </span>
            <span className="block text-xs text-muted-foreground md:hidden">{customer.email}</span>
            {customer.role !== 'CUSTOMER' ? (
              <span className="mt-0.5 inline-block rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent-foreground uppercase">
                {customer.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
              </span>
            ) : null}
          </span>
        </Link>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <span className="block max-w-[24ch] truncate text-sm">{customer.email}</span>
        <span className="numeric block text-xs text-muted-foreground">
          {customer.phone ?? 'No phone'}
        </span>
      </TableCell>

      <TableCell className="numeric text-right tabular-nums">{customer.orderCount}</TableCell>

      <TableCell className="numeric text-right font-medium tabular-nums">
        {formatPrice(customer.lifetimeValue)}
      </TableCell>

      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
        {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : 'Never'}
      </TableCell>

      <TableCell>
        <AccountStatusBadge status={customer.status} />
      </TableCell>
    </TableRow>
  );
}

export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
