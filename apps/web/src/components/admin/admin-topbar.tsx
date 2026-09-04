'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LogOut,
  Menu,
  Search,
  Ticket,
  User,
  Users,
  Boxes,
  ReceiptText,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdminSearchHit } from '@bazaar/shared';
import { EASE_OUT_EXPO } from '@bazaar/ui';

import { NotificationBell } from '@/components/admin/notification-bell';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { adminApi, adminKeys } from '@/lib/admin';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';

const HIT_ICONS: Record<AdminSearchHit['type'], LucideIcon> = {
  order: ReceiptText,
  product: Boxes,
  customer: Users,
  coupon: Ticket,
};

const HIT_LABELS: Record<AdminSearchHit['type'], string> = {
  order: 'Order',
  product: 'Product',
  customer: 'Customer',
  coupon: 'Coupon',
};

export function AdminTopbar({ onOpenNav }: { onOpenNav: () => void }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch {
      toast.error('Could not sign out. Try again.');
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-4">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="ml-1 rounded-full ring-offset-background transition-opacity hover:opacity-85"
            >
              <Avatar className="size-8">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-xs font-semibold">
                  {initialsOf(user?.fullName)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-semibold">{user?.fullName ?? 'Signed in'}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              {user?.role ? (
                <p className="mt-1 inline-block rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent-foreground uppercase">
                  {user.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
                </p>
              ) : null}
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/account">
                <User className="size-4" aria-hidden />
                My profile
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem variant="destructive" onSelect={() => void handleLogout()}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/**
 * The top bar's search.
 *
 * One box across orders, products, customers and coupons, because an operator
 * with an order number on a sticky note does not want to first decide which
 * table it belongs to. Results are grouped by type in the dropdown so the
 * answer is still legible when a term matches several.
 *
 * Debounced at 250ms and gated at two characters: a single letter matches
 * essentially everything and the query is four ILIKE scans.
 */
function GlobalSearch() {
  const [term, setTerm] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const enabled = debounced.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: adminKeys.search(debounced),
    queryFn: () => adminApi.search(debounced),
    enabled,
    staleTime: 30_000,
  });

  const hits = enabled ? (data?.hits ?? []) : [];

  React.useEffect(() => setHighlighted(0), [debounced]);

  // Closes on a click anywhere else. `pointerdown` rather than `click` so the
  // panel is gone before a click on the page behind it lands.
  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // "/" focuses the box the way it does in most tools an operator already uses,
  // but not while they are typing in another field.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;

      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (typing) return;

      event.preventDefault();
      inputRef.current?.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const router = useRouter();

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (hits.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      const hit = hits[highlighted];
      if (hit) {
        event.preventDefault();
        setOpen(false);
        setTerm('');
        router.push(hit.href);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <label htmlFor="admin-search" className="sr-only">
        Search orders, products, customers and coupons
      </label>

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={inputRef}
          id="admin-search"
          type="search"
          role="combobox"
          aria-expanded={open && enabled}
          aria-controls="admin-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search orders, products, customers…"
          className="h-9 w-full rounded-md border border-border bg-muted/40 pr-9 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background"
        />

        {isFetching ? (
          <Loader2
            className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : (
          <kbd className="absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground sm:block">
            /
          </kbd>
        )}
      </div>

      <AnimatePresence>
        {open && enabled ? (
          <motion.div
            id="admin-search-results"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className="absolute top-full left-0 z-50 mt-1.5 w-full overflow-hidden rounded-md border border-border bg-popover shadow-float"
          >
            {hits.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {isFetching ? 'Searching…' : `Nothing matches “${debounced}”.`}
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {hits.map((hit, index) => {
                  const Icon = HIT_ICONS[hit.type];

                  return (
                    <li key={`${hit.type}-${hit.id}`}>
                      <Link
                        href={hit.href}
                        role="option"
                        aria-selected={index === highlighted}
                        onMouseEnter={() => setHighlighted(index)}
                        onClick={() => {
                          setOpen(false);
                          setTerm('');
                        }}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                          index === highlighted ? 'bg-muted' : 'hover:bg-muted',
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />

                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{hit.title}</span>
                          {hit.subtitle ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </span>
                          ) : null}
                        </span>

                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                          {HIT_LABELS[hit.type]}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function initialsOf(fullName: string | undefined): string {
  if (!fullName) return 'BZ';

  return fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
