'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PRODUCT_STATUSES } from '@bazaar/shared';
import type {
  AdminProductRow,
  AdminProductSort,
  BulkProductAction,
  BulkProductResult,
  Paginated,
} from '@bazaar/shared';
import { EASE_OUT_EXPO, formatPrice } from '@bazaar/ui';

import { BulkImportDialog } from '@/components/admin/bulk-import-dialog';
import { Badge } from '@/components/ui/badge';
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
import { toQueryString } from '@/lib/admin';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-success/10 text-ok',
  DRAFT: 'bg-muted text-muted-foreground',
  ARCHIVED: 'bg-destructive/10 text-destructive',
  OUT_OF_STOCK: 'bg-warning/10 text-caution',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
  OUT_OF_STOCK: 'Out of stock',
};

/** A column header that can sort, and the pair of sort keys behind it. */
interface SortableColumn {
  label: string;
  asc: AdminProductSort;
  desc: AdminProductSort;
}

const BULK_ACTIONS: ReadonlyArray<{
  action: BulkProductAction;
  label: string;
  icon: typeof Eye;
  destructive?: boolean;
}> = [
  { action: 'ACTIVATE', label: 'Publish', icon: Eye },
  { action: 'DRAFT', label: 'Move to draft', icon: EyeOff },
  { action: 'FEATURE', label: 'Feature', icon: Star },
  { action: 'UNFEATURE', label: 'Unfeature', icon: Star },
  { action: 'ARCHIVE', label: 'Archive', icon: Trash2 },
  { action: 'DELETE', label: 'Delete', icon: Trash2, destructive: true },
];

/**
 * The catalog table.
 *
 * Selection is per page and cleared whenever the query changes. Persisting it
 * across filters sounds helpful and is not: an operator who filters to "drafts",
 * selects eight, then clears the filter and presses Archive would archive eight
 * rows they can no longer see. Losing a selection is a small annoyance;
 * acting on an invisible one is a support ticket.
 */
export function AdminProductsView() {
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('ALL');
  const [brand, setBrand] = React.useState('ALL');
  const [lowStock, setLowStock] = React.useState(false);
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [sort, setSort] = React.useState<AdminProductSort>('newest');
  const [page, setPage] = React.useState(1);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = React.useState(false);
  const [pendingAction, setPendingAction] = React.useState<BulkProductAction | null>(null);

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
    status: status === 'ALL' ? undefined : status,
    brand: brand === 'ALL' ? undefined : brand,
    lowStock: lowStock || undefined,
    includeArchived: includeArchived || undefined,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-products', query],
    queryFn: () => apiFetch<Paginated<AdminProductRow>>(`/admin/products?${query}`),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const { data: brands } = useQuery({
    queryKey: ['admin-products', 'brands'],
    queryFn: () => apiFetch<string[]>('/admin/products/brands'),
    staleTime: 600_000,
  });

  // Selection is scoped to what is on screen; changing the query drops it.
  React.useEffect(() => setSelected(new Set()), [query]);

  const bulk = useMutation({
    mutationFn: (action: BulkProductAction) =>
      apiFetch<BulkProductResult>('/admin/products/bulk', {
        method: 'PATCH',
        body: { productIds: [...selected], action },
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setSelected(new Set());
      setPendingAction(null);

      if (result.failures.length === 0) {
        toast.success(`${result.updated} product${result.updated === 1 ? '' : 's'} updated.`);
        return;
      }

      // Partial success is reported as partial success. Saying "done" when
      // three of twenty rows did not move is the failure mode this avoids.
      toast.warning(
        `${result.updated} updated, ${result.failures.length} could not be: ${result.failures[0]?.reason ?? ''}`,
        { description: result.failures.map((failure) => failure.name).slice(0, 5).join(', ') },
      );
    },
    onError: (error) => {
      setPendingAction(null);
      toast.error(error instanceof ApiError ? error.message : 'The bulk action failed.');
    },
  });

  const reindex = useMutation({
    mutationFn: () =>
      apiFetch<{ indexed: number; engine: string }>('/admin/products/reindex', { method: 'POST' }),
    onSuccess: (result) =>
      toast.success(`Reindexed ${result.indexed} products via ${result.engine}.`),
    onError: () => toast.error('Could not rebuild the search index.'),
  });

  const items = data?.items ?? [];
  const meta = data?.meta;

  const allSelected = items.length > 0 && items.every((product) => selected.has(product.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((product) => product.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortButton = (column: SortableColumn) => {
    const active = sort === column.asc || sort === column.desc;
    const Icon = sort === column.asc ? ArrowUp : sort === column.desc ? ArrowDown : ArrowUpDown;

    return (
      <button
        type="button"
        onClick={() => {
          setSort(sort === column.desc ? column.asc : column.desc);
          setPage(1);
        }}
        aria-label={`Sort by ${column.label}`}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {column.label}
        <Icon className="size-3" aria-hidden />
      </button>
    );
  };

  const filtered =
    Boolean(debounced) || status !== 'ALL' || brand !== 'ALL' || lowStock || includeArchived;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta
              ? `${meta.total.toLocaleString('en-NP')} in the catalog.`
              : 'Everything you sell.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={reindex.isPending}
            onClick={() => reindex.mutate()}
            className="gap-1.5"
          >
            {reindex.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Reindex
          </Button>

          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
            <Upload className="size-4" aria-hidden />
            Import CSV
          </Button>

          <Button size="sm" asChild className="gap-1.5">
            <Link href="/admin/products/new">
              <Plus className="size-4" aria-hidden />
              New product
            </Link>
          </Button>
        </div>
      </header>

      {/* --- Filters ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, SKU or brand"
            aria-label="Search products"
            className="pl-8"
          />
        </div>

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any status</SelectItem>
            {PRODUCT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value] ?? value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={brand}
          onValueChange={(value) => {
            setBrand(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[9.5rem]" aria-label="Filter by brand">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any brand</SelectItem>
            {(brands ?? []).map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={lowStock ? 'default' : 'outline'}
          size="sm"
          aria-pressed={lowStock}
          onClick={() => {
            setLowStock((previous) => !previous);
            setPage(1);
          }}
        >
          Low stock
        </Button>

        <Button
          variant={includeArchived ? 'default' : 'outline'}
          size="sm"
          aria-pressed={includeArchived}
          onClick={() => {
            setIncludeArchived((previous) => !previous);
            setPage(1);
          }}
        >
          Show archived
        </Button>

        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatus('ALL');
              setBrand('ALL');
              setLowStock(false);
              setIncludeArchived(false);
              setPage(1);
            }}
            className="gap-1"
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>

      {/* --- Bulk toolbar --------------------------------------------------- */}
      <AnimatePresence>
        {someSelected ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-accent/40 px-3 py-2"
          >
            <span className="text-sm font-medium">
              {selected.size} selected
            </span>

            <div className="flex flex-wrap gap-1.5">
              {BULK_ACTIONS.map(({ action, label, icon: Icon, destructive }) => (
                <Button
                  key={action}
                  variant={destructive ? 'destructive' : 'outline'}
                  size="sm"
                  disabled={bulk.isPending}
                  onClick={() => {
                    // Only the irreversible one asks twice.
                    if (action === 'DELETE' && pendingAction !== 'DELETE') {
                      setPendingAction('DELETE');
                      return;
                    }
                    bulk.mutate(action);
                  }}
                  className="gap-1.5"
                >
                  {bulk.isPending && bulk.variables === action ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Icon className="size-3.5" aria-hidden />
                  )}
                  {action === 'DELETE' && pendingAction === 'DELETE' ? 'Really delete?' : label}
                </Button>
              ))}

              {includeArchived ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulk.isPending}
                  onClick={() => bulk.mutate('RESTORE')}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Restore
                </Button>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(new Set());
                setPendingAction(null);
              }}
              className="ml-auto gap-1"
            >
              <X className="size-3.5" aria-hidden />
              Clear selection
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select every product on this page"
                  disabled={items.length === 0}
                />
              </TableHead>
              <TableHead className="w-14">Image</TableHead>
              <TableHead>
                {sortButton({ label: 'Name', asc: 'name_asc', desc: 'name_desc' })}
              </TableHead>
              <TableHead className="hidden md:table-cell">SKU</TableHead>
              <TableHead className="hidden lg:table-cell">Category</TableHead>
              <TableHead className="text-right">
                {sortButton({ label: 'Price', asc: 'price_asc', desc: 'price_desc' })}
              </TableHead>
              <TableHead className="text-right">
                {sortButton({ label: 'Stock', asc: 'stock_asc', desc: 'stock_desc' })}
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }, (_, row) => (
                <TableRow key={row}>
                  {Array.from({ length: 9 }, (_, column) => (
                    <TableCell key={column}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <div className="py-12 text-center">
                    <PackageSearch className="mx-auto size-6 text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-sm font-medium">
                      {filtered ? 'Nothing matches those filters.' : 'No products yet.'}
                    </p>
                    <Button size="sm" className="mt-4 gap-1.5" asChild>
                      <Link href="/admin/products/new">
                        <Plus className="size-4" aria-hidden />
                        Add a product
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((product) => (
                <TableRow
                  key={product.id}
                  data-state={selected.has(product.id) ? 'selected' : undefined}
                  className={cn(product.deletedAt && 'opacity-60')}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(product.id)}
                      onCheckedChange={() => toggleOne(product.id)}
                      aria-label={`Select ${product.name}`}
                    />
                  </TableCell>

                  <TableCell>
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="size-10 rounded object-cover"
                      />
                    ) : (
                      <div className="size-10 rounded bg-muted" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="block max-w-[24ch] truncate font-medium hover:underline sm:max-w-none"
                    >
                      {product.name}
                    </Link>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {product.brand ?? 'No brand'}
                      {product.isFeatured ? (
                        <Star className="size-3 fill-caution text-caution" aria-label="Featured" />
                      ) : null}
                      {product.variantCount > 1 ? (
                        <span>· {product.variantCount} variants</span>
                      ) : null}
                    </span>
                  </TableCell>

                  <TableCell className="numeric hidden text-xs md:table-cell">
                    {product.sku}
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline">{product.categoryName}</Badge>
                  </TableCell>

                  <TableCell className="numeric text-right tabular-nums">
                    {formatPrice(product.basePrice, product.currency)}
                    {product.compareAtPrice ? (
                      <span className="block text-xs text-muted-foreground line-through">
                        {formatPrice(product.compareAtPrice, product.currency)}
                      </span>
                    ) : null}
                  </TableCell>

                  <TableCell className="numeric text-right tabular-nums">
                    <span
                      className={cn(
                        product.stockQuantity === 0 && 'text-destructive',
                        product.stockQuantity > 0 && product.stockQuantity <= 10 && 'text-caution',
                      )}
                    >
                      {product.stockQuantity}
                    </span>
                  </TableCell>

                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLES[product.status] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {product.deletedAt
                        ? 'Deleted'
                        : (STATUS_LABELS[product.status] ?? product.status)}
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link
                        href={`/admin/products/${product.id}/edit`}
                        aria-label={`Edit ${product.name}`}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Link>
                    </Button>
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

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => void queryClient.invalidateQueries({ queryKey: ['admin-products'] })}
      />
    </div>
  );
}
