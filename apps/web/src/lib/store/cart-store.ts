'use client';

import { create } from 'zustand';
import type {
  AddToCartInput,
  CartLine,
  CartView,
  CouponValidationResult,
} from '@bazaar/shared';

import { apiFetch, ApiError } from '@/lib/api';

/** What a removed line needs in order to be put back by the undo toast. */
export interface PendingRemoval {
  line: CartLine;
  restore: () => Promise<void>;
}

interface CartState {
  view: CartView | null;
  /** False until the first fetch settles - the badge waits on this. */
  ready: boolean;
  /** The drawer is part of cart state so any component can open it. */
  isOpen: boolean;
  /** Flips true briefly after an add, driving the navbar bounce. */
  bounceToken: number;

  /** Per-line pending flags, so one stepper spinning does not disable the rest. */
  busyLineIds: string[];
  isAdding: boolean;
  couponError: string | null;
  isApplyingCoupon: boolean;

  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;

  hydrate: () => Promise<void>;
  /** Re-reads the server cart. Called after login so a merge is picked up. */
  refresh: () => Promise<void>;

  addItem: (input: AddToCartInput, options?: { openDrawer?: boolean }) => Promise<void>;
  updateQuantity: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<PendingRemoval>;
  clear: () => Promise<void>;

  applyCoupon: (code: string) => Promise<CouponValidationResult | null>;
  removeCoupon: () => Promise<void>;
}

/**
 * The cart mirrors the server, and every mutation returns the whole recomputed
 * cart, so the store's job is just to hold the latest one.
 *
 * Nothing is persisted to localStorage on purpose: the cart lives in the
 * database against a user id or the `bz_cart` HttpOnly cookie, which is what
 * makes it survive a refresh, a new tab and a different device. A local copy
 * would only ever be a second source of truth to disagree with.
 */
export const useCartStore = create<CartState>((set, get) => ({
  view: null,
  ready: false,
  isOpen: false,
  bounceToken: 0,
  busyLineIds: [],
  isAdding: false,
  couponError: null,
  isApplyingCoupon: false,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setOpen: (isOpen) => set({ isOpen }),

  hydrate: async () => {
    if (get().ready) return;
    await get().refresh();
  },

  refresh: async () => {
    try {
      const view = await apiFetch<CartView>('/cart');
      set({ view, ready: true });
    } catch {
      // A cart that cannot be read is an empty cart as far as the UI is
      // concerned - better than blocking the whole page on it.
      set({ ready: true });
    }
  },

  addItem: async (input, options) => {
    set({ isAdding: true });

    try {
      const view = await apiFetch<CartView>('/cart/items', {
        method: 'POST',
        body: input,
      });

      set((state) => ({
        view,
        ready: true,
        // A changing token is what the badge watches; a boolean would not
        // re-trigger on two adds in a row.
        bounceToken: state.bounceToken + 1,
        isOpen:
          options?.openDrawer === false || isNarrowViewport() ? state.isOpen : true,
      }));
    } finally {
      set({ isAdding: false });
    }
  },

  updateQuantity: async (lineId, quantity) => {
    set((state) => ({ busyLineIds: [...state.busyLineIds, lineId] }));

    try {
      const view = await apiFetch<CartView>(`/cart/items/${lineId}`, {
        method: 'PATCH',
        body: { quantity },
      });
      set({ view });
    } finally {
      set((state) => ({
        busyLineIds: state.busyLineIds.filter((id) => id !== lineId),
      }));
    }
  },

  /**
   * Removes a line and hands back everything needed to put it back.
   *
   * Undo re-adds rather than resurrecting the row, because the row is gone -
   * so the restored line gets a new id and moves to the top of the drawer.
   * That is a visible but honest consequence, and it keeps the server as the
   * single owner of cart state instead of holding a tombstone for 5 seconds.
   */
  removeItem: async (lineId) => {
    const line = get().view?.items.find((item) => item.id === lineId);

    if (!line) throw new Error('That item is no longer in your cart.');

    set((state) => ({ busyLineIds: [...state.busyLineIds, lineId] }));

    try {
      const view = await apiFetch<CartView>(`/cart/items/${lineId}`, {
        method: 'DELETE',
      });
      set({ view });

      return {
        line,
        restore: async () => {
          await get().addItem(
            {
              productId: line.product.id,
              variantId: line.variant.id,
              quantity: line.quantity,
            },
            { openDrawer: false },
          );
        },
      };
    } finally {
      set((state) => ({
        busyLineIds: state.busyLineIds.filter((id) => id !== lineId),
      }));
    }
  },

  clear: async () => {
    const view = await apiFetch<CartView>('/cart', { method: 'DELETE' });
    set({ view, couponError: null });
  },

  applyCoupon: async (code) => {
    set({ isApplyingCoupon: true, couponError: null });

    try {
      const result = await apiFetch<CouponValidationResult>('/cart/apply-coupon', {
        method: 'POST',
        body: { code: code.trim().toUpperCase() },
      });

      // The endpoint returns the coupon and the new summary, not the lines -
      // so patch those two fields rather than refetching the whole cart.
      set((state) => ({
        view: state.view
          ? { ...state.view, coupon: result.coupon, summary: result.summary }
          : state.view,
      }));

      return result;
    } catch (error) {
      // Every coupon rejection is a 400 whose message is written for the
      // shopper ("This coupon has expired."), so it is shown verbatim.
      set({
        couponError:
          error instanceof ApiError ? error.message : 'That code could not be applied.',
      });
      return null;
    } finally {
      set({ isApplyingCoupon: false });
    }
  },

  removeCoupon: async () => {
    const view = await apiFetch<CartView>('/cart/coupon', { method: 'DELETE' });
    set({ view, couponError: null });
  },
}));

/**
 * The same 1024px boundary `useIsMobile` uses, read imperatively.
 *
 * Phase 11 moved the mobile cart to its own route, so an add on a phone must
 * not pop a drawer that nothing else in that layout uses. This is a store, not
 * a component, so it reads `matchMedia` directly - and answers "no" when there
 * is no window at all, because a server-side add has no drawer to open either.
 */
function isNarrowViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1023.98px)').matches;
}

/* -------------------------------------------------------------------------- */
/*  Selectors                                                                 */
/* -------------------------------------------------------------------------- */

/** Total units, which is what the navbar badge shows. */
export const selectCartCount = (state: CartState): number =>
  state.view?.summary.itemCount ?? 0;

export const selectCartLines = (state: CartState): CartLine[] => state.view?.items ?? [];
