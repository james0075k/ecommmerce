import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass, Home, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * The 404 page (Phase 12.10).
 *
 * It renders inside the root layout rather than the (shop) shell, so there is
 * no header or footer here - the links below are the whole navigation, which is
 * why they are the three a lost visitor actually wants rather than a generic
 * "go back".
 *
 * A 404 is usually a mistyped URL or a product that has been archived. Both are
 * recoverable if the page offers a way onward, and neither is if it offers an
 * apology.
 */
export const metadata: Metadata = {
  title: 'Page not found',
  // Nothing here is worth indexing, and a 404 that ranks is a 404 that gets
  // more traffic.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main
      id="main"
      className="grid min-h-dvh place-items-center bg-background px-4 py-16 text-center"
    >
      <div className="max-w-md space-y-6">
        <p className="bz-display numeric text-7xl text-muted-foreground sm:text-8xl">
          404
        </p>

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl">
            We could not find that page
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            The link may be out of date, or the product may have been archived. The
            catalogue is still here.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href="/">
              <Home className="size-4" />
              Home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/products">
              <Search className="size-4" />
              Browse products
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/categories">
              <Compass className="size-4" />
              Categories
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
