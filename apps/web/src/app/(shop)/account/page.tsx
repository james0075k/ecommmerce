import type { Metadata } from 'next';

import { AccountView } from './account-view';

export const metadata: Metadata = {
  title: 'Your account',
  description: 'Manage your profile, delivery addresses and security settings.',
};

export default function AccountPage() {
  return <AccountView />;
}
