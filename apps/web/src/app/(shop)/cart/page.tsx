import type { Metadata } from 'next';

import { CartView } from './cart-view';

export const metadata: Metadata = {
  title: 'Your cart',
  description: 'Review the items in your Bazaar cart before checking out.',
  // J2: a cart is per-visitor and empty for a crawler - there is nothing here
  // worth an index entry.
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return <CartView />;
}
