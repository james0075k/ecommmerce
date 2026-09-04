'use client';

import { create } from 'zustand';
import type { CartView, WishlistEntry, WishlistView } from '@bazaar/shared';

import { apiFetch, ApiError } from '@/lib/api';
import { useCartStore } from '@/lib/store/cart-store';

interface WishlistState {
  items: WishlistEntry[];
  shareUrl: string | null;
  ready: boolean;
  busyIds: string[];

  /** Loads the list. Safe to call from several components on one page. */
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;

  add: (productId: string, variantId?: string | null) => Promise<WishlistEntry>;
  remove: (entryId: string) => Promise<void>;
  /** Removes it here and pushes it into the cart in one server round-trip. */
  moveToCart: (entryId: string, quantity?: number) => Promise<void>;
  /** Toggles by product, which is what a heart on a grid tile needs. */
  toggleByProduct: (productId: string, variantId?: string | null) => Promise<boolean>;

  createShareLink: (regenerate?: boolean) => Promise<string>;
  stopSharing: () => Promise<void>;
}

/**
 * Unlike the cart, this only ever holds data for a signed-in shopper - the
 * `wishlists` table has no guest identity. `reset()` is called on logout so the
 * next account does not briefly see the previous one's saves.
 */
export const useWishlistStore = create<WishlistState>((set, get) => ({
  items: [],
  shareUrl: null,
  ready: false,
  busyIds: [],

  hydrate: async () => {
    if (get().ready) return;
    await get().refresh();
  },

  refresh: async () => {
    try {
      const view = await apiFetch<WishlistView>('/wishlist');
      set({ items: view.items, shareUrl: view.shareUrl, ready: true });
    } catch {
      // 401 for a signed-out visitor is the common case, not an error worth
      // surfacing - the UI simply shows an empty list and a prompt to log in.
      set({ items: [], shareUrl: null, ready: true });
    }
  },

  reset: () => set({ items: [], shareUrl: null, ready: false, busyIds: [] }),

  add: async (productId, variantId) => {
    const entry = await apiFetch<WishlistEntry>('/wishlist', {
      method: 'POST',
      body: { productId, variantId: variantId ?? null },
    });

    set((state) => ({ items: [entry, ...state.items], ready: true }));
    return entry;
  },

  remove: async (entryId) => {
    set((state) => ({ busyIds: [...state.busyIds, entryId] }));

    try {
      await apiFetch(`/wishlist/${entryId}`, { method: 'DELETE' });
      set((state) => ({ items: state.items.filter((item) => item.id !== entryId) }));
    } finally {
      set((state) => ({ busyIds: state.busyIds.filter((id) => id !== entryId) }));
    }
  },

  moveToCart: async (entryId, quantity = 1) => {
    set((state) => ({ busyIds: [...state.busyIds, entryId] }));

    try {
      const cart = await apiFetch<CartView>(`/wishlist/${entryId}/move-to-cart`, {
        method: 'POST',
        body: { quantity },
      });

      // The endpoint returns the new cart, so the drawer and badge update
      // without a second request.
      useCartStore.setState((state) => ({
        view: cart,
        ready: true,
        bounceToken: state.bounceToken + 1,
      }));

      set((state) => ({ items: state.items.filter((item) => item.id !== entryId) }));
    } finally {
      set((state) => ({ busyIds: state.busyIds.filter((id) => id !== entryId) }));
    }
  },

  /** Returns the new saved state, so the caller can word its toast. */
  toggleByProduct: async (productId, variantId) => {
    const existing = get().items.find(
      (item) => item.product.id === productId && (item.variant?.id ?? null) === (variantId ?? null),
    );

    if (existing) {
      await get().remove(existing.id);
      return false;
    }

    try {
      await get().add(productId, variantId);
      return true;
    } catch (error) {
      // A 409 means another tab already saved it - the end state the shopper
      // wanted is the state they now have, so treat it as success.
      if (error instanceof ApiError && error.status === 409) {
        await get().refresh();
        return true;
      }
      throw error;
    }
  },

  createShareLink: async (regenerate = false) => {
    const { shareUrl } = await apiFetch<{ shareUrl: string; token: string }>(
      `/wishlist/share${regenerate ? '?regenerate=true' : ''}`,
      { method: 'POST' },
    );

    set({ shareUrl });
    return shareUrl;
  },

  stopSharing: async () => {
    await apiFetch('/wishlist/share', { method: 'DELETE' });
    set({ shareUrl: null });
  },
}));

/** True when this product (in this variant) is already saved. */
export function selectIsSaved(productId: string, variantId?: string | null) {
  return (state: WishlistState): boolean =>
    state.items.some(
      (item) =>
        item.product.id === productId &&
        (variantId === undefined || (item.variant?.id ?? null) === (variantId ?? null)),
    );
}
