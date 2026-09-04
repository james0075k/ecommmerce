'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMotionValueEvent, useScroll } from 'framer-motion';
import { Heart, LogOut, Menu, Package, Search, User } from 'lucide-react';

import { CartButton } from '@/components/layout/cart-button';
import { MegaMenu } from '@/components/layout/mega-menu';
import { MobileMenu } from '@/components/layout/mobile-menu';
import { SearchOverlay } from '@/components/layout/search-overlay';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { useWishlistStore } from '@/lib/store/wishlist-store';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/products', label: 'Shop' },
  { href: '/products?sort=newest', label: 'New in' },
  { href: '/products?sort=popular', label: 'Popular' },
];

/** Only the homepage has a hero dark enough to carry a transparent navbar. */
const OVERLAY_ROUTES = new Set(['/']);

/**
 * The storefront navbar, mounted once by the (shop) layout.
 *
 * It is `fixed` rather than `sticky` so it can sit over the homepage hero.
 * Every other route gets an explicit spacer element instead of the layout
 * carrying a top padding it would have to know about.
 *
 * Above the fold on the homepage the bar is transparent with white controls;
 * past 24px it fades to the blurred surface used everywhere else. The state is
 * driven by a motion value subscription rather than a scroll listener, so the
 * common case - scrolling with the state unchanged - never touches React.
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

  // Cmd/Ctrl+K is what people already press; making them find the icon first
  // would be the only way to search on a keyboard.
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

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300',
          overlay
            ? 'border-b border-transparent bg-transparent text-white'
            : 'border-b border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70',
          scrolled && !overlay && 'shadow-card',
        )}
      >
        <div className="container-bazaar flex h-14 items-center gap-1 md:gap-3">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'lg:hidden',
              overlay && 'text-white hover:bg-white/15 hover:text-white',
            )}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          <Link
            href="/"
            className="font-display mr-1 shrink-0 text-lg font-extrabold tracking-tight"
          >
            Bazaar
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
            <MegaMenu overlay={overlay} />
            {NAV_LINKS.map((link) => (
              <Button
                key={link.label}
                asChild
                variant="ghost"
                size="sm"
                className={cn(overlay && 'text-white hover:bg-white/15 hover:text-white')}
              >
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-1.5">
            <Button
              variant={overlay ? 'ghost' : 'outline'}
              size="icon"
              onClick={() => setSearchOpen(true)}
              aria-label="Search products"
              className={cn(overlay && 'text-white hover:bg-white/15 hover:text-white')}
            >
              <Search className="size-4" />
            </Button>

            <Button
              asChild
              variant={overlay ? 'ghost' : 'outline'}
              size="icon"
              className={cn(
                'hidden sm:inline-flex',
                overlay && 'text-white hover:bg-white/15 hover:text-white',
              )}
              aria-label="Wishlist"
            >
              <Link href="/wishlist">
                <Heart className="size-4" />
              </Link>
            </Button>

            <CartButton overlay={overlay} />

            <ThemeToggle overlay={overlay} />

            {/* `ready` guards the flash of a logged-out state while the silent
                refresh is still in flight. */}
            {!ready ? null : user ? (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label="Your orders"
                  className={cn(
                    'hidden md:inline-flex',
                    overlay && 'text-white hover:bg-white/15 hover:text-white',
                  )}
                >
                  <Link href="/orders">
                    <Package className="size-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label="Your account"
                  className="relative"
                >
                  <Link href="/account">
                    {user.avatarUrl ? (
                      // Not next/image: an avatar is 28px, already sized, and
                      // comes from an origin the image optimiser is not
                      // configured for.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        className="size-7 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid size-7 place-items-center rounded-full bg-primary-solid text-[11px] font-semibold text-primary-foreground"
                      >
                        {initialsOf(user.fullName)}
                      </span>
                    )}
                  </Link>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Log out"
                  className={cn(
                    'hidden md:inline-flex',
                    overlay && 'text-white hover:bg-white/15 hover:text-white',
                  )}
                  onClick={async () => {
                    await logout();
                    // The next account must not inherit this one's saved items.
                    resetWishlist();
                    router.push('/');
                    router.refresh();
                  }}
                >
                  <LogOut className="size-4" />
                </Button>
              </>
            ) : (
              <Button
                asChild
                size="sm"
                className={cn(overlay && 'bg-white text-[#1A1A2E] hover:bg-white/90')}
              >
                <Link href="/login">
                  <User className="size-3.5 sm:hidden" />
                  <span className="hidden sm:inline">Log in</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* The homepage hero starts at y=0 behind the bar; every other route needs
          the height back. */}
      {canOverlay ? null : <div className="h-14 shrink-0" aria-hidden />}

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

/** First and last initial, falling back to a dot rather than an empty circle. */
function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}
