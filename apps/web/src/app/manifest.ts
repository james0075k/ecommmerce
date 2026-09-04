import type { MetadataRoute } from 'next';

/**
 * The web app manifest, served at /manifest.webmanifest.
 *
 * `theme_color` matches the dark surface the app opens on, so the Android
 * status bar and the splash screen are the same colour as the first paint
 * rather than flashing white in between.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Bazaar — Everything you need, delivered across Nepal',
    short_name: 'Bazaar',
    description:
      'Shop electronics, fashion and home essentials with delivery to all 77 districts of Nepal.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0B0E1A',
    theme_color: '#0B0E1A',
    categories: ['shopping', 'lifestyle'],
    lang: 'en-NP',
    dir: 'ltr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A maskable icon is padded so a launcher can crop it to any shape
      // without clipping the mark.
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Browse products', url: '/products' },
      { name: 'Your orders', url: '/orders' },
      { name: 'Wishlist', url: '/wishlist' },
    ],
  };
}
