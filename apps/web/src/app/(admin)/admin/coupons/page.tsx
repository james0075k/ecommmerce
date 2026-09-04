import type { Metadata } from 'next';

import { AdminCouponsView } from './coupons-view';

export const metadata: Metadata = {
  title: 'Coupons',
  description: 'Discount codes and how they are being used.',
};

export default function AdminCouponsPage() {
  return <AdminCouponsView />;
}
