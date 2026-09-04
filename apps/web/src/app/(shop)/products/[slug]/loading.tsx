import { ProductGridSkeleton } from '@/components/shop/product-grid-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The product page's streamed placeholder (Phase 11).
 *
 * Mirrors the two-column detail layout exactly: a square gallery on the left, a
 * title/price/variant/button stack on the right, and the related rail below. A
 * placeholder that does not match its content moves the page when it resolves,
 * and on the route that carries the LCP element that is the one place a shift
 * costs the most.
 */
export default function ProductLoading() {
  return (
    <div className="container-bazaar py-6 md:py-10">
      <Skeleton className="bz-shimmer mb-6 h-4 w-64" />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="bz-shimmer aspect-square w-full rounded-lg" />
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="bz-shimmer aspect-square rounded-md" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Skeleton className="bz-shimmer h-4 w-24" />
          <Skeleton className="bz-shimmer h-9 w-4/5" />
          <Skeleton className="bz-shimmer h-4 w-40" />
          <Skeleton className="bz-shimmer h-10 w-48" />
          <Skeleton className="bz-shimmer h-20 w-full" />
          <Skeleton className="bz-shimmer h-12 w-full" />
          <Skeleton className="bz-shimmer h-12 w-full" />
        </div>
      </div>

      <div className="mt-14 space-y-4">
        <Skeleton className="bz-shimmer h-7 w-52" />
        <ProductGridSkeleton count={4} />
      </div>

      <span className="sr-only" role="status">
        Loading product
      </span>
    </div>
  );
}
