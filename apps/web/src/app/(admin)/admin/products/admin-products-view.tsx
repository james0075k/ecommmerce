'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { formatPrice } from '@bazaar/ui';

import { BulkImportDialog } from '@/components/admin/bulk-import-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ApiError, apiFetch } from '@/lib/api';
import type { ProductListResponse } from '@/lib/catalog';

export function AdminProductsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [importOpen, setImportOpen] = React.useState(false);

  // Debounced so typing a SKU does not fire a request per keystroke.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isPending } = useQuery({
    queryKey: ['admin-products', debounced, page],
    queryFn: () =>
      apiFetch<ProductListResponse>(
        `/admin/products?page=${page}&limit=20${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`,
      ),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Product archived.');
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not archive that product.'),
  });

  const reindex = useMutation({
    mutationFn: () =>
      apiFetch<{ indexed: number; engine: string }>('/admin/products/reindex', {
        method: 'POST',
      }),
    onSuccess: (result) =>
      toast.success(`Reindexed ${result.indexed} products via ${result.engine}.`),
    onError: () => toast.error('Could not rebuild the search index.'),
  });

  return (
    <div className="container-bazaar py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isPending ? 'Loading…' : `${data?.meta.total ?? 0} in the catalog`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={reindex.isPending}
            onClick={() => reindex.mutate()}
          >
            {reindex.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Reindex
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            Import CSV
          </Button>
          <Button size="sm" asChild>
            <Link href="/admin/products/new">
              <Plus className="size-4" />
              New product
            </Link>
          </Button>
        </div>
      </header>

      <div className="relative mb-4 max-w-sm">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, brand or SKU"
          className="pl-9"
          aria-label="Search products"
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">SKU</TableHead>
              <TableHead className="hidden lg:table-cell">Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isPending ? (
              Array.from({ length: 8 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={7}>
                    <Skeleton className="bz-shimmer h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : !data?.items.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  {debounced ? `Nothing matches "${debounced}".` : 'No products yet.'}
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    {product.image ? (
                      <Image
                        src={product.image.url}
                        alt=""
                        width={40}
                        height={40}
                        className="size-10 rounded object-cover"
                      />
                    ) : (
                      <div className="size-10 rounded bg-muted" />
                    )}
                  </TableCell>

                  <TableCell>
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    {product.brand ? (
                      <p className="text-xs text-muted-foreground">{product.brand}</p>
                    ) : null}
                  </TableCell>

                  <TableCell className="numeric hidden text-xs md:table-cell">
                    {product.sku}
                  </TableCell>

                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline">{product.category.name}</Badge>
                  </TableCell>

                  <TableCell className="numeric text-right">
                    {formatPrice(product.price, product.currency)}
                  </TableCell>

                  <TableCell className="numeric text-right">
                    <span
                      className={
                        product.stockQuantity === 0
                          ? 'text-destructive'
                          : product.stockQuantity <= 5
                            ? 'text-warning'
                            : ''
                      }
                    >
                      {product.stockQuantity}
                    </span>
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link
                          href={`/admin/products/${product.id}/edit`}
                          aria-label={`Edit ${product.name}`}
                        >
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Archive ${product.name}`}
                        disabled={archive.isPending}
                        onClick={() => archive.mutate(product.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.meta.totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="numeric text-sm text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data.meta.hasPrev}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.meta.hasNext}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
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
