import type { Metadata } from 'next';

import { OrdersView } from './orders-view';

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return <OrdersView />;
}
