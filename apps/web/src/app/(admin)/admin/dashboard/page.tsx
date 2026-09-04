import type { Metadata } from 'next';

import { AdminDashboardView } from './dashboard-view';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Revenue, orders and stock at a glance.',
};

export default function AdminDashboardPage() {
  return <AdminDashboardView />;
}
