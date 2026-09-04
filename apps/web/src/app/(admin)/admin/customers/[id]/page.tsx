import type { Metadata } from 'next';

import { AdminCustomerDetailView } from './customer-detail-view';

export const metadata: Metadata = {
  title: 'Customer',
  description: 'Order history, addresses and communication.',
};

/**
 * `params` is a promise in this version of Next - awaiting it is required, not
 * optional, and destructuring it synchronously is a runtime error.
 */
export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AdminCustomerDetailView customerId={id} />;
}
