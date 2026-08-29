import type { Metadata } from 'next';

import { AdminProductsView } from './admin-products-view';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Manage the Bazaar catalog.',
};

export default function AdminProductsPage() {
  return <AdminProductsView />;
}
