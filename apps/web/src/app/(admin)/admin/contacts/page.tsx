import type { Metadata } from 'next';

import { AdminContactsView } from './contacts-view';

export const metadata: Metadata = {
  title: 'Messages',
  description: 'Contact form submissions and replies.',
};

export default function AdminContactsPage() {
  return <AdminContactsView />;
}
