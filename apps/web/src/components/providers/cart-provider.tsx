'use client';

import { useEffect, useRef } from 'react';

import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useWishlistStore } from '@/lib/store/wishlist-store';

/**
 * Keeps the cart and wishlist in step with the session.
 *
 * The important case is the guest merge: the API folds the `bz_cart` cookie's
 * rows into the account during login, but the store is still holding the
 * pre-login cart. Watching the user id and refetching on any change is what
 * makes the merged cart appear without a page reload.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const authReady = useAuthStore((state) => state.ready);

  const refreshCart = useCartStore((state) => state.refresh);
  const refreshWishlist = useWishlistStore((state) => state.refresh);
  const resetWishlist = useWishlistStore((state) => state.reset);

  // `undefined` means "no session settled yet", which is distinct from `null`
  // (settled, signed out) - only the latter should trigger a fetch.
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!authReady) return;
    if (lastUserId.current === userId) return;

    lastUserId.current = userId;

    void refreshCart();

    if (userId) {
      void refreshWishlist();
    } else {
      resetWishlist();
    }
  }, [authReady, userId, refreshCart, refreshWishlist, resetWishlist]);

  return children;
}
