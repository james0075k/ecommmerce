import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';

import { Providers } from '@/components/providers/providers';

import './globals.css';

/* Part H1 type stack. `display: swap` keeps CLS under the J1 budget of 0.05. */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Bazaar - Everything you need, delivered across Nepal',
    template: '%s | Bazaar',
  },
  description:
    'Shop electronics, fashion and home essentials with fast delivery across all 77 districts. Pay with eSewa, Khalti, card or cash on delivery.',
  applicationName: 'Bazaar',
  keywords: ['ecommerce', 'Nepal', 'online shopping', 'eSewa', 'Khalti', 'delivery'],
  openGraph: {
    type: 'website',
    siteName: 'Bazaar',
    locale: 'en_NP',
    url: siteUrl,
  },
  twitter: { card: 'summary_large_image' },
  // J2: cart, checkout and admin stay out of the index.
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches --bz-bg in both themes so the mobile browser chrome blends in.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAFBFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0E1A' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning is required: next-themes writes the theme class
    // on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
