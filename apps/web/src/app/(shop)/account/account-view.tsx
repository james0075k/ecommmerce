'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, MapPin, ShieldCheck, User } from 'lucide-react';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { AddressesTab } from '@/components/account/addresses-tab';
import { ProfileTab } from '@/components/account/profile-tab';
import { SecurityTab } from '@/components/account/security-tab';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'addresses', label: 'Addresses', icon: MapPin },
  { id: 'security', label: 'Security', icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * Sidebar navigation on desktop, a bottom-anchored tab bar on mobile.
 *
 * Middleware already blocks signed-out visitors, so the loading state here only
 * covers the moment before the refresh cookie is exchanged for a session.
 */
export function AccountView() {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>('profile');
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);
  const logout = useAuthStore((state) => state.logout);

  if (!ready) return <AccountSkeleton />;

  if (!user) {
    return (
      <div className="container-bazaar flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">Your session has ended.</p>
        <Button asChild>
          <Link href="/login?next=/account">Log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container-bazaar flex h-14 items-center justify-between gap-4">
          <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
            Bazaar
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                router.push('/login');
                router.refresh();
              }}
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container-bazaar py-8 pb-24 md:pb-12">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">Your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{user.email}</span>
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          {/* Desktop sidebar */}
          <nav aria-label="Account sections" className="hidden lg:block">
            <ul className="space-y-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setTab(id)}
                    aria-current={tab === id ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      tab === id
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            {tab === 'profile' ? <ProfileTab /> : null}
            {tab === 'addresses' ? <AddressesTab /> : null}
            {tab === 'security' ? <SecurityTab /> : null}
          </div>
        </div>
      </main>

      {/* Mobile tab bar - fixed so the active section is always one tap away. */}
      <nav
        aria-label="Account sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
      >
        <ul className="grid grid-cols-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={cn(
                  'flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                  tab === id ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="container-bazaar py-12">
      <Skeleton className="bz-shimmer h-8 w-48" />
      <Skeleton className="bz-shimmer mt-2 h-4 w-64" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <Skeleton className="bz-shimmer hidden h-32 lg:block" />
        <Skeleton className="bz-shimmer h-96" />
      </div>
    </div>
  );
}
