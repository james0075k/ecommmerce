import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CheckoutView } from './checkout-view';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your Bazaar order.',
  // J2: checkout stays out of the index.
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutView />
    </Suspense>
  );
}
