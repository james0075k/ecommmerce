'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Boxes,
  ChevronLeft,
  LayoutDashboard,
  Mail,
  ReceiptText,
  ScrollText,
  Settings,
  Store,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { EASE_DRAWER } from '@bazaar/ui';

import { cn } from '@/lib/utils';

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matched as a prefix, so /admin/products/new keeps Products highlighted. */
  exact?: boolean;
}

const SECTIONS: ReadonlyArray<{ title: string; links: readonly NavLink[] }> = [
  {
    title: 'Overview',
    links: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Commerce',
    links: [
      { href: '/admin/orders', label: 'Orders', icon: ReceiptText },
      { href: '/admin/products', label: 'Products', icon: Boxes },
      { href: '/admin/coupons', label: 'Coupons', icon: Ticket },
      { href: '/admin/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    title: 'Store',
    links: [
      { href: '/admin/contacts', label: 'Messages', icon: Mail },
      { href: '/admin/activity', label: 'Activity log', icon: ScrollText },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const COLLAPSED_KEY = 'bz-admin-sidebar-collapsed';

interface AdminSidebarProps {
  /** Mobile drawer state, owned by the shell so the top bar can open it. */
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  /** Unread contact messages, badged next to Messages. */
  messageCount?: number;
}

/**
 * The admin panel's navigation.
 *
 * Always dark, in both themes. That is not a styling accident: the sidebar is
 * chrome an operator's eye should skip over on the way to the data, and a rail
 * that inverts against the content is the cheapest way to make the content read
 * as the figure and the navigation as the ground. The theme toggle still
 * controls everything to the right of it.
 *
 * Below `lg` it becomes a drawer rather than collapsing to icons - a 64px rail
 * on a 375px screen is a quarter of the width spent on something that is not
 * the table you came to read.
 */
export function AdminSidebar({
  mobileOpen,
  onMobileOpenChange,
  messageCount = 0,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  // Read after mount rather than during render: localStorage does not exist on
  // the server, and reading it in a lazy initialiser makes the first client
  // render disagree with the server's and trips a hydration error.
  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // Private browsing, or storage disabled. The default is fine.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Not worth surfacing - the preference simply will not persist.
      }
      return next;
    });
  };

  // Any navigation closes the drawer. Without this, tapping a link on mobile
  // routes behind an overlay that is still covering the page.
  React.useEffect(() => {
    onMobileOpenChange(false);
  }, [pathname]);

  const nav = (
    <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-3 py-4">
      {SECTIONS.map((section) => (
        <div key={section.title} className="mb-6 last:mb-0">
          <p
            className={cn(
              'mb-2 px-2 text-[10px] font-semibold tracking-widest text-slate-500 uppercase',
              collapsed && 'lg:sr-only',
            )}
          >
            {section.title}
          </p>

          <ul className="space-y-0.5">
            {section.links.map((link) => {
              const active = link.exact
                ? pathname === link.href
                : pathname.startsWith(link.href);
              const Icon = link.icon;
              const badge = link.href === '/admin/contacts' ? messageCount : 0;

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? link.label : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/15 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                      collapsed && 'lg:justify-center lg:px-2',
                    )}
                  >
                    {/* The active marker is a rail rather than a background
                        change alone, so it survives being read at a glance. */}
                    {active ? (
                      <motion.span
                        layoutId="admin-nav-active"
                        className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                        transition={{ duration: 0.25, ease: EASE_DRAWER }}
                        aria-hidden
                      />
                    ) : null}

                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className={cn('flex-1 truncate', collapsed && 'lg:hidden')}>
                      {link.label}
                    </span>

                    {badge > 0 ? (
                      <span
                        className={cn(
                          'rounded-full bg-sale px-1.5 py-0.5 text-[10px] font-bold text-white',
                          collapsed && 'lg:absolute lg:top-1 lg:right-1 lg:px-1 lg:py-0',
                        )}
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-3">
      <Link
        href="/"
        className={cn(
          'flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100',
          collapsed && 'lg:justify-center lg:px-2',
        )}
        title={collapsed ? 'View storefront' : undefined}
      >
        <Store className="size-4 shrink-0" aria-hidden />
        <span className={cn(collapsed && 'lg:hidden')}>View storefront</span>
      </Link>
    </div>
  );

  return (
    <>
      {/* --- Desktop rail ------------------------------------------------- */}
      <aside
        data-collapsed={collapsed}
        className={cn(
          'hidden shrink-0 flex-col border-r border-white/10 bg-[#0b0e1a] transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b border-white/10 px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          <Link
            href="/admin/dashboard"
            className={cn(
              'font-display text-lg font-medium tracking-tight text-white',
              collapsed && 'sr-only',
            )}
          >
            Bazaar
            <span className="ml-1.5 align-middle text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
              Admin
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <ChevronLeft
              className={cn('size-4 transition-transform', collapsed && 'rotate-180')}
              aria-hidden
            />
          </button>
        </div>

        {nav}
        {footer}
      </aside>

      {/* --- Mobile drawer ------------------------------------------------ */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.button
              type="button"
              aria-label="Close navigation"
              onClick={() => onMobileOpenChange(false)}
              className="absolute inset-0 bg-black"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 0.5, transition: { duration: 0.25 } },
                exit: { opacity: 0, transition: { duration: 0.2 } },
              }}
            />

            <motion.div
              className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[#0b0e1a] shadow-float"
              variants={{
                hidden: { x: '-100%' },
                visible: { x: 0, transition: { duration: 0.3, ease: EASE_DRAWER } },
                exit: { x: '-100%', transition: { duration: 0.2, ease: 'easeIn' } },
              }}
            >
              <div className="flex h-14 items-center justify-between border-b border-white/10 px-3">
                <span className="font-display text-lg font-medium tracking-tight text-white">
                  Bazaar
                  <span className="ml-1.5 align-middle text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
                    Admin
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onMobileOpenChange(false)}
                  aria-label="Close navigation"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              {nav}
              {footer}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
