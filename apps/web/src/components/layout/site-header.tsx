'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMotionValueEvent, useScroll } from 'framer-motion';
import { Menu, Search } from 'lucide-react';

import { CartButton } from '@/components/layout/cart-button';
import { MegaMenu } from '@/components/layout/mega-menu';
import { MobileMenu } from '@/components/layout/mobile-menu';
import { SearchOverlay } from '@/components/layout/search-overlay';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Wordmark } from '@/components/layout/wordmark';
import { useAuthStore } from '@/lib/store/auth-store';
import { useWishlistStore } from '@/lib/store/wishlist-store';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/products?sort=newest', label: 'New in' },
  { href: '/products?sort=popular', label: 'Popular' },
];

/** Only the homepage has a hero image dark enough to carry a transparent bar. */
const OVERLAY_ROUTES = new Set(['/']);

/**
 * The storefront navbar, mounted once by the (shop) layout.
 *
 * Three grid columns rather than a flex row: the navigation is left, the
 * actions are right, and the wordmark is centred by the grid rather than by
 * whatever the two sides happen to weigh. Adding a link on the left would
 * otherwise drag the brand off centre, which is the failure mode of every
 * flexbox navbar with a logo in the middle.
 *
 * It is `sticky` rather than `fixed`, so the announcement strip above it can
 * scroll away while the bar stays. The homepage hero pulls up underneath it
 * with a negative margin; every other route simply starts below it.
 *
 * Above the fold on the homepage the bar is transparent with white controls;
 * past 24px it settles onto the page ground. The state comes from a motion
 * value subscription rather than a scroll listener, so the common case -
 * scrolling with the state unchanged - never touches React.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const logout = useAuthStore((state) => state.logout);
  const resetWishlist = useWishlistStore((state) => state.reset);

  const [scrolled, setScrolled] = React.useState(false);

  // Both layers are stored with the route they were opened on. A navigation
  // then closes them by derivation rather than by an effect that fires on every
  // pathname change - which is the same result without the extra render pass.
  const [layer, setLayer] = React.useState<{
    menu: boolean;
    search: boolean;
    path: string;
  }>({ menu: false, search: false, path: pathname });

  if (layer.path !== pathname && (layer.menu || layer.search)) {
    setLayer({ menu: false, search: false, path: pathname });
  }

  const menuOpen = layer.menu && layer.path === pathname;
  const searchOpen = layer.search && layer.path === pathname;

  const setMenuOpen = React.useCallback(
    (open: boolean) => setLayer((current) => ({ ...current, menu: open, path: pathname })),
    [pathname],
  );
  const setSearchOpen = React.useCallback(
    (open: boolean) => setLayer((current) => ({ ...current, search: open, path: pathname })),
    [pathname],
  );

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (value) => {
    const next = value > 24;
    setScrolled((current) => (current === next ? current : next));
  });

  const canOverlay = OVERLAY_ROUTES.has(pathname);
  const overlay = canOverlay && !scrolled && !menuOpen && !searchOpen;

  // Cmd/Ctrl+K is what people already press; making them find the control
  // first would be the only way to search on a keyboard.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen]);

  // One class for every text control in the bar. None of them has a box around
  // it - the label is the target - so the shared part is the label treatment,
  // the underline and the two colour states.
  const item = cn(
    'bz-label bz-underline inline-flex cursor-pointer items-center py-1.5 transition-colors duration-[260ms]',
    overlay ? 'text-white/85 hover:text-white' : 'text-muted-foreground hover:text-foreground',
  );

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          overlay
            ? 'border-b border-transparent bg-transparent text-white'
            : 'border-b border-border bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70',
        )}
      >
        {/* Wider than `container-bazaar` on purpose: the bar tracks the edges
            of the inset panel below it, not the 1440px reading column. */}
        <div className="mx-auto grid h-16 w-full max-w-[1720px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 md:h-20 md:px-8 lg:px-10">
          {/* --- Navigation ------------------------------------------------ */}
          <nav aria-label="Main" className="flex items-center gap-6 lg:gap-8">
            <button
              type="button"
              data-slot="nav-control"
              className={cn(item, 'lg:hidden')}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-5" aria-hidden />
            </button>

            <div className="hidden items-center gap-6 lg:flex lg:gap-8">
              <MegaMenu overlay={overlay} />
              {NAV_LINKS.map((link) => (
                <Link key={link.label} href={link.href} className={item}>
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* --- Wordmark --------------------------------------------------- */}
          <Link
            href="/"
            aria-label="Bazaar, home"
            className="justify-self-center transition-opacity duration-[260ms] hover:opacity-70"
          >
            {/* `leading-none` after the size on purpose: a font-size utility
                clears any line-height set before it, so the component's own
                one would be merged away. */}
            <Wordmark className="text-[1.15rem] leading-none tracking-[-0.03em] md:text-[1.4rem]" />
          </Link>

          {/* --- Actions ---------------------------------------------------- */}
          <div className="flex items-center justify-end gap-5 lg:gap-7">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              data-slot="nav-control"
              className={cn(item, 'max-lg:justify-center')}
              aria-label="Search products"
            >
              <Search className="size-5 lg:hidden" aria-hidden />
              <span className="hidden lg:inline">Search</span>
            </button>

            <Link href="/wishlist" className={cn(item, 'hidden lg:inline-flex')}>
              Saved
            </Link>

            {/* `ready` guards the flash of a logged-out state while the silent
                refresh is still in flight. */}
            {!ready ? null : user ? (
              <Link
                href="/account"
                className={cn(item, 'hidden lg:inline-flex')}
                title={user.fullName}
              >
                Account
              </Link>
            ) : (
              <Link href="/login" className={cn(item, 'hidden lg:inline-flex')}>
                Log in
              </Link>
            )}

            <CartButton overlay={overlay} />

            {ready && user ? (
              <button
                type="button"
                className={cn(item, 'hidden lg:inline-flex')}
                onClick={async () => {
                  await logout();
                  // The next account must not inherit this one's saved items.
                  resetWishlist();
                  router.push('/');
                  router.refresh();
                }}
              >
                Log out
              </button>
            ) : null}

            <ThemeToggle overlay={overlay} />
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
