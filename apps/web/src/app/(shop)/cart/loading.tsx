import { Skeleton } from '@/components/ui/skeleton';

/**
 * The cart's own view renders a skeleton once its store is hydrating; this one
 * covers the gap before that component has even been fetched, which on a cold
 * navigation over a slow connection is the longer half.
 */
export default function CartLoading() {
  return (
    <div className="container-bazaar max-w-5xl py-6 md:py-8">
      <Skeleton className="bz-shimmer mb-5 h-8 w-40" />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="bz-shimmer h-32 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="bz-shimmer h-64 w-full rounded-md" />
      </div>

      <span className="sr-only" role="status">
        Loading your cart
      </span>
    </div>
  );
}
