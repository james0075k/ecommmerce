'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ApiError, apiFetch } from '@/lib/api';
import type { ProductListItem } from '@/lib/catalog';
import { useCartStore } from '@/lib/store/cart-store';

/** H2: the button morphs to a checkmark and resets - 800ms in total. */
const ADDED_RESET_MS = 800;

export type QuickAddState = 'idle' | 'adding' | 'added';

/**
 * Adding to the cart from somewhere that has no variant selector.
 *
 * Two surfaces need this now - the grid tile and the long-press quick view -
 * and both face the same problem: the listing payload carries no variants, so
 * there is nothing here to choose with. The rule is to add the product when
 * there is exactly one thing to add, and to hand the shopper to the detail page
 * when there is a real choice, rather than picking a size on their behalf.
 */
export function useQuickAdd(product: ProductListItem) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [state, setState] = React.useState<QuickAddState>('idle');

  React.useEffect(() => {
    if (state !== 'added') return;
    const timer = window.setTimeout(() => setState('idle'), ADDED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const add = React.useCallback(async () => {
    setState('adding');

    try {
      const variantId = await resolveDefaultVariant(product.slug);

      if (!variantId) {
        setState('idle');
        router.push(`/products/${product.slug}`);
        return;
      }

      await addItem({ productId: product.id, variantId, quantity: 1 });
      setState('added');
    } catch (error) {
      setState('idle');
      toast.error(
        error instanceof ApiError ? error.message : 'Could not add that to your cart.',
      );
    }
  }, [addItem, product.id, product.slug, router]);

  return { state, add };
}

/**
 * Resolves the single obvious variant for a product, or null when the shopper
 * has a real choice to make. The detail endpoint is already cached by React
 * Query for anyone who has visited the page, so this is usually free.
 */
export async function resolveDefaultVariant(slug: string): Promise<string | null> {
  const detail = await apiFetch<{
    variants: Array<{ id: string; stockQuantity: number; isActive: boolean }>;
  }>(`/products/${slug}`);

  const available = detail.variants.filter(
    (variant) => variant.isActive && variant.stockQuantity > 0,
  );

  return available.length === 1 ? available[0].id : null;
}
