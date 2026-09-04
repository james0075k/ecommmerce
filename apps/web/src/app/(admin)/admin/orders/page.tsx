import type { Metadata } from 'next';

import { AdminOrdersView } from './admin-orders-view';

export const metadata: Metadata = {
  title: 'Orders · Admin',
  robots: { index: false, follow: false },
};

export default function AdminOrdersPage() {
  return <AdminOrdersView />;
}
