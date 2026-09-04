import * as React from 'react';
import type { Metadata } from 'next';

import { Skeleton } from '@/components/ui/skeleton';
import { AdminCustomersView } from './customers-view';

export const metadata: Metadata = {
  title: 'Customers',
  description: 'Everyone with a Bazaar account, and what they are worth.',
};

/**
 * The view reads its sort from the URL - `useSearchParams` opts a component
 * out of prerendering, so it needs a Suspense boundary or the build fails on
 * this page. The fallback is the table's own skeleton rather than nothing, so
 * the prerendered HTML is the shape of the page rather than a blank.
 */
export default function AdminCustomersPage() {
  return (
    <React.Suspense fallback={<CustomersSkeleton />}>
      <AdminCustomersView />
    </React.Suspense>
  );
}

function CustomersSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
