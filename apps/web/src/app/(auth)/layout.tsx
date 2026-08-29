import Link from 'next/link';

import { ThemeToggle } from '@/components/layout/theme-toggle';

/**
 * Centred single-column shell for every auth screen.
 * Mobile: the card goes full-bleed so inputs get the whole width.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="container-bazaar flex h-14 items-center justify-between">
          <Link
            href="/"
            className="font-display text-lg font-extrabold tracking-tight transition-opacity hover:opacity-70"
          >
            Bazaar
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="container-bazaar flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Bazaar</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
