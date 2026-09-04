import type { Metadata } from 'next';

import { WishlistView } from './wishlist-view';

export const metadata: Metadata = {
  title: 'Your wishlist',
  description: 'Items you have saved for later, with price-drop alerts.',
  // J2: a personal page has nothing to offer a search engine.
  robots: { index: false, follow: false },
};

export default function WishlistPage() {
  return <WishlistView />;
}
