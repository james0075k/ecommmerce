'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminTopbar } from '@/components/admin/admin-topbar';
import { adminApi, adminKeys } from '@/lib/admin';

/**
 * The frame every admin page renders inside.
 *
 * A client component because the sidebar's collapsed state, the mobile drawer
 * and the notification socket all live here - but it is mounted from a server
 * layout, so the pages it wraps are free to be server components if they have
 * no reason not to be.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // The unread badge on Messages. Polled slowly rather than pushed: an unread
  // contact form is not urgent the way an order is, and a socket event per
  // submission would be a channel opened for a number that changes twice a day.
  const { data: counts } = useQuery({
    queryKey: adminKeys.contacts.counts,
    queryFn: adminApi.contactCounts,
    refetchInterval: 300_000,
    staleTime: 120_000,
  });

  return (
    <div className="flex min-h-dvh bg-background">
      <AdminSidebar
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
        messageCount={counts?.NEW ?? 0}
      />

      {/* `min-w-0` is what stops a wide data table from pushing the whole
          layout sideways instead of scrolling inside its own container. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onOpenNav={() => setMobileNavOpen(true)} />
        <main id="main" className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
