import type { Metadata } from 'next';

import { AdminSettingsView } from './settings-view';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Store details, tax, payments, shipping and templates.',
};

export default function AdminSettingsPage() {
  return <AdminSettingsView />;
}
