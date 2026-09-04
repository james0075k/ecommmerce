import type { Metadata } from 'next';

import { OfflineView } from './offline-view';

export const metadata: Metadata = {
  title: 'You are offline',
  description: 'Bazaar works without a connection for anything you have already seen.',
  robots: { index: false, follow: false },
};

/**
 * The page the service worker serves when a navigation cannot reach the
 * network. It is precached on install, so it must not depend on anything the
 * network provides - no layout fetches, no API calls at render time.
 */
export default function OfflinePage() {
  return <OfflineView />;
}
