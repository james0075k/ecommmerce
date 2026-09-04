import type { Metadata } from 'next';

import { AdminAnalyticsView } from './analytics-view';

export const metadata: Metadata = {
  title: 'Analytics',
  description: 'Revenue, conversion, product performance and geography.',
};

export default function AdminAnalyticsPage() {
  return <AdminAnalyticsView />;
}
