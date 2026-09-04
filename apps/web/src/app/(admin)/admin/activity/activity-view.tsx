'use client';

import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FilePlus2,
  FileX2,
  LogIn,
  Pencil,
  ScrollText,
  X,
} from 'lucide-react';
import type { ActivityDiffField, AdminActivityEntry } from '@bazaar/shared';

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
import { adminApi, adminKeys, formatDateTime, toQueryString } from '@/lib/admin';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'] as const;

const ACTION_ICONS = {
  CREATE: FilePlus2,
  UPDATE: Pencil,
  DELETE: FileX2,
  LOGIN: LogIn,
  EXPORT: Download,
} as const;

const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-success/10 text-ok',
  UPDATE: 'bg-accent text-accent-foreground',
  DELETE: 'bg-destructive/10 text-destructive',
  LOGIN: 'bg-muted text-muted-foreground',
  EXPORT: 'bg-warning/10 text-caution',
};

const ENTITY_LABELS: Record<string, string> = {
  product: 'Product',
  product_variant: 'Variant',
  product_image: 'Image',
  order: 'Order',
  customer: 'Customer',
  customer_message: 'Customer message',
  coupon: 'Coupon',
  contact_message: 'Contact message',
  store_setting: 'Setting',
  category: 'Category',
  analytics: 'Analytics',
  admin: 'Admin',
};

/**
 * The audit trail.
 *
 * Every mutating admin request lands here, and the ones that matter carry a
 * real before/after diff rather than a dump of the request body. The value of
 * this page is answering "who changed the tax rate, and from what" a month
 * later - so the diff renders as struck-out old beside new, which is the only
 * form of it that can be read at a glance.
 */
export function AdminActivityView() {
  const [action, setAction] = React.useState('ALL');
  const [entityType, setEntityType] = React.useState('ALL');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);

  const query = toQueryString({
    page,
    limit: PAGE_SIZE,
    action: action === 'ALL' ? undefined : action,
    entityType: entityType === 'ALL' ? undefined : entityType,
    from: from || undefined,
    to: to || undefined,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: adminKeys.activity({ query } as never),
    queryFn: () => adminApi.activity(query),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const items = data?.items ?? [];
  const meta = data?.meta;
  const filtered = action !== 'ALL' || entityType !== 'ALL' || from || to;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Activity log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every change made from the admin panel, with the address it came from.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={action}
          onValueChange={(value) => {
            setAction(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[9rem]" aria-label="Filter by action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any action</SelectItem>
            {ACTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={entityType}
          onValueChange={(value) => {
            setEntityType(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[11rem]" aria-label="Filter by record type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any record</SelectItem>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="h-9 w-auto text-xs"
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          To
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="h-9 w-auto text-xs"
          />
        </label>

        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAction('ALL');
              setEntityType('ALL');
              setFrom('');
              setTo('');
              setPage(1);
            }}
            className="gap-1"
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          'rounded-lg border border-border bg-card shadow-card transition-opacity',
          isFetching && !isLoading && 'opacity-60',
        )}
      >
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, n) => (
              <Skeleton key={n} className="h-14 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <ScrollText className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">Nothing logged in this range.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered ? 'Try widening the filters.' : 'No admin changes have been made yet.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {meta.page} of {meta.totalPages} · {meta.total.toLocaleString('en-NP')} entries
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

function ActivityRow({ entry }: { entry: AdminActivityEntry }) {
  const Icon = ACTION_ICONS[entry.action as keyof typeof ACTION_ICONS] ?? Pencil;
  const diff = entry.details?.diff ?? [];

  return (
    <li className="flex gap-3 px-4 py-3">
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md',
          ACTION_STYLES[entry.action] ?? 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-medium">
            {entry.details?.summary ??
              `${entry.action.toLowerCase()} on ${ENTITY_LABELS[entry.entityType] ?? entry.entityType}`}
          </p>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          {entry.adminName ?? 'System'}
          {entry.adminEmail ? ` (${entry.adminEmail})` : ''} · {formatDateTime(entry.createdAt)}
          {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
        </p>

        {diff.length > 0 ? (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs font-medium text-primary">
              {diff.length} field{diff.length === 1 ? '' : 's'} changed
            </summary>

            <dl className="mt-1.5 space-y-1 rounded-md bg-muted/50 p-2">
              {diff.map((field) => (
                <DiffRow key={field.field} field={field} />
              ))}
            </dl>
          </details>
        ) : null}
      </div>
    </li>
  );
}

function DiffRow({ field }: { field: ActivityDiffField }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <dt className="numeric font-medium">{field.field}</dt>
      <dd className="text-muted-foreground line-through">{render(field.before)}</dd>
      <span aria-hidden>→</span>
      <dd className="font-medium">{render(field.after)}</dd>
    </div>
  );
}

/**
 * Diff values are JSONB, so they can be anything - a string, a number, an
 * array of category ids, or a nested object. Rendering them as JSON is the
 * only representation that is always honest, truncated so one product
 * description does not become the whole page.
 */
function render(value: unknown): string {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  if (typeof value === 'number') return value.toLocaleString('en-NP');

  const json = JSON.stringify(value);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}
