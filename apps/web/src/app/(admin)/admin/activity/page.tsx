import type { Metadata } from 'next';

import { AdminActivityView } from './activity-view';

export const metadata: Metadata = {
  title: 'Activity log',
  description: 'Every change made from the admin panel.',
};

export default function AdminActivityPage() {
  return <AdminActivityView />;
}
