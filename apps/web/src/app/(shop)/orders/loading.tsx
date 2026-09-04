import { Skeleton } from '@/components/ui/skeleton';

/** Order history: a heading, the status filter row, then four order cards. */
export default function OrdersLoading() {
  return (
    <div className="container-bazaar max-w-4xl py-8">
      <Skeleton className="bz-shimmer mb-6 h-9 w-48" />

      <div className="mb-6 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="bz-shimmer h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>

      <div className="space-y-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="bz-shimmer h-36 w-full rounded-md" />
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading your orders
      </span>
    </div>
  );
}
