import type { Metadata } from 'next';

import { OrderDetailView } from './order-detail-view';

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailView orderId={id} />;
}
