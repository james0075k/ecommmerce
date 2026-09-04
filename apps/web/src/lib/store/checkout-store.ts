'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AddressInput, PaymentMethod, ShippingMethodId } from '@bazaar/shared';

export type CheckoutStep = 'address' | 'shipping' | 'payment' | 'review';

export const CHECKOUT_STEPS: ReadonlyArray<{ id: CheckoutStep; label: string }> = [
  { id: 'address', label: 'Address' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'payment', label: 'Payment' },
  { id: 'review', label: 'Review' },
];

interface CheckoutState {
  step: CheckoutStep;
  /** Highest step reached, so completed steps stay clickable. */
  furthest: CheckoutStep;

  /** Set when picking from the address book; null when typing a new one. */
  savedAddressId: string | null;
  address: AddressInput | null;
  guestEmail: string;

  shippingMethod: ShippingMethodId;
  paymentMethod: PaymentMethod | null;
  notes: string;

  goTo: (step: CheckoutStep) => void;
  next: () => void;
  back: () => void;

  setSavedAddress: (id: string, address: AddressInput) => void;
  setAddress: (address: AddressInput) => void;
  setGuestEmail: (email: string) => void;
  setShippingMethod: (method: ShippingMethodId) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setNotes: (notes: string) => void;
  reset: () => void;
}

const initial = {
  step: 'address' as CheckoutStep,
  furthest: 'address' as CheckoutStep,
  savedAddressId: null,
  address: null,
  guestEmail: '',
  shippingMethod: 'STANDARD' as ShippingMethodId,
  paymentMethod: null,
  notes: '',
};

function indexOf(step: CheckoutStep): number {
  return CHECKOUT_STEPS.findIndex((entry) => entry.id === step);
}

/**
 * Checkout form state, persisted to sessionStorage.
 *
 * Persisting matters here in a way it does not for the cart: a gateway redirect
 * takes the shopper off the site entirely, and coming back to a blank address
 * form after a failed eSewa payment would mean re-typing everything. It is
 * *session* storage, not local - this is one purchase in progress, not a
 * standing preference, and it should not outlive the tab.
 *
 * No money is stored, only choices. Every total is recomputed by the server at
 * checkout regardless of what is here.
 */
export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      ...initial,

      goTo: (step) =>
        set((state) => ({
          step,
          furthest: indexOf(step) > indexOf(state.furthest) ? step : state.furthest,
        })),

      next: () => {
        const index = indexOf(get().step);
        const target = CHECKOUT_STEPS[Math.min(index + 1, CHECKOUT_STEPS.length - 1)];
        if (target) get().goTo(target.id);
      },

      back: () => {
        const index = indexOf(get().step);
        const target = CHECKOUT_STEPS[Math.max(index - 1, 0)];
        // `furthest` is deliberately not rewound - going back to edit an
        // earlier step should not lock the later ones the shopper already did.
        if (target) set({ step: target.id });
      },

      setSavedAddress: (id, address) => set({ savedAddressId: id, address }),
      setAddress: (address) => set({ address, savedAddressId: null }),
      setGuestEmail: (guestEmail) => set({ guestEmail }),
      setShippingMethod: (shippingMethod) => set({ shippingMethod }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setNotes: (notes) => set({ notes }),

      reset: () => set(initial),
    }),
    {
      name: 'bz-checkout',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
