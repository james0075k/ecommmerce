'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { ProductForm } from '@/components/admin/product-form';
import { apiFetch } from '@/lib/api';
import type { ProductDetail, ProductListResponse } from '@/lib/catalog';

/**
 * The admin list links by id, but product detail is addressed by slug, so the
 * id is resolved to a slug first. One extra request, and it keeps a single
 * detail endpoint rather than duplicating it for admin.
 */
export function EditProductView({ productId }: { productId: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: async () => {
      const listing = await apiFetch<ProductListResponse>(
        `/admin/products?limit=100&search=${encodeURIComponent(productId)}`,
      );

      const match =
        listing.items.find((item) => item.id === productId) ?? listing.items[0];

      if (!match) throw new Error('Product not found');
      return apiFetch<ProductDetail>(`/products/${match.slug}`);
    },
  });

  if (isPending) {
    return (
      <div className="container-bazaar flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading product…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container-bazaar py-20 text-center text-muted-foreground">
        Could not load that product.
      </div>
    );
  }

  return <ProductForm product={data} />;
}
