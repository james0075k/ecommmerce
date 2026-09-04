'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';

import { useAuthStore } from '@/lib/store/auth-store';
import { selectCartCount, useCartStore } from '@/lib/store/cart-store';
import { cn } from '@/lib/utils';

/**
 * Routes that own the bottom of the screen themselves.
 *
 * Checkout ends every step with a full-width primary action pinned to the
 * bottom; a navigation bar underneath it would put "Continue" and "Home" a
 * thumb's width apart at the exact moment a mis-tap costs an order.
 */
const HIDDEN_ON = [/^\/checkout/, /^\/admin/];

const TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/categories', label: 'Categories', icon: LayoutGrid },
  { href: '/cart', label: 'Cart', icon: ShoppingBag },
  { href: '/account', label: 'Account', icon: User },
] as const;

/**
 * The mobile bottom navigation bar (Phase 11).
 *
 * Hidden from `lg` up by CSS rather than by a media-query hook, so it is in the
 * server-rendered HTML at the right size from the first paint - a bar that
 * appears on hydration is a layout shift at the bottom of the viewport, which
 * is the worst place to have one.
 *
 * The bar sits above the iOS home indicator via `env(safe-area-inset-bottom)`,
 * and the `(shop)` layout pads the footer by the same amount, so the last row
 * of any page is never trapped underneath it.
 */
export function BottomNav() {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  const user = useAuthStore((state) => state.user);
  const authReady = useAuthStore((state) => state.ready);
  const cartCount = useCartStore(selectCartCount);
  const cartReady = useCartStore((state) => state.ready);

  if (HIDDEN_ON.some((pattern) => pattern.test(pathname))) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {TABS.map((tab) => {
          // An unauthenticated shopper tapping Account should land on the login
          // form, not on a page that redirects them there a moment later.
          const href =
            tab.href === '/account' && authReady && !user ? '/login?next=/account' : tab.href;

          const active = isActive(pathname, tab.href);
          const badge = tab.href === '/cart' && cartReady ? cartCount : 0;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={
                  badge > 0 ? `${tab.label}, ${badge} item${badge === 1 ? '' : 's'}` : undefined
                }
                className={cn(
                  'relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1 text-[11px] font-medium transition-colors duration-200',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {/* The indicator is one element that moves between tabs rather
                    than four that fade, so the eye follows it across. */}
                {active ? (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    aria-hidden
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary-solid"
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                  />
                ) : null}

                <span className="relative">
                  <tab.icon
                    className={cn(
                      'size-5 transition-transform duration-200',
                      active && 'scale-110 motion-reduce:scale-100',
                    )}
                    aria-hidden
                  />

                  {badge > 0 ? (
                    <span
                      aria-hidden
                      className="numeric absolute -top-1.5 -right-2 grid min-w-4 place-items-center rounded-full bg-primary-solid px-1 text-[10px] leading-4 font-semibold text-primary-foreground"
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  ) : null}
                </span>

                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Home matches only itself; every other tab also owns its sub-routes, so a
 * product page keeps Categories lit rather than dropping the highlight
 * entirely once the shopper is one level deep.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/categories') {
    return pathname.startsWith('/categories') || pathname.startsWith('/products');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
